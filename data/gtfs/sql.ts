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
 * The schema this build of the app is compiled against, and the `v1` in every
 * published filename.
 *
 * Once the database can arrive over the network, the schema `emit.mjs` writes
 * and the schema these queries read stop being tied together by the build. The
 * version goes in the *filename* — the app asks for `gtfs-v1-….db` and can
 * therefore never be handed a database it cannot read — and this constant is
 * what makes the request. Bumping the schema means bumping this, publishing
 * `gtfs-v2-….db`, and leaving the v1 assets up for as long as an old binary
 * might still be asking for them. There is no App Store here to push a fix
 * through, so an old binary has to keep working forever.
 *
 * `emit.mjs` imports this rather than declaring its own copy: the two numbers
 * agreeing is the entire point, and two constants cannot drift when there is
 * only one.
 */
export const SCHEMA_VERSION = 1;

/**
 * The version the *file* claims, as a second assertion after a download.
 * Belt to the filename's braces. The bundled floor predates versioning and is
 * never asked — it shipped inside the binary, so it cannot disagree with it.
 */
export const SCHEMA_VERSION_SQL = `
  SELECT schema_version FROM meta LIMIT 1
`;

/**
 * What a database has to contain before the app will switch onto it.
 *
 * `sha256` proves the bytes arrived intact; it says nothing about whether the
 * build was *right*. The failure this guards is upstream publishing a truncated
 * zip: the cron dutifully builds a forty-stop database, hashes it, and the
 * checksum matches perfectly. Oahu's feed carries ~3,800 stops and ~120 routes,
 * so these are floors with a wide margin, not expectations.
 *
 * Checked twice — in the Action before publishing, and in the app before the
 * pointer moves — because the two catch different things. The Action catches a
 * bad build before anyone sees it; the app catches a bad build that was
 * published anyway, which is the only case that reaches a rider.
 */
export const FLOOR = { stops: 3000, routes: 100, stopRoutes: 5000 } as const;

export const FLOOR_COUNTS = `
  SELECT
    (SELECT count(*) FROM stops)       AS stops,
    (SELECT count(*) FROM routes)      AS routes,
    (SELECT count(*) FROM stop_routes) AS stopRoutes
`;

export type TableCounts = { stops: number; routes: number; stopRoutes: number };

/** Whether counts from `FLOOR_COUNTS` describe a database worth switching onto. */
export function meetsFloor(counts: TableCounts): boolean {
  return (
    counts.stops > FLOOR.stops &&
    counts.routes > FLOOR.routes &&
    counts.stopRoutes > FLOOR.stopRoutes
  );
}

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

/**
 * One route's identity. Parameters: (route_id).
 */
export const ROUTE_BY_ID = `
  SELECT route_id, short_name, long_name FROM routes WHERE route_id = ?
`;

/**
 * Routes matching what a rider typed. Parameters:
 * (anywhere, anywhere, exact, prefix, limit), all but the last from
 * `toLikeQuery` — never bind a raw user string to a `LIKE` here.
 *
 * **It never matches `route_id`, and that is the whole point.** The feed's ids
 * are not the numbers on the buses: `route_id: '13'` is route **14**, and
 * `route_id: '40'` is route **C**, the CountryExpress to Makaha. Matching on
 * the id would answer "40" with a route to the far side of the island while
 * route 40 sat further down the list. Navigation still uses `route_id`,
 * because that is what the other queries key on; only the *matching* is on the
 * names a rider can see.
 *
 * **118 routes, so a `LIKE` scan.** No FTS table, which means no
 * `SCHEMA_VERSION` bump and no republished generation — this was the one place
 * the increment could have grown a data-migration tail. A full scan of 118
 * rows is not worth an index, let alone a second search engine.
 *
 * Exact `short_name` matches sort first, then prefixes, then anything else;
 * within a rank, numeric routes in numeric order, as `routesForStopsSql`
 * already does. So `40` leads with route 40 rather than with 401.
 */
export const SEARCH_ROUTES = `
  SELECT route_id, short_name, long_name
  FROM routes
  WHERE short_name LIKE ? ESCAPE '\\' OR long_name LIKE ? ESCAPE '\\'
  ORDER BY
    CASE
      WHEN short_name = ? COLLATE NOCASE THEN 0
      WHEN short_name LIKE ? ESCAPE '\\' THEN 1
      ELSE 2
    END,
    CASE WHEN CAST(short_name AS INTEGER) > 0 THEN 0 ELSE 1 END,
    CAST(short_name AS INTEGER),
    short_name
  LIMIT ?
`;

/** The escape character `SEARCH_ROUTES` declares. */
const LIKE_ESCAPE = '\\';

/**
 * The three shapes `SEARCH_ROUTES` binds, from one typed string.
 *
 * A wrapper type for the same reason as `FtsQuery`: `null` is a legal SQLite
 * bind parameter, so a bare `string | null` could be handed to the query
 * without a null check — and here it would silently match nothing rather than
 * throwing, which is worse.
 */
export type LikeQuery = {
  /** Substring, for the `WHERE`. Wildcards in the input are escaped. */
  readonly anywhere: string;
  /** Prefix, for the middle rank of the `ORDER BY`. Escaped likewise. */
  readonly prefix: string;
  /**
   * The typed text itself, **not** escaped: it is compared with `=`, where a
   * `%` is a percent sign and a backslash is a backslash.
   */
  readonly exact: string;
};

/**
 * Patterns for `SEARCH_ROUTES`, or null when there is nothing to search for.
 *
 * `%` and `_` are escaped, so a rider who types one gets a route whose name
 * contains that character rather than every route in the feed. `LIKE` is
 * already case-insensitive for ASCII, which is all a route name contains.
 */
export function toLikeQuery(input: string): LikeQuery | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const escaped = trimmed.replace(/[\\%_]/g, (character) => `${LIKE_ESCAPE}${character}`);
  return { anywhere: `%${escaped}%`, prefix: `${escaped}%`, exact: trimmed };
}

/**
 * Every stop a route serves, in the order it serves them. Parameters: (route_id).
 *
 * `direction_id` and `seq` come back so the caller can split the run into its
 * two directions and keep each in order. Ordering here rather than in
 * JavaScript because `seq` is the only thing that makes this list a route
 * rather than a set — the stop names carry no sequence of their own.
 *
 * This is entirely static data. Which stops a route serves does not change
 * minute to minute, so unlike arrivals it needs no network at all.
 */
export const ROUTE_STOPS = `
  SELECT rs.direction_id, rs.seq, s.stop_id, s.stop_code, s.stop_name, s.lat, s.lon
  FROM route_stops rs
  JOIN stops s ON s.stop_id = rs.stop_id
  WHERE rs.route_id = ?
  ORDER BY rs.direction_id, rs.seq
`;

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
