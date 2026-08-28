import { hawaiiTimestamp } from './time';
import { isKeyRejection } from './parse';
import type { Coords, Fleet, FleetResult, Vehicle } from './types';

/**
 * Vendor XML in, app types out — the fleet endpoint's half of the boundary
 * `parse.ts` owns for arrivals.
 *
 * **The parser is hand-rolled rather than a dependency.** The document is flat
 * and shallow: one `<timestamp>`, then a run of `<vehicle>` elements whose
 * children are all leaf text. Expo Go's SDK ceiling makes every added package a
 * real architectural cost (see `CLAUDE.md`), and this is forty lines.
 *
 * **`<driver>` is read by nothing here.** It is an employee number, it sits
 * directly beside `<number>` — the fleet number, which *is* displayed — and the
 * app's `Vehicle` type has no field for it. Dropping it at the boundary rather
 * than merely not rendering it is what makes displaying or logging one
 * unexpressible instead of merely unlikely.
 */

const malformed: FleetResult = { ok: false, failure: { kind: 'malformed' } };

/**
 * A leaf element and its text, anywhere in `xml`.
 *
 * Non-greedy so `<a>1</a><a>2</a>` is two matches rather than one spanning
 * both, and `[\s\S]` rather than `.` because the vendor wraps lines inside
 * elements.
 */
const ELEMENT = /<([A-Za-z_][\w.-]*)\s*>([\s\S]*?)<\/\1\s*>/g;

/** `<trip/>`, which the vendor emits for a bus between assignments. */
const EMPTY_ELEMENT = /<([A-Za-z_][\w.-]*)\s*\/>/g;

const VEHICLE = /<vehicle\s*>([\s\S]*?)<\/vehicle\s*>/g;

/**
 * A capture group's text.
 *
 * A group that took part in a match always has a value, but the type says
 * `string | undefined` and this project does not write assertions to argue with
 * it. Empty string is the right reading anyway: an element that matched with
 * nothing inside it carries no text.
 */
function group(match: RegExpExecArray, index: number): string {
  return match[index] ?? '';
}

const NAMED_ENTITY: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * XML entities back to characters.
 *
 * Headsigns are the reason: they are free text off a destination sign and
 * `KAPOLEI &amp; MAKAKILO` is a real one. `&amp;` has to be resolved last in
 * effect — handled here by resolving each escape once, in a single pass, so
 * `&amp;lt;` stays the literal text `&lt;` rather than becoming `<`.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body.startsWith('#x') || body.startsWith('#X')
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITY[body] ?? whole;
  });
}

/**
 * The leaf elements of one block, as a map.
 *
 * A map rather than a regex per field: the document is flat, so one pass
 * collects everything and no field costs another scan of the 333 KB body.
 * A repeated tag keeps the first — the vendor emits none, and picking the first
 * is at least a stated rule rather than whichever the loop ended on.
 */
function fields(block: string): Map<string, string> {
  const found = new Map<string, string>();

  ELEMENT.lastIndex = 0;
  for (let match = ELEMENT.exec(block); match !== null; match = ELEMENT.exec(block)) {
    const tag = group(match, 1);
    if (!found.has(tag)) found.set(tag, decodeEntities(group(match, 2)).trim());
  }

  EMPTY_ELEMENT.lastIndex = 0;
  for (let match = EMPTY_ELEMENT.exec(block); match !== null; match = EMPTY_ELEMENT.exec(block)) {
    const tag = group(match, 1);
    if (!found.has(tag)) found.set(tag, '');
  }

  return found;
}

/** A field's text, or null when it is absent or blank. Blank is not a value. */
function text(from: Map<string, string>, key: string): string | null {
  const value = from.get(key);
  return value === undefined || value === '' ? null : value;
}

/**
 * A coordinate pair, or null.
 *
 * `"0"`/`"0"` is rejected for the same reason `parse.ts` rejects it on
 * arrivals: taken literally it is a point in the Gulf of Guinea, 6,000 km from
 * Oahu, so a bus would be drawn off the coast of Africa.
 */
