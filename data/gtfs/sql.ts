import type { Coords } from '../../lib/distance';

const STOP_COLUMNS = 'stop_id, stop_code, stop_name, lat, lon';

/**
 * FTS5 prefix search over stop names. Parameters: (query, limit).
 * The caller appends '*' to the query for prefix matching.
 */
export const SEARCH_BY_NAME = `
  SELECT s.stop_id, s.stop_code, s.stop_name, s.lat, s.lon
  FROM stops_fts f
  JOIN stops s ON s.rowid = f.rowid
  WHERE stops_fts MATCH ?
  ORDER BY rank
  LIMIT ?
`;

/** Exact stop-code lookup — the number printed on the physical sign. */
export const SEARCH_BY_CODE = `
  SELECT ${STOP_COLUMNS} FROM stops WHERE stop_code = ? LIMIT 1
`;

/**
 * Look up specific stops by id. Favorites must resolve even when the user is
 * nowhere near them, so they cannot be read out of the nearby results.
 * Build the placeholders with stopIdPlaceholders(n).
 */
export function stopsByIdsSql(count: number): string {
  const placeholders = new Array(count).fill('?').join(', ');
  return `SELECT ${STOP_COLUMNS} FROM stops WHERE stop_id IN (${placeholders})`;
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

/** Routes serving a stop, numeric routes first and in numeric order. */
export const ROUTES_FOR_STOP = `
  SELECT r.route_id, r.short_name, r.long_name
  FROM stop_routes sr
  JOIN routes r ON r.route_id = sr.route_id
  WHERE sr.stop_id = ?
  ORDER BY
    CASE WHEN CAST(r.short_name AS INTEGER) > 0 THEN 0 ELSE 1 END,
    CAST(r.short_name AS INTEGER),
    r.short_name
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

/** Escapes user input for FTS5 and appends a prefix wildcard. */
export function toFtsQuery(input: string): string {
  const cleaned = input.replace(/["*]/g, ' ').trim();
  if (cleaned === '') return '';
  return cleaned
    .split(/\s+/)
    .map((term) => `"${term}"*`)
    .join(' ');
}
