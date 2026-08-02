import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStopQueries, NEARBY_RADIUS_METERS } from '../../data/gtfs/db';
import { useLocation, type LocationStatus } from '../stops/useLocation';
import { regionAround, type Region } from './region';
import type { Coords } from '../../lib/distance';
import type { StopWithDistance } from '../../data/gtfs/types';

/**
 * The stops the map is showing, and the point they are measured from.
 *
 * **The anchor is the whole design.** Stops are looked up around one point —
 * where you are, or wherever you last tapped — and the set does not change
 * until that point does. There is no pan handler and no zoom handler in this
 * file, and that is deliberate rather than unfinished: querying on viewport
 * means up to 150 markers re-rendering on every drag settle, and a list that
 * reshuffles under a thumb already reaching for a row. The SQL was never the
 * expensive part. See `docs/superpowers/specs/2026-08-02-increment-3-map.md`,
 * and the comparison spec for what the other fork cost someone who took it.
 */

/**
 * Downtown Honolulu. Used when there is no location to use — permission not
 * asked for yet, denied, or failed — so the map always has somewhere to be
 * rather than a blank grey square.
 */
export const FALLBACK_ANCHOR: Coords = { lat: 21.3069, lon: -157.8583 };

/**
 * Where the anchor came from, which is what the screen needs to know whether
 * to offer a "show me where I am" prompt.
 */
export type AnchorSource = 'location' | 'chosen' | 'fallback';

/**
 * `empty` is not `failed`, and neither is `loading`. "No stops within walking
 * distance of here" is a true and useful answer — you tapped in the middle of
 * the ocean, or up a valley — while "the lookup failed" means the screen is
 * showing you nothing it can vouch for. A map that renders those two alike is
 * a map that cannot be trusted at a stop at night.
 */
export type AnchoredStatus = 'loading' | 'ready' | 'empty' | 'failed';

export type AnchoredStops = {
  anchor: Coords;
  source: AnchorSource;
  /** The camera window that frames the query radius around the anchor. */
  region: Region;
  stops: StopWithDistance[];
  status: AnchoredStatus;
  /** Move the anchor to a point the rider tapped. */
  setAnchor: (coords: Coords) => void;
  /**
   * Back to the rider's own location. Asks for permission if it has not been
   * asked for yet — which is what ties the system prompt to a deliberate tap,
   * the same contract `useLocation` was written for.
   */
  recentre: () => void;
  locationStatus: LocationStatus;
};

const NO_STOPS: StopWithDistance[] = [];

export function useAnchoredStops(): AnchoredStops {
  const { nearby } = useStopQueries();
  const location = useLocation();

  /**
   * A tapped point, or null to mean "follow my location". Storing the override
   * rather than syncing a single anchor through an effect is what stops a late
   * location fix from yanking the map away from somewhere the rider chose.
   */
  const [chosen, setChosen] = useState<Coords | null>(null);
  const [stops, setStops] = useState<StopWithDistance[]>(NO_STOPS);
  const [status, setStatus] = useState<AnchoredStatus>('loading');

  const anchor = useMemo(
    () => chosen ?? location.coords ?? FALLBACK_ANCHOR,
    [chosen, location.coords],
  );

  const source: AnchorSource =
    chosen !== null ? 'chosen' : location.coords !== null ? 'location' : 'fallback';

  const region = useMemo(() => regionAround(anchor, NEARBY_RADIUS_METERS), [anchor]);

  /**
   * The only thing that triggers a query. `anchor` is memoised on the two
   * pieces of state it is built from, so this runs once per anchor change and
   * not once per render — which is the difference between this hook and the
   * viewport version it exists instead of.
   */
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    nearby(anchor)
      .then((found) => {
        if (cancelled) return;
        setStops(found);
        setStatus(found.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (cancelled) return;
        // The stops already on screen are not cleared. They were true of the
        // previous anchor and are now wrong, so `failed` is what the screen
        // renders — but blanking the list would also blank the map, and a
        // failed query is not a reason to throw away a working view.
        setStatus('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [anchor, nearby]);

  const setAnchor = useCallback((coords: Coords) => {
    setChosen(coords);
  }, []);

  const recentre = useCallback(() => {
    setChosen(null);
    if (location.coords === null) void location.request();
  }, [location]);

  return {
    anchor,
    source,
    region,
    stops,
    status,
    setAnchor,
    recentre,
    locationStatus: location.status,
  };
}
