import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import {
  FEED_END_DATE,
  NEARBY_IN_BOX,
  ROUTE_BY_ID,
  ROUTE_STOPS,
  SEARCH_BY_CODE,
  SEARCH_BY_NAME,
  boundingBox,
  routesForStopsSql,
  stopsByIdsSql,
  toFtsQuery,
} from './sql';
import { metersBetween, type Coords } from '../../lib/distance';
import type { RouteSummary, Stop, StopWithDistance } from './types';

/**
 * Exported because the map frames its camera on exactly this distance — see
 * features/map/region.ts. A camera and a query that disagree about how far
 * "nearby" reaches produce a map showing stops that are not in the list under
 * it, or a list of stops that are off screen.
 */
export const NEARBY_RADIUS_METERS = 1500;
const NEARBY_LIMIT = 25;
const SEARCH_LIMIT = 30;

/**
 * `expo-sqlite`'s `getAllAsync`/`getFirstAsync` are generic in the row type,
 * but that generic is a caller-supplied label, not a runtime check — asking
 * for `getAllAsync<Stop>(...)` would compile no matter what the query
 * actually returns, which is exactly the blind trust a type assertion gives
 * you, just spelled differently. These functions are left to infer `unknown`
 * (see the calls below, which pass no type argument) and every row is
 * narrowed with a real type guard instead, so a schema drift between this
 * file and the built database fails as a filtered-out row rather than a
 * silently-wrong field.
 */
function isStop(value: unknown): value is Stop {
  return (
    typeof value === 'object' &&
    value !== null &&
    'stop_id' in value &&
    typeof value.stop_id === 'string' &&
    'stop_code' in value &&
    typeof value.stop_code === 'string' &&
    'stop_name' in value &&
    typeof value.stop_name === 'string' &&
    'lat' in value &&
    typeof value.lat === 'number' &&
    'lon' in value &&
    typeof value.lon === 'number'
  );
}

function isRouteSummary(value: unknown): value is RouteSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    'route_id' in value &&
    typeof value.route_id === 'string' &&
    'short_name' in value &&
    typeof value.short_name === 'string' &&
    'long_name' in value &&
    typeof value.long_name === 'string'
  );
}

/**
 * The `meta` row, narrowed the same way as every other row here. A build that
 * wrote no end date stores SQL NULL, so `null` is a legitimate value and not a
 * failed guard.
 */
function isFeedEndDateRow(value: unknown): value is { feed_end_date: string | null } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'feed_end_date' in value &&
    (typeof value.feed_end_date === 'string' || value.feed_end_date === null)
  );
}

/**
 * A route row from the batched lookup, which carries the stop it belongs to so
 * one result set can be grouped back into per-stop lists.
 */
type RouteForStop = RouteSummary & { stop_id: string };

function isRouteForStop(value: unknown): value is RouteForStop {
  return (
    isRouteSummary(value) &&
    'stop_id' in value &&
    typeof value.stop_id === 'string'
  );
}

/**
 * One stop on a route's run, carrying where it falls in that run. `seq` is
 * what makes the list a route rather than a set of stops.
 */
type RouteStopRow = Stop & { direction_id: string; seq: number };

function isRouteStopRow(value: unknown): value is RouteStopRow {
  return (
    isStop(value) &&
    'direction_id' in value &&
    typeof value.direction_id === 'string' &&
    'seq' in value &&
    typeof value.seq === 'number'
  );
}

/** A route's run in one direction, in order. */
export type RouteDirection = {
  directionId: string;
  stops: Stop[];
};

/**
 * Typed query functions over the bundled, read-only GTFS database. Must be
 * called from within an `<SQLiteProvider>` — `useSQLiteContext` throws
 * otherwise. Kept separate from any screen so no SQL string, no
 * `expo-sqlite` import, and no row-shape assumption ever needs to appear in
 * UI code.
 */
