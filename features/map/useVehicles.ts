import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { repeat } from '../../lib/schedule';
import { adherenceOf } from './adherence';
import type { ApiFailure, Fleet, TheBusClient, Vehicle } from '../../data/thebus';

/**
 * The buses actually driving a route right now.
 *
 * One request returns every vehicle on Oahu — 1,184 of them, 333 KB — and most
 * of that is dead. Roughly 950 last reported years ago and carry entirely
 * plausible Oahu coordinates, so unlike the `"0"`/`"0"` sentinel, which lands
 * visibly in the Gulf of Guinea, they plot as buses sitting on real streets.
 * **Filtering on freshness is the feature, not hardening.** Without it the map
 * draws about 1,100 ghosts parked since 2022.
 */

/**
 * How recently a bus must have reported to be drawn.
 *
 * Nearly judgement-free, from the 2026-08-02 daytime sample: **232 of 235 live
 * buses reported within five minutes, and the next-freshest was over ten hours
 * old.** The distribution is bimodal with nothing in between, so this threshold
 * could move by minutes in either direction without changing what is drawn.
 */
export const FRESH_MS = 5 * 60_000;

/** Buses report about once a minute, and the vendor polls its AVL on a similar
 *  cycle. The same interval and the same reasoning as `useArrivals`. */
export const VEHICLE_POLL_MS = 60_000;

/**
 * How often ages are recomputed between polls.
 *
 * **Not once a second, and that is a real constraint rather than a preference.**
 * iOS renders a custom marker view to a bitmap and re-renders it whenever the
 * view changes; a label ticking every second re-snapshots every bus on screen
 * every second, which is the documented way to make a map with custom markers
 * unusable (see `StopMarker`). One tick drives both the label and the freshness
 * filter, so a bus that goes stale between polls still leaves the map without
 * waiting for the next fetch — which is what makes a failed fetch need no
 * special case at all.
 */
export const AGE_TICK_MS = 30_000;

/** A bus, and how old its position is *right now* rather than when it arrived. */
export type BusOnMap = {
  readonly vehicle: Vehicle;
  readonly ageMs: number;
};

export type VehiclesView = {
  /** Fresh, on this route, oldest report last. Empty when no route is showing. */
  readonly buses: readonly BusOnMap[];
  readonly failure: ApiFailure | null;
  /** Device clock when the fleet arrived. Null until the first success. */
  readonly fetchedAt: Date | null;
  /**
   * How many of `buses` are running behind, for the line in the route band.
   *
   * Counted here rather than in the sheet so the ring on the dot and the
   * number in the words cannot disagree — they read one `adherenceOf`.
   */
  readonly lateCount: number;
};

/**
 * How old a bus's report is, measured so that device clock skew cancels.
 *
 * Both terms are differences within a single clock: `now − fetchedAt` on the
 * device, and `serverTime − lastMessage` on the server. Subtracting a server
 * instant from a device instant directly would put a phone four minutes fast
 * four minutes closer to the freshness cliff. `serverClockOffset` in
 * `features/arrivals/format.ts` is the same idea stated for countdowns.
 */
export function ageOf(vehicle: Vehicle, fleet: Fleet, fetchedAt: Date, now: Date): number {
  const sinceFetch = now.getTime() - fetchedAt.getTime();
  const atFetch = fleet.serverTime.getTime() - vehicle.lastMessage.getTime();
  return Math.max(0, sinceFetch + atFetch);
}

