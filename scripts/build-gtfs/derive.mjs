/**
 * Pure GTFS derivation. No I/O, so it is testable against literal fixtures.
 *
 * The point of this module: stop_times.txt is 73.8 MB of per-trip timing detail,
 * but the app only needs the *relationships* it implies. Those collapse to about
 * 200 KB. shapes.txt is a further 9.8 MB and collapses to ~152 KiB the same way,
 * by thinning each line and encoding it.
 */
import { simplify } from './simplify.mjs';
import { encodePolyline } from '../../data/gtfs/polyline.ts';

/** Minimal RFC 4180 CSV parser. GTFS quotes any field containing a comma. */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((name, index) =>
    index === 0 ? name.replace(/^﻿/, '') : name,
  );

  return rows
    .slice(1)
    .filter((cells) => cells.some((cell) => cell !== ''))
    .map((cells) => {
      const row = {};
      header.forEach((name, index) => {
        row[name] = cells[index] ?? '';
      });
      return row;
    });
}

/**
 * Required-field guard for parsed GTFS rows. Both derive functions trust
 * `Record<string, string>` shapes coming straight out of `parseCsv`, so a
 * blank or missing field would otherwise flow silently into the derived
 * tables (e.g. `NaN` from `Number('')`) instead of failing where it is cheap
 * to diagnose.
 */
export function requireField(row, field, index, source) {
  const value = row[field];
  if (value === undefined || value === '') {
    throw new Error(`Invalid ${source} row ${index}: missing required field "${field}"`);
  }
  return value;
}

