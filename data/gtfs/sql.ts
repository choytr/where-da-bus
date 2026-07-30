import type { Coords } from '../../lib/distance';

const STOP_COLUMNS = 'stop_id, stop_code, stop_name, lat, lon';

/**
 * FTS5 prefix search over stop names. Parameters: (query.match, limit),
 * where `query` comes from `toFtsQuery` — never bind a raw user string here.
 */
export const SEARCH_BY_NAME = `
  SELECT s.stop_id, s.stop_code, s.stop_name, s.lat, s.lon
  FROM stops_fts f
  JOIN stops s ON s.rowid = f.rowid
  WHERE stops_fts MATCH ?
  ORDER BY rank
  LIMIT ?
`;

/**
 * Exact stop-code lookup — the number printed on the physical sign.
 *
 * The build drops the feed's duplicate `_merge` stops, so one code should mean
 * one row. The ordering is the belt to that braces: `LIMIT 1` without it would
 * hand back whichever row SQLite reached first, so a future feed reintroducing
 * a duplicate would change the answer to a typed number without changing a
 * line of code here. Shortest id first, then lexical, which prefers the plain
 * `5` over any suffixed variant of it.
 */
export const SEARCH_BY_CODE = `
  SELECT ${STOP_COLUMNS} FROM stops WHERE stop_code = ?
  ORDER BY LENGTH(stop_id), stop_id
  LIMIT 1
`;

/**
 * Look up specific stops by id. Favorites must resolve even when the user is
 * nowhere near them, so they cannot be read out of the nearby results.
 * Build the placeholders with `stopsByIdsSql(n)`.
 */
export function stopsByIdsSql(count: number): string {
  const placeholders = new Array(count).fill('?').join(', ');
  return `SELECT ${STOP_COLUMNS} FROM stops WHERE stop_id IN (${placeholders})`;
}

/**
 * The last day the bundled feed published itself as valid through, as GTFS's
 * `YYYYMMDD`. One row is written per build; `LIMIT 1` says so rather than
 * trusting it. Read through `feedValidity` — the raw string is not a date.
 */
export const FEED_END_DATE = `
  SELECT feed_end_date FROM meta LIMIT 1
`;

/**
 * Cheap bounding-box prefilter. Parameters: (minLat, maxLat, minLon, maxLon).
 * Exact haversine distance and ordering happen in JavaScript afterwards, because
 * SQLite has no trigonometric functions available here.
 */
export const NEARBY_IN_BOX = `
  SELECT ${STOP_COLUMNS} FROM stops
  WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
`;

/**
 * Routes serving each of several stops, numeric routes first and in numeric
 * order, with `stop_id` carried on every row so the caller can group them.
 *
 * Takes a whole list rather than one stop at a time because the caller wants
 * a screenful at once: a per-stop query would mean up to thirty round trips
 * across the native bridge per keystroke, and none of them can be abandoned
 * once queued. Build the placeholders with the count of ids you will bind.
 */
export function routesForStopsSql(count: number): string {
  const placeholders = new Array(count).fill('?').join(', ');
  return `
  SELECT sr.stop_id, r.route_id, r.short_name, r.long_name
  FROM stop_routes sr
  JOIN routes r ON r.route_id = sr.route_id
  WHERE sr.stop_id IN (${placeholders})
  ORDER BY
    CASE WHEN CAST(r.short_name AS INTEGER) > 0 THEN 0 ELSE 1 END,
    CAST(r.short_name AS INTEGER),
    r.short_name
`;
}

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

const METERS_PER_DEGREE_LAT = 111320;

/**
 * Square box around a point, generous enough that the JS sort can trim it.
 * Does not wrap across the antimeridian or handle the poles — fine for
 * Oahu (lat ~21.3, lon ~-157.9), not a general-purpose bounding box.
 */
export function boundingBox(center: Coords, radiusMeters: number): BoundingBox {
  const deltaLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const lonScale = Math.cos((center.lat * Math.PI) / 180);
  const deltaLon = radiusMeters / (METERS_PER_DEGREE_LAT * Math.max(lonScale, 0.01));

  return {
    minLat: center.lat - deltaLat,
    maxLat: center.lat + deltaLat,
    minLon: center.lon - deltaLon,
    maxLon: center.lon + deltaLon,
  };
}

/**
 * An escaped, ready-to-bind FTS5 match expression. Deliberately not a bare
 * `string` — `string` (and `null`) are legal SQLite bind parameters, so a
 * plain `string | null` return from `toFtsQuery` could still be handed
 * straight to `db.prepare(SEARCH_BY_NAME).all(query, limit)` without a
 * null check, and `null` reaching FTS5's `MATCH` throws
 * `fts5: syntax error near ""`. Wrapping the match text in an object with
 * no overlap with SQLite's bind-parameter types makes that call a compile
 * error instead: a caller must unwrap `.match` explicitly, which forces
 * the null check under `strict`.
 */
export type FtsQuery = { readonly match: string };

/**
 * Escapes user input for FTS5 and appends a prefix wildcard to each term.
 *
 * Returns null when there is no runnable query — an empty string, or input
 * that reduces to nothing once quotes/wildcards/whitespace are stripped
 * (e.g. '', '*', '""', '   '). Bind `result.match` (never `result` itself,
 * and never bind on the null case) to SEARCH_BY_NAME's `?` placeholder.
 */
export function toFtsQuery(input: string): FtsQuery | null {
  const cleaned = input.replace(/["*]/g, ' ').trim();
  if (cleaned === '') return null;
  const match = cleaned
    .split(/\s+/)
    .map((term) => `"${term}"*`)
    .join(' ');
  return { match };
}