function position(from: Map<string, string>): Coords | null {
  const latitude = text(from, 'latitude');
  const longitude = text(from, 'longitude');
  if (latitude === null || longitude === null) return null;

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

/**
 * The route this bus is running, or null.
 *
 * The vendor sends the **literal four-character string `"null"`** rather than an
 * empty element — for the whole stale bulk of the fleet, and for 17 of 235 live
 * buses. Reading it as a route number would put a route called "null" on the
 * map and, worse, would match nothing when filtering.
 */
function route(from: Map<string, string>): string | null {
  const value = text(from, 'route_short_name');
  return value === null || value.toLowerCase() === 'null' ? null : value;
}

function adherence(from: Map<string, string>): number | null {
  const value = text(from, 'adherence');
  if (value === null) return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) ? minutes : null;
}

/**
 * One bus, or null if it cannot be read.
 *
 * A single unreadable element does not sink the fleet, for the same reason one
 * unreadable arrival does not sink a board: 234 buses drawn is a better answer
 * than an error screen. The three requirements are a fleet number, a real
 * position, and a readable `last_message` — without any of them there is
 * nothing to draw, nowhere to draw it, or no way to know whether it is a ghost.
 */
function vehicle(block: string): Vehicle | null {
  const from = fields(block);

  const number = text(from, 'number');
  if (number === null) return null;

  const at = position(from);
  if (at === null) return null;

  const reported = text(from, 'last_message');
  if (reported === null) return null;
  const lastMessage = hawaiiTimestamp(reported);
  if (lastMessage === null) return null;

  const tripId = text(from, 'trip');

  return {
    number,
    // `"null_trip"` is this feed's way of saying a bus is reporting without a
    // trip — a deadhead, or a run the AVL has not attached yet. A literal
    // string here would be an id that joins to nothing while looking like one.
    tripId: tripId === 'null_trip' ? null : tripId,
    route: route(from),
    position: at,
    headsign: text(from, 'headsign'),
    adherence: adherence(from),
    lastMessage,
    // No `driver`. See this file's header — the omission is the feature.
  };
}

/**
 * The parsed body of a `vehicle/` response.
 *
 * `errorMessage` is tested first because this API returns errors with **HTTP
 * 200**, exactly as `arrivalsJSON` does — the status line carries no signal, so
 * a caller branching on `res.ok` would read a rejected key as an empty fleet.
 *
 * **Nothing here trusts a `Content-Type` header.** The document identifies
 * itself: a body with neither `<vehicles>` nor `<errorMessage>` is `malformed`,
 * which is what classifies the IIS HTML 404 page without depending on a header
 * this vendor has already been observed to get wrong elsewhere.
 */
export function parseVehicles(xml: string): FleetResult {
  const error = /<errorMessage\s*>([\s\S]*?)<\/errorMessage\s*>/.exec(xml);
  if (error !== null) {
    const message = decodeEntities(group(error, 1)).trim();
    return isKeyRejection(message)
      ? { ok: false, failure: { kind: 'unauthorized' } }
      : { ok: false, failure: { kind: 'api', message } };
  }

  if (!/<vehicles\s*>/.test(xml)) return malformed;

  // Read before the vehicles are walked: a body that carries buses but no
  // readable clock gives no way to say how old any of them is, and an age is
  // the whole of what makes a fleet position trustworthy.
  const stamp = /<timestamp\s*>([\s\S]*?)<\/timestamp\s*>/.exec(xml);
  if (stamp === null) return malformed;
  const serverTime = hawaiiTimestamp(decodeEntities(group(stamp, 1)).trim());
  if (serverTime === null) return malformed;

  const vehicles: Vehicle[] = [];
  VEHICLE.lastIndex = 0;
  for (let match = VEHICLE.exec(xml); match !== null; match = VEHICLE.exec(xml)) {
    const parsed = vehicle(group(match, 1));
    if (parsed !== null) vehicles.push(parsed);
  }

  const fleet: Fleet = { serverTime, vehicles };
  return { ok: true, fleet };
}
