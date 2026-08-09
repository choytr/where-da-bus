import { findOnOahu, type GeocodeFn } from '../../data/geocode/oahu';
import type { Coords } from '../../lib/distance';

/**
 * Turning a typed address into a point the map can be moved to, and a line a
 * rider can recognise before it moves.
 *
 * **The confirmation is the whole design.** `data/geocode/oahu.ts` steers the
 * question towards the island and checks the answer against a bounding box, but
 * it is still a geocoder that answered "State College, Pennsylvania" to
 * `"university"` with complete confidence. A hit inside the box is far more
 * likely to be right than wrong, and "far more likely" is not a reason to throw
 * away someone's view of the map without asking. So the app says what it found,
 * in words, and the rider says whether that is the place.
 *
 * That is also why the *reverse* lookup exists at all. `geocodeAsync` returns
 * coordinates and nothing printable — no street, no name, no city, verified
 * against the installed types on 2026-08-09 — so there is nothing to put in the
 * question until the point is turned back into an address.
 */

/**
 * The part of `expo-location`'s `LocationGeocodedAddress` this uses. Declared
 * structurally, like `GeocodeFn`, so the module can be tested without the native
 * module — and so the real one is assignable to it without an assertion.
 */
export type Place = {
  streetNumber: string | null;
  street: string | null;
  name: string | null;
  city: string | null;
};

export type ReverseGeocodeFn = (
  at: { latitude: number; longitude: number },
) => Promise<Place[]>;

/**
 * The four ends of a submitted address, kept apart exactly as §4 requires.
 *
 * `offIsland` is the one worth the extra state: "that address is real, and it is
 * not on this island" is a different thing to be told than "there is no such
 * address", and a rider who typed a mainland street deserves the first rather
 * than a shrug. `failed` is neither — the lookup did not happen, and saying
 * "nothing matched" to an offline phone would be a lie.
 */
export type AddressLookup =
  | { state: 'idle' }
  | { state: 'looking' }
  | { state: 'confirming'; label: string; coords: Coords }
  | { state: 'offIsland' }
  | { state: 'none' }
  | { state: 'failed' };

/** Shared constants, so a reset to idle is not a new object every render. */
export const IDLE: AddressLookup = { state: 'idle' };
export const LOOKING: AddressLookup = { state: 'looking' };

const nonEmpty = (value: string | null): value is string =>
  value !== null && value.trim() !== '';

/**
 * "2500 Campus Rd, Honolulu" — the street line and the city, and nothing else.
 *
 * Built from the parts rather than read off `formattedAddress`, which is
 * documented Android-only and is `null` on the platform this ships to. The
 * region, postal code and country are left out on purpose: the question is
 * *"did you mean this place"*, and every extra component is another thing to
 * read before answering it.
 *
 * `fallback` is what the rider typed, and it is used whenever the reverse
 * lookup came back with nothing printable. A geocode that landed on the island
 * is a good answer, and it must not be thrown away because the address behind
 * it could not be named.
 */
export function addressLabel(place: Place | undefined, fallback: string): string {
  if (place === undefined) return fallback;

  const street = [place.streetNumber, place.street].filter(nonEmpty).join(' ');
  const line = street !== '' ? street : place.name;
  const parts = [line, place.city].filter(nonEmpty);

  return parts.length === 0 ? fallback : parts.join(', ');
}

/**
 * One submitted query, all the way to something the overlay can render.
 *
 * Both lookups are injected rather than imported, for the reason `findOnOahu`'s
 * is: this file stays testable without the native module, and the one place
 * that knows about `expo-location` stays the caller.
 */
export async function lookUpAddress(
  query: string,
  geocode: GeocodeFn,
  reverseGeocode: ReverseGeocodeFn,
): Promise<AddressLookup> {
  const found = await findOnOahu(query, geocode);
  if (found.kind === 'offIsland') return { state: 'offIsland' };
  if (found.kind === 'none') return { state: 'none' };
  if (found.kind === 'failed') return { state: 'failed' };

  const { coords } = found;
  const typed = query.trim();

  try {
    const places = await reverseGeocode({ latitude: coords.lat, longitude: coords.lon });
    return { state: 'confirming', label: addressLabel(places[0], typed), coords };
  } catch {
    // **A failed reverse lookup must not lose a good geocode.** The point is
    // already known to be on the island; all that is missing is its name, and
    // the rider supplied a serviceable one by typing it. Refusing to move here
    // would fail a search that had actually succeeded.
    return { state: 'confirming', label: typed, coords };
  }
}
