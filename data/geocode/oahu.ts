import type { Coords } from '../../lib/distance';

/**
 * Turning what someone typed into a point on Oahu, or admitting it is not one.
 *
 * **The geocoder has no idea where it is.** Measured on a device 2026-08-08,
 * through the throwaway probe in Settings: `"university"` resolved to State
 * College, Pennsylvania and a bare `"u"` to Sacramento, California, each
 * returned as a single confident result with nothing marking it as five
 * thousand kilometres away. Only `"2500 campus road"` landed on the island.
 *
 * Expo SDK 54's `Location.geocodeAsync(address: string)` takes an address and
 * nothing else — verified against the installed type definitions, not the
 * docs. `CLGeocoder` can be given a region to search within; that parameter is
 * not exposed. So the biasing is done here, and it takes three steps rather
 * than the two it started with:
 *
 * 1. **Steer the question.** Unless the text already names the state, `, HI` is
 *    appended, which is what a person would have typed if they had thought
 *    about it. Device-confirmed as worth doing: `"university"` alone resolves
 *    to Pennsylvania, `"university, HI"` to Honolulu.
 * 2. **Ask again without the steer, if that found nothing on the island.**
 *    Appending can *break* a query that would have worked. Measured
 *    2026-08-08: `"ala moana beach"` resolves correctly to Ala Moana, and
 *    `"ala moana beach, HI"` returns zero results. A hint that turns a right
 *    answer into no answer is worse than no hint, so the plain text gets its
 *    turn too.
 * 3. **Check the answer.** Whatever comes back, from either attempt, is tested
 *    against Oahu's bounding box — steering is a hint and not a guarantee, and
 *    the whole problem is a geocoder that answers confidently from the wrong
 *    continent.
 *
 * The cost is a second network round trip on the queries that fail the first
 * time. Apple asks for at most one geocode per user action; this is one per
 * *submission*, worst case two, and the second only happens when the first
 * produced nothing usable.
 *
 * The two failures are kept apart, as failures are everywhere else in this
 * app. "There is no such address here" and "that address is real, and it is not
 * on this island" are different things to be told, and a rider who typed a
 * mainland street deserves the second rather than a shrug.
 */

/**
 * Oahu, with a little slack. Kaena Point in the west, Makapuu in the east,
 * Kahuku in the north, and the Ka Iwi shoreline in the south.
 *
 * Generous on purpose: this is here to reject Pennsylvania, not to adjudicate
 * whether a point is over the reef.
 */
export const OAHU_BOUNDS = {
  minLat: 21.2,
  maxLat: 21.75,
  minLon: -158.35,
  maxLon: -157.6,
} as const;

export function isOnOahu({ lat, lon }: Coords): boolean {
  return (
    lat >= OAHU_BOUNDS.minLat &&
    lat <= OAHU_BOUNDS.maxLat &&
    lon >= OAHU_BOUNDS.minLon &&
    lon <= OAHU_BOUNDS.maxLon
  );
}

/** Already names the state or the city, so appending would only confuse it. */
const NAMES_THE_PLACE = /\b(hi|hawaii|hawai'i|hawaiʻi|honolulu|oahu|o'ahu|oʻahu)\b/i;

/**
 * What actually gets asked. Exported because it is the half of the fix that is
 * a guess about someone else's matcher, and a test that pins it down is worth
 * more than the comment above it.
 */
export function biasedQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed === '') return trimmed;
  return NAMES_THE_PLACE.test(trimmed) ? trimmed : `${trimmed}, HI`;
}

export type GeocodeResult =
  /** A point on the island, ready to anchor the map on. */
  | { kind: 'found'; coords: Coords }
  /** The geocoder was sure, and it was somewhere else entirely. */
  | { kind: 'offIsland' }
  /** Nothing matched at all. */
  | { kind: 'none' }
  /** The lookup itself failed — offline, rate-limited, refused. */
  | { kind: 'failed' };

/** Just enough of `expo-location` to be substituted in a test. */
export type GeocodeFn = (address: string) => Promise<{ latitude: number; longitude: number }[]>;

/**
 * `geocode` is injected rather than imported so this can be tested without the
 * native module, and so the one place that knows about `expo-location` stays
 * the caller. Everything above is arithmetic and string handling.
 */
export async function findOnOahu(query: string, geocode: GeocodeFn): Promise<GeocodeResult> {
  const plain = query.trim();
  if (plain === '') return { kind: 'none' };

  const biased = biasedQuery(plain);
  // Only worth a second attempt when the two are actually different questions.
  const attempts = biased === plain ? [plain] : [biased, plain];

  let sawSomething = false;

  for (const address of attempts) {
    let results: { latitude: number; longitude: number }[];
    try {
      results = await geocode(address);
    } catch {
      // A thrown lookup is not "no such place" — the phone may simply be
      // offline, and saying "nothing matched" to that would be a lie.
      return { kind: 'failed' };
    }

    // The first result *on the island*, not the first result. The geocoder has
    // returned one match every time it has been watched, but nothing documents
    // that, and taking the first blindly is how Pennsylvania got on screen.
    for (const result of results) {
      const coords = { lat: result.latitude, lon: result.longitude };
      if (isOnOahu(coords)) return { kind: 'found', coords };
    }

    sawSomething ||= results.length > 0;
  }

  // Something matched, somewhere, and none of it was here.
  return sawSomething ? { kind: 'offIsland' } : { kind: 'none' };
}
