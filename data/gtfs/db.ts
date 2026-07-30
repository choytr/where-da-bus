import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import {
  NEARBY_IN_BOX,
  SEARCH_BY_CODE,
  SEARCH_BY_NAME,
  boundingBox,
  routesForStopsSql,
  stopsByIdsSql,
  toFtsQuery,
} from './sql';
import { metersBetween, type Coords } from '../../lib/distance';
import type { RouteSummary, Stop, StopWithDistance } from './types';

const NEARBY_RADIUS_METERS = 1500;
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

  return { nearby, searchByName, searchByCode, routesForStops, stopsByIds };
}