/** Route numbers are strings — `1L`, `A LINE`, `C` — and the two sides disagree on case. */
export function sameRoute(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Which way the map is looking, in the only terms the fleet feed speaks.
 *
 * **A vehicle carries no direction at all** — only a `headsign`, the sign on
 * the front of the bus — so this is the whole basis for telling one way of a
 * route from the other. Geometry cannot stand in: both directions of most Oahu
 * routes run the same streets, so a bus is on the line either way. It is why
 * the map drew both directions' buses until Increment 9, and why a Route 2 bus
 * signed `WAIKIKI` appeared a block off a line headed for Kalihi. The position
 * was right; the bus was simply the other way's.
 *
 * **Two lists, because "the other direction's" and "not in the feed at all"
 * are different facts and only the first is a reason to hide a bus.** GTFS is
 * reference data that can be weeks stale, and a headsign this app has never
 * heard of is the app's ignorance rather than the bus's. So `known` is every
 * sign the route runs under, either way, and a headsign outside it draws.
 */
export type DirectionFilter = {
  /** Headsigns of the direction currently drawn. Several — route 2 has five. */
  readonly showing: readonly string[];
  /** Every headsign this route runs under, both directions together. */
  readonly known: readonly string[];
};

/**
 * Whether a bus signed `headsign` belongs on the map right now.
 *
 * Exact string equality, in both lists: GTFS `trip_headsign` and the fleet
 * feed's `headsign` are byte-identical (`KAHAUIKI KALIHI TRANSIT CNTR SKYLINE
 * STN` appears verbatim in both), so there is nothing to normalise, and a
 * future divergence in case or spacing degrades to *unknown* — every bus drawn,
 * which is exactly where this started — rather than to an empty map.
 *
 * Twelve routes sign both directions the same way, because a short-turn gets a
 * generic sign and a street name has no direction. Those headsigns are in
 * `showing` for both directions, so their buses draw both ways: today's
 * behaviour, on 4.00% of trips, accepted rather than guessed at.
 */
export function drawsInDirection(
  filter: DirectionFilter | null,
  headsign: string | null,
): boolean {
  if (filter === null) return true;
  // A direction the feed signed no way at all cannot exclude anything, and
  // `RouteDirection.headsigns` documents empty as *cannot tell*. Without this
  // the rule below would hide every bus the feed *does* recognise — an empty
  // map, which is the one outcome this filter must never produce. Unreachable
  // on the current asset, where all 236 drawable directions are signed.
  if (filter.showing.length === 0) return true;
  // A bus that told us nothing cannot be attributed, and hiding it would be a
  // claim rather than a filter.
  if (headsign === null) return true;
  if (filter.showing.some((sign) => sign === headsign)) return true;
  return !filter.known.some((sign) => sign === headsign);
}

/**
 * `route` is the number on the bus (`short_name`), not a `route_id`, because
 * `route_short_name` is what the fleet response carries. Null means no route is
 * showing, and then nothing is requested at all — the map does not spend a
 * request a minute on a layer nobody is looking at.
 *
 * `direction` hides the other way's buses; null applies no direction filter at
 * all, which is what the map drew before Increment 9. It changes nothing about
 * the request — the response is the whole island either way, so flipping
 * direction re-filters a fleet already in hand rather than fetching again.
 */
export function useVehicles(
  client: TheBusClient,
  route: string | null,
  direction: DirectionFilter | null = null,
): VehiclesView {
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  const active = route !== null;

  /**
   * Keyed on *whether* a route is showing, not on which one.
   *
   * The response is the whole island either way, so switching route or flipping
   * direction must not throw away a fleet that is still perfectly current and
   * spend another request to receive the same bytes.
   */
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.vehicles({ signal });
      if (signal.aborted) return;

      if (result.ok) {
        setFleet(result.fleet);
        setFetchedAt(new Date());
        setFailure(null);
      } else {
        // Note what is *not* here: `setFleet(null)`. The buses stay, and their
        // labels go on counting up until they age off on their own. That is the
        // whole reason a failed fetch needs no special case — an earlier design
        // had a separate two-minute outage timer and it was dropped.
        setFailure(result.failure);
      }
    },
    [client],
  );

  useEffect(() => {
    if (!active) {
      // Leaving route mode drops the fleet, so re-entering does not paint
      // minutes-old buses for the moment before the first fetch returns.
      setFleet(null);
      setFailure(null);
      setFetchedAt(null);
      return;
    }

    /**
     * **The clock is reset on activation, and leaving it out was a bug.**
     *
     * `now` is seeded when the *screen* mounts and only ticks while a route is
     * showing. So opening the map, leaving it ten minutes, and then picking a
     * route left `now` ten minutes in the past: `now − fetchedAt` came out at
     * about −10 min, `ageOf`'s `Math.max(0, …)` clamped every age to zero, and
     * for a whole `AGE_TICK_MS` every bus read "here now" while nothing could
     * fail the freshness filter that keeps ~950 ghosts off the map.
     *
     * Found by reading rather than on a device, though the 2026-08-09
     * screenshot of twelve labels every one of which said "here now" is
     * consistent with it.
     */
    setNow(new Date());

    let inFlight = new AbortController();
    let stopPolling: (() => void) | null = null;

    const tick = () => {
      // At most one request outstanding, so a slow response and a fresh poll
      // cannot settle out of order and put buses back where they were.
      inFlight.abort();
      inFlight = new AbortController();
      return load(inFlight.signal);
    };

    const startPolling = () => {
      if (stopPolling === null) stopPolling = repeat(tick, VEHICLE_POLL_MS);
    };
    const pausePolling = () => {
      stopPolling?.();
      stopPolling = null;
    };

    void tick();
    startPolling();

    // Backgrounding stops the timer rather than running it against a screen
    // nobody is looking at; coming back fetches at once, because whatever is on
    // screen is at least as old as the time spent away.
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        void tick();
        startPolling();
      } else {
        pausePolling();
        inFlight.abort();
      }
    });

    return () => {
      pausePolling();
      inFlight.abort();
      subscription.remove();
    };
  }, [active, load]);

  /** The clock the ages are read against, moved on a coarse tick. See `AGE_TICK_MS`. */
  useEffect(() => {
    if (!active) return;
    return repeat(() => setNow(new Date()), AGE_TICK_MS);
  }, [active]);

  const buses = useMemo(() => {
    if (fleet === null || fetchedAt === null || route === null) return [];

    return fleet.vehicles
      .filter((vehicle) => sameRoute(vehicle.route, route))
      // The other direction's buses, hidden rather than dimmed: hiding is what
      // makes the route band's "· 7 buses" a count of what is on screen, and
      // the flip control is right there.
      .filter((vehicle) => drawsInDirection(direction, vehicle.headsign))
      .map((vehicle) => ({ vehicle, ageMs: ageOf(vehicle, fleet, fetchedAt, now) }))
      // One rule, applied in both directions: a bus is drawn while its last
      // report is fresh and leaves the map when it stops being fresh.
      .filter((bus) => bus.ageMs <= FRESH_MS)
      // Freshest first, so the bus a rider is most likely to care about draws
      // over the top of a stale-ish one sitting on the same block.
      .sort((a, b) => a.ageMs - b.ageMs);
  }, [fleet, fetchedAt, route, direction, now]);

  /**
   * One entry per fleet number, keeping the freshest.
   *
   * **The live feed really does return the same bus twice.** Observed on a
   * device on 2026-08-09: fleet numbers `605` and `209` both appeared twice on
   * Route 10 within the freshness window, and React reported *"Encountered two
   * children with the same key"* against `buses.map` in `MapScreen` — because
   * `BusMarker` is keyed on the fleet number, which is the only stable identity
   * a bus has.
   *
   * **This is not tidiness.** Duplicate keys mean React's model of what it
   * mounted no longer matches what it mounted — its own warning says children
   * "may be duplicated and/or omitted" — and the children in question are
   * `react-native-maps` markers, whose real subview list already diverges from
   * React's by construction (`AIRMap.m` intercepts them and never calls super).
   * Issuing removal and insertion instructions against a wrong model, into that
   * array, is a candidate for the out-of-range
   * `-[__NSArrayM insertObject:atIndex:]` in `docs/backlog.md` — four `.ips`
   * files, every one of them while unmounting this exact list via the route
   * view's X.
   *
   * Freshest wins because the list is already sorted that way and because two
   * records for one fleet number are one bus reported twice; the older reading
   * is the one that is out of date.
   */
  const drawable = useMemo(() => {
    const seen = new Set<string>();
    return buses.filter((bus) => {
      if (seen.has(bus.vehicle.number)) return false;
      seen.add(bus.vehicle.number);
      return true;
    });
  }, [buses]);

  const lateCount = useMemo(
    () => drawable.filter((bus) => adherenceOf(bus.vehicle.adherence) === 'late').length,
    [drawable],
  );

  return { buses: drawable, failure, fetchedAt, lateCount };
}