export function useStopQueries() {
  const db = useSQLiteContext();

  const nearby = useCallback(
    async (center: Coords): Promise<StopWithDistance[]> => {
      const box = boundingBox(center, NEARBY_RADIUS_METERS);
      const rows = await db.getAllAsync(
        NEARBY_IN_BOX,
        box.minLat,
        box.maxLat,
        box.minLon,
        box.maxLon,
      );

      return rows
        .filter(isStop)
        .map((stop) => ({ ...stop, meters: metersBetween(center, stop) }))
        .sort((a, b) => a.meters - b.meters)
        .slice(0, NEARBY_LIMIT);
    },
    [db],
  );

  const searchByName = useCallback(
    async (query: string): Promise<Stop[]> => {
      const fts = toFtsQuery(query);
      // No runnable query (empty input, or input that reduces to nothing
      // once quotes/wildcards/whitespace are stripped) reads as "no
      // results" rather than a syntax error — binding fts.match on the
      // null case is exactly what FtsQuery's wrapper type exists to block.
      if (fts === null) return [];
      const rows = await db.getAllAsync(SEARCH_BY_NAME, fts.match, SEARCH_LIMIT);
      return rows.filter(isStop);
    },
    [db],
  );

  const searchByCode = useCallback(
    async (code: string): Promise<Stop | null> => {
      const row = await db.getFirstAsync(SEARCH_BY_CODE, code.trim());
      return isStop(row) ? row : null;
    },
    [db],
  );

  /**
   * One query for the whole list, not one per stop. The caller is a scrolling
   * list that re-asks on every keystroke, and a per-stop loop could not be
   * abandoned partway: cancelling the caller only suppresses the result, while
   * the remaining queries stay queued on the native bridge behind the ones the
   * next keystroke needs.
   */
  const routesForStops = useCallback(
    async (stopIds: string[]): Promise<Map<string, RouteSummary[]>> => {
      // Every requested id gets an entry, so "no route serves this stop" stays
      // distinguishable from "this stop was never looked up".
      const result = new Map<string, RouteSummary[]>(stopIds.map((id) => [id, []]));
      if (stopIds.length === 0) return result;

      const rows = await db.getAllAsync(routesForStopsSql(stopIds.length), ...stopIds);
      for (const row of rows.filter(isRouteForStop)) {
        const { stop_id, ...route } = row;
        result.get(stop_id)?.push(route);
      }
      return result;
    },
    [db],
  );

  /**
   * Resolve stops by id. Favorites use this rather than reading out of the
   * nearby results, so a favorite stays visible when the user is far from it.
   * An id with no matching row (a favorite whose stop dropped out of a
   * rebuilt feed) is simply absent from the result, not an error.
   */
  const stopsByIds = useCallback(
    async (stopIds: string[]): Promise<Stop[]> => {
      if (stopIds.length === 0) return [];
      const rows = await db.getAllAsync(stopsByIdsSql(stopIds.length), ...stopIds);
      return rows.filter(isStop);
    },
    [db],
  );

  /**
   * The last day the bundled feed is valid through, or null when the feed
   * never said. Null covers an absent `meta` row and a row with no end date
   * alike: both mean "no claim on record", which the screen must not read as
   * "still current". A failed read rejects — it is not a quiet null.
   */
  const feedEndDate = useCallback(async (): Promise<string | null> => {
    const row = await db.getFirstAsync(FEED_END_DATE);
    return isFeedEndDateRow(row) ? row.feed_end_date : null;
  }, [db]);

  /** One route by id, or null when the bundled feed does not carry it. */
  const routeById = useCallback(
    async (routeId: string): Promise<RouteSummary | null> => {
      const row = await db.getFirstAsync(ROUTE_BY_ID, routeId);
      return isRouteSummary(row) ? row : null;
    },
    [db],
  );

  /**
   * Every stop a route serves, split by direction and in order within each.
   *
   * Grouping happens here rather than in the screen so the ordering guarantee
   * stays next to the `ORDER BY` that provides it. Directions come back in the
   * order the feed numbers them, which is stable across builds.
   */
  const routeStops = useCallback(
    async (routeId: string): Promise<RouteDirection[]> => {
      const rows = await db.getAllAsync(ROUTE_STOPS, routeId);

      const order: string[] = [];
      const grouped = new Map<string, Stop[]>();
      for (const row of rows.filter(isRouteStopRow)) {
        const { direction_id, seq, ...stop } = row;
        const existing = grouped.get(direction_id);
        if (existing === undefined) {
          order.push(direction_id);
          grouped.set(direction_id, [stop]);
        } else {
          existing.push(stop);
        }
      }

      return order.map((directionId) => ({
        directionId,
        stops: grouped.get(directionId) ?? [],
      }));
    },
    [db],
  );

  return {
    nearby,
    searchByName,
    searchByCode,
    routesForStops,
    stopsByIds,
    feedEndDate,
    routeById,
    routeStops,
  };
}
