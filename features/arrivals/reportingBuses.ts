import { useEffect, useRef, useState } from 'react';
import { FRESH_MS, ageOf } from '../map/useVehicles';
import type { Arrival, Fleet, TheBusClient } from '../../data/thebus';

/**
 * Which arrivals actually have a bus the **map** can draw.
 *
 * **Two feeds, and they disagree.** An `Arrival` says `estimated="1"` and names
 * a vehicle, which is a claim about the *ETA* being real-time. Whether route
 * mode can put a dot on the map is a different question entirely, answered by
 * the fleet endpoint: it has to carry that trip, recently, and attribute it to
 * a route. Measured 2026-08-10 at 02:18 HST, 32 vehicles were reporting and
 * **none of them carried a route** — every one `route_short_name: "null"`,
 * `trip: "null_trip"` — while the arrivals endpoint simultaneously called bus
 * 261 live on Route 2.
 *
 * So *Show live bus on map* was offered, and led to a drawn route with no bus
 * and a band reading "No buses running":
 *
 * > "Sometimes the 'live' in the arrivals page seems to disagree with the api
 * > and doing 'show live bus on map' leads to no bus icon and 'no buses
 * > running.' Add another network call there if you have to — these two should
 * > never be out of sync."
 *
 * This is that call. The row asks the same source the map will, so the offer
 * and the outcome cannot part company.
 */

/**
 * How long a fleet answer is reused before another is worth 333 KB.
 *
 * The board polls every sixty seconds and this does **not** follow it: the
 * fleet response is the whole island, and fetching it once a minute for as long
 * as someone reads a timetable is a real cost on a phone. Two minutes keeps the
 * set about as current as the thing it is gating without paying per poll.
 */
export const FLEET_TTL_MS = 120_000;

/**
 * Trip id → the route that trip's bus is reporting, for every vehicle that
 * reported recently. Null while the answer is unknown — before the first
 * response, or after a failed one.
 *
 * **Null means "do not gate anything".** A fleet request that failed is not
 * evidence that a bus is missing, and hiding the entry on it would make a
 * network blip look like a bus that stopped existing.
 */
export type ReportingTrips = ReadonlyMap<string, string | null> | null;

/**
 * The fleet, reduced to what a row needs, refreshed no more often than
 * `FLEET_TTL_MS` and re-asked when `key` changes — the stop, in practice.
 */
export function useReportingTrips(client: TheBusClient, key: string): ReportingTrips {
  const [trips, setTrips] = useState<ReportingTrips>(null);
  const askedAt = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - askedAt.current < FLEET_TTL_MS) return;
    askedAt.current = now;

    const inFlight = new AbortController();
    void client
      .vehicles({ signal: inFlight.signal })
      .then((result) => {
        if (inFlight.signal.aborted) return;
        setTrips(result.ok ? reportingTripsOf(result.fleet) : null);
      })
      .catch(() => {
        if (!inFlight.signal.aborted) setTrips(null);
      });

    return () => inFlight.abort();
    // `key` re-asks for a different stop; the ref is what stops a remount from
    // spending another request straight away.
  }, [client, key]);

  return trips;
}

/**
 * The same freshness rule the map draws by, applied to the same response — so
 * "this row says a bus is out there" and "the map has a dot for it" are one
 * fact rather than two agreeing by luck.
 */
export function reportingTripsOf(fleet: Fleet): ReadonlyMap<string, string | null> {
  const fetchedAt = new Date();
  const trips = new Map<string, string | null>();

  for (const vehicle of fleet.vehicles) {
    if (vehicle.tripId === null) continue;
    if (ageOf(vehicle, fleet, fetchedAt, fetchedAt) > FRESH_MS) continue;
    trips.set(vehicle.tripId, vehicle.route);
  }

  return trips;
}

/** Route numbers are strings, and the two feeds disagree on case. */
function sameRoute(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Whether *Show live bus on map* will actually put a bus on the map.
 *
 * With `trips` null the answer falls back to what the arrival says about
 * itself, which is the behaviour that shipped and the only honest answer when
 * the fleet is unknown.
 */
export function hasDrawableBus(arrival: Arrival, trips: ReportingTrips): boolean {
  const claimsOne = arrival.estimate === 'live' && arrival.vehicle !== null;
  if (!claimsOne) return false;
  if (trips === null) return true;
  // Present *and* attributed to this route: a bus reporting `route: null` is a
  // deadhead, and `useVehicles` will not draw it whatever the board says.
  return trips.has(arrival.tripId) && sameRoute(trips.get(arrival.tripId) ?? null, arrival.route);
}