/** Like `requireField`, but also checks the value parses as a finite number. */
export function requireNumberField(row, field, index, source) {
  const raw = requireField(row, field, index, source);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid ${source} row ${index}: field "${field}" is "${raw}", not a number`,
    );
  }
  return value;
}

function tripToRoute(tripsRows) {
  const map = new Map();
  tripsRows.forEach((trip, index) => {
    const tripId = requireField(trip, 'trip_id', index, 'trips.txt');
    requireField(trip, 'route_id', index, 'trips.txt');
    map.set(tripId, trip);
  });
  return map;
}

/**
 * Separator for composite Map/Set keys built from GTFS ids.
 *
 * NUL is used because the GTFS spec permits any character except commas and
 * newlines in id fields — including spaces. A space separator round-trips
 * correctly only as long as no id contains one, which is true of the current
 * Oahu feed and is not guaranteed by anything. Written as a named constant
 * rather than an inline '\0' so the character stays visible when reading.
 */
const KEY_SEP = '\0';

/** Which routes serve which stops. Sorted for deterministic output. */
export function deriveStopRoutes(stopTimesRows, tripsRows) {
  const trips = tripToRoute(tripsRows);
  const seen = new Set();

  stopTimesRows.forEach((stopTime, index) => {
    const tripId = requireField(stopTime, 'trip_id', index, 'stop_times.txt');
    requireField(stopTime, 'stop_id', index, 'stop_times.txt');
    const trip = trips.get(tripId);
    if (trip === undefined) return;
    seen.add(`${stopTime.stop_id}${KEY_SEP}${trip.route_id}`);
  });

  return [...seen]
    .map((key) => {
      const [stop_id, route_id] = key.split(KEY_SEP);
      return { stop_id, route_id };
    })
    .sort(
      (a, b) =>
        a.stop_id.localeCompare(b.stop_id) || a.route_id.localeCompare(b.route_id),
    );
}

/**
 * Every headsign each route and direction is signed with — the sign on the
 * front of the bus, which is the only signal that says which way a live vehicle
 * is running.
 *
 * **Many-to-one, not one-to-one.** Route 2's direction `1` carries five
 * headsigns; a lookup written as a single equality is wrong. 333 distinct
 * triples across the 2026-06-29 feed's 37,678 trips.
 *
 * The join against the live feed is exact string equality: GTFS `trip_headsign`
 * and the arrivals API's `headsign` are byte-identical, verified against both.
 * So nothing is normalised here — trimming or upper-casing would silently break
 * the only thing this table is for.
 *
 * A trip missing `direction_id` or `trip_headsign` is skipped rather than
 * thrown on. Both are optional in GTFS, and a triple missing either half cannot
 * attribute a bus to a direction, so it is not a row. A feed that lost them
 * wholesale is caught by `FLOOR.routeDirections` at the end of the build, which
 * is the right place for it: one absent field is not a reason to refuse to
 * build every other table.
 */
export function deriveRouteDirections(tripsRows) {
  const seen = new Set();

  tripsRows.forEach((trip, index) => {
    const routeId = requireField(trip, 'route_id', index, 'trips.txt');
    const directionId = trip.direction_id ?? '';
    const headsign = trip.trip_headsign ?? '';
    if (directionId === '' || headsign === '') return;
    seen.add(`${routeId}${KEY_SEP}${directionId}${KEY_SEP}${headsign}`);
  });

  return [...seen].sort().map((key) => {
    const [route_id, direction_id, headsign] = key.split(KEY_SEP);
    return { route_id, direction_id, headsign };
  });
}

/**
 * The one trip that stands for each route and direction, keyed
 * `route_id\0direction_id`.
 *
 * A route has thousands of trips that mostly repeat the same path, so one
 * representative is enough. The trip visiting the most stops is chosen because
 * short-turn trips would otherwise truncate the route.
 *
 * **Extracted so that `deriveRouteStops` and `deriveRouteShapes` cannot
 * disagree about which trip that is.** They must not: the stops and the road
 * line have to come from the *same* trip, and comparing one trip's stops
 * against another trip's shape is exactly the mistake that was made — and
 * corrected — while measuring whether polylines were affordable at all. Two
 * copies of this selection would drift the first time either was tuned.
 */
export function representativeTrips(stopTimesRows, tripsRows) {
  const trips = tripToRoute(tripsRows);

  const countByTrip = new Map();
  stopTimesRows.forEach((stopTime, index) => {
    const tripId = requireField(stopTime, 'trip_id', index, 'stop_times.txt');
    countByTrip.set(tripId, (countByTrip.get(tripId) ?? 0) + 1);
  });

  const bestTrip = new Map();
  for (const [tripId, count] of countByTrip) {
    const trip = trips.get(tripId);
    if (trip === undefined) continue;
    const key = `${trip.route_id}${KEY_SEP}${trip.direction_id ?? ''}`;
    const current = bestTrip.get(key);
    // `>` and not `>=`: ties keep the first trip reached, which makes the
    // choice a function of the feed's own row order rather than of iteration
    // order over a Map that was built from it.
    if (current === undefined || count > current.count) {
      bestTrip.set(key, { count, tripId });
    }
  }

  const representatives = new Map();
  for (const [key, { tripId }] of bestTrip) representatives.set(key, tripId);
  return representatives;
}

/**
 * The `shape_id` each route and direction is drawn with — the representative
 * trip's own shape, so the line and the stop list describe one journey.
 *
 * Takes the representatives rather than recomputing them; see
 * `representativeTrips`. A representative with no `shape_id` is omitted
 * entirely rather than carried as a blank, so the app's "this direction has no
 * shape" case is a missing row and not an empty string.
 */
export function deriveRouteShapes(tripsRows, representatives) {
  const trips = tripToRoute(tripsRows);

  const out = [];
  for (const key of [...representatives.keys()].sort()) {
    const trip = trips.get(representatives.get(key));
    const shapeId = trip?.shape_id ?? '';
    if (shapeId === '') continue;
    const [route_id, direction_id] = key.split(KEY_SEP);
    out.push({ route_id, direction_id, shape_id: shapeId });
  }
  return out;
}

/**
 * Every shape in the feed, thinned and encoded.
 *
 * All of them, not one per route and direction: **every live arrival names the
 * exact variant its bus is running**, so a rider looking at a short-turn or an
 * express run gets the line that bus is actually on rather than a
 * representative it left ten stops ago. Measured at 10 m, all 532 variants
 * store in ~152 KiB — the premise that this would cost "several times the
 * asset" was wrong, and it nearly cost the feature.
 *
 * Points are ordered by `shape_pt_sequence` numerically. The feed writes it in
 * steps of one from 10001, so a lexical sort puts 10010 before 1002 and the
 * shape becomes a scribble.
 */
export function deriveShapes(shapesRows, toleranceMeters) {
  const bySequence = new Map();
  shapesRows.forEach((row, index) => {
    const shapeId = requireField(row, 'shape_id', index, 'shapes.txt');
    const lat = requireNumberField(row, 'shape_pt_lat', index, 'shapes.txt');
    const lon = requireNumberField(row, 'shape_pt_lon', index, 'shapes.txt');
    const order = requireNumberField(row, 'shape_pt_sequence', index, 'shapes.txt');
    if (!bySequence.has(shapeId)) bySequence.set(shapeId, []);
    bySequence.get(shapeId).push({ order, lat, lon });
  });

  const out = [];
  for (const shapeId of [...bySequence.keys()].sort()) {
    const ordered = bySequence.get(shapeId).sort((a, b) => a.order - b.order);
    const thinned = simplify(ordered, toleranceMeters);
    out.push({ shape_id: shapeId, polyline: encodePolyline(thinned) });
  }
  return out;
}

/**
 * Ordered stops per route and direction, from the representative trip.
 */
export function deriveRouteStops(stopTimesRows, tripsRows) {
  const keptTrips = new Map();
  for (const [key, tripId] of representativeTrips(stopTimesRows, tripsRows)) {
    keptTrips.set(tripId, key);
  }

  const sequences = new Map();
  stopTimesRows.forEach((stopTime, index) => {
    const key = keptTrips.get(stopTime.trip_id);
    if (key === undefined) return;
    requireField(stopTime, 'stop_id', index, 'stop_times.txt');
    const order = requireNumberField(stopTime, 'stop_sequence', index, 'stop_times.txt');
    if (!sequences.has(key)) sequences.set(key, []);
    sequences.get(key).push({ order, stop_id: stopTime.stop_id });
  });

  const out = [];
  for (const key of [...sequences.keys()].sort()) {
    const [route_id, direction_id] = key.split(KEY_SEP);
    const ordered = sequences.get(key).sort((a, b) => a.order - b.order);
    ordered.forEach((entry, index) => {
      out.push({ route_id, direction_id, seq: index, stop_id: entry.stop_id });
    });
  }
  return out;
}
