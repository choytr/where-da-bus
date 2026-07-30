/**
 * Pure GTFS derivation. No I/O, so it is testable against literal fixtures.
 *
 * The point of this module: stop_times.txt is 73.8 MB of per-trip timing detail,
 * but the app only needs the *relationships* it implies. Those collapse to about
 * 200 KB.
 */

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

function tripToRoute(tripsRows) {
  const map = new Map();
  for (const trip of tripsRows) {
    map.set(trip.trip_id, trip);
  }
  return map;
}

/** Which routes serve which stops. Sorted for deterministic output. */
export function deriveStopRoutes(stopTimesRows, tripsRows) {
  const trips = tripToRoute(tripsRows);
  const seen = new Set();

  for (const stopTime of stopTimesRows) {
    const trip = trips.get(stopTime.trip_id);
    if (trip === undefined) continue;
    seen.add(`${stopTime.stop_id} ${trip.route_id}`);
  }

  return [...seen]
    .map((key) => {
      const [stop_id, route_id] = key.split(' ');
      return { stop_id, route_id };
    })
    .sort(
      (a, b) =>
        a.stop_id.localeCompare(b.stop_id) || a.route_id.localeCompare(b.route_id),
    );
}

/**
 * Ordered stops per route and direction.
 *
 * A route has thousands of trips that mostly repeat the same path, so one
 * representative trip is enough. The trip visiting the most stops is chosen
 * because short-turn trips would otherwise truncate the route.
 */
export function deriveRouteStops(stopTimesRows, tripsRows) {
  const trips = tripToRoute(tripsRows);

  const countByTrip = new Map();
  for (const stopTime of stopTimesRows) {
    countByTrip.set(stopTime.trip_id, (countByTrip.get(stopTime.trip_id) ?? 0) + 1);
  }

  const bestTrip = new Map();
  for (const [tripId, count] of countByTrip) {
    const trip = trips.get(tripId);
    if (trip === undefined) continue;
    const key = `${trip.route_id} ${trip.direction_id ?? ''}`;
    const current = bestTrip.get(key);
    if (current === undefined || count > current.count) {
      bestTrip.set(key, { count, tripId });
    }
  }

  const keptTrips = new Map();
  for (const [key, { tripId }] of bestTrip) {
    keptTrips.set(tripId, key);
  }

  const sequences = new Map();
  for (const stopTime of stopTimesRows) {
    const key = keptTrips.get(stopTime.trip_id);
    if (key === undefined) continue;
    if (!sequences.has(key)) sequences.set(key, []);
    sequences.get(key).push({
      order: Number(stopTime.stop_sequence),
      stop_id: stopTime.stop_id,
    });
  }

  const out = [];
  for (const key of [...sequences.keys()].sort()) {
    const [route_id, direction_id] = key.split(' ');
    const ordered = sequences.get(key).sort((a, b) => a.order - b.order);
    ordered.forEach((entry, index) => {
      out.push({ route_id, direction_id, seq: index, stop_id: entry.stop_id });
    });
  }
  return out;
}
