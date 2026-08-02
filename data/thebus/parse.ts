import { hawaiiDateTime, hawaiiTimestamp } from './time';
import type { Arrival, ArrivalEstimate, ArrivalsResult, Coords } from './types';

/**
 * Vendor JSON in, app types out. This is the only place in the project that
 * knows what `"???"`, `"0"` and `estimated: "2"` mean.
 *
 * Everything arrives as `unknown` and is narrowed with real runtime checks
 * rather than assertions. That is not only the project's TypeScript rule: the
 * vendor's own field tables disagree with the vendor's own examples in three
 * places, so a declared response type would be a guess dressed as a contract.
 * Checking is the honest option, and it is what makes a format change surface
 * as `malformed` instead of as `undefined` reaching a screen.
 */

const malformed: ArrivalsResult = { ok: false, failure: { kind: 'malformed' } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

/**
 * A coordinate pair, or `null` for the sentinel.
 *
 * `"0"`/`"0"` is how the API says "no GPS fix" — not `null`, not an absent
 * key. Taken literally it is a point in the Gulf of Guinea, roughly 6,000 km
 * from Oahu, so a map pin would land off the coast of Africa.
 */
function position(latitude: string | null, longitude: string | null): Coords | null {
  if (latitude === null || longitude === null) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

/**
 * `"1"` and nothing else is a live GPS estimate.
 *
 * A whitelist rather than `!== "0"`, because the API emits an undocumented
 * `"2"` for the overwhelming majority of arrivals. The inverted test would
 * have presented 1,225 of 1,269 sampled schedule guesses as tracked buses.
 */
function estimate(estimated: string | null): ArrivalEstimate {
  return estimated === '1' ? 'live' : 'scheduled';
}

/**
 * One arrival, or `null` if it cannot be read.
 *
 * A single unreadable entry does not sink the board. A rider standing at the
 * stop is better served by the twenty-four arrivals that did parse than by an
 * error screen, and a board that silently loses one row is visibly a board.
 */
function arrival(value: unknown): Arrival | null {
  if (!isRecord(value)) return null;

  const id = str(value, 'id');
  const tripId = str(value, 'trip');
  const route = str(value, 'route');
  const headsign = str(value, 'headsign');
  const direction = str(value, 'direction');
  const date = str(value, 'date');
  const stopTime = str(value, 'stopTime');
  if (
    id === null ||
    tripId === null ||
    route === null ||
    headsign === null ||
    direction === null ||
    date === null ||
    stopTime === null
  ) {
    return null;
  }

  // `date` is load-bearing: the window routinely crosses midnight, so a time
  // read without its date can be a full day wrong.
  const arrivesAt = hawaiiDateTime(date, stopTime);
  if (arrivesAt === null) return null;

  const vehicle = str(value, 'vehicle');

  return {
    id,
    tripId,
    route,
    headsign,
    direction,
    arrivesAt,
    estimate: estimate(str(value, 'estimated')),
    // "???" is a literal sentinel for "no bus assigned yet", not a number.
    vehicle: vehicle === null || vehicle === '???' ? null : vehicle,
    position: position(str(value, 'latitude'), str(value, 'longitude')),
    // "1" is canceled; "-1" means it was canceled and has been reinstated,
    // which is a bus that is running.
    canceled: str(value, 'canceled') === '1',
  };
}

/**
 * The parsed body of an `arrivalsJSON` response.
 *
 * Order of checks matters. `errorMessage` is tested first because the API
 * returns errors with **HTTP 200** — the status line carries no signal at all,
 * so a caller that branched on `res.ok` would treat "Invalid or unspecified
 * API key" as a successful empty board.
 */
export function parseArrivals(body: unknown): ArrivalsResult {
  if (!isRecord(body)) return malformed;

  const message = str(body, 'errorMessage');
  if (message !== null) {
    return { ok: false, failure: { kind: 'api', message } };
  }

  const stopCode = str(body, 'stop');
  const timestamp = str(body, 'timestamp');
  if (stopCode === null || timestamp === null) return malformed;

  const serverTime = hawaiiTimestamp(timestamp);
  if (serverTime === null) return malformed;

  // A missing array is malformed, never an empty board. The vendor's field
  // table calls this `arrival` while every example emits `arrivals`; if they
  // ever ship the singular, reporting "no buses coming" would be a lie that
  // looks exactly like the truth.
  const raw = body['arrivals'];
  if (!Array.isArray(raw)) return malformed;

  const arrivals = raw
    .map(arrival)
    .filter((a): a is Arrival => a !== null)
    // The API delivers these in order already; sorting makes the display
    // order a property of this module rather than a habit of the server.
    .sort((a, b) => a.arrivesAt.getTime() - b.arrivesAt.getTime());

  return { ok: true, board: { stopCode, serverTime, arrivals } };
}
