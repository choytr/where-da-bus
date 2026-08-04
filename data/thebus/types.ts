/**
 * The app's own vocabulary for live arrivals. Nothing in `features/` sees a
 * vendor response: every field below has been named, typed and range-checked
 * on the way through `parse.ts`.
 *
 * That boundary is not ceremony. The vendor JSON is string-typed throughout,
 * contradicts its own field tables in three places, and uses `"0"` and `"???"`
 * as in-band sentinels — `"0"`/`"0"` for "no GPS fix" being a coordinate in
 * the Gulf of Guinea. Letting any of that reach a screen means every screen
 * has to remember it.
 */

export type Coords = {
  readonly lat: number;
  readonly lon: number;
};

/**
 * Whether a time is a measurement or a guess.
 *
 * The vendor documents `estimated` as `1` = real GPS estimate and `0` =
 * schedule only, and then emits an undocumented `"2"` for 96% of arrivals
 * (1,225 of 1,269 sampled — see docs/api/README.md). So this is derived from a
 * whitelist: `"1"` is live and everything else is scheduled. Testing for
 * `"0"` instead would present almost every schedule guess as a tracked bus.
 */
export type ArrivalEstimate = 'live' | 'scheduled';

export type Arrival = {
  readonly id: string;
  readonly tripId: string;
  /** Route short name. A string, not a number — `"1L"` and `"C"` both occur. */
  readonly route: string;
  readonly headsign: string;
  /** `"Eastbound"` / `"Westbound"` in every sample, but not a closed set. */
  readonly direction: string;
  /** Absolute instant, resolved from the response's `date` *and* `stopTime`. */
  readonly arrivesAt: Date;
  readonly estimate: ArrivalEstimate;
  /** `null` where the vendor sent `"???"`, meaning no bus is assigned yet. */
  readonly vehicle: string | null;
  /** `null` unless the bus has a real GPS fix. Never the `"0"`/`"0"` sentinel. */
  readonly position: Coords | null;
  readonly canceled: boolean;
};

export type ArrivalBoard = {
  readonly stopCode: string;
  /**
   * The server's own clock at the moment it answered. This is what the age
   * shown to the rider is measured from — not the device's clock, and not the
   * moment the response arrived.
   */
  readonly serverTime: Date;
  /** Sorted earliest first. Empty means no buses are due, which is not an error. */
  readonly arrivals: readonly Arrival[];
};

/**
 * The ways asking for arrivals can fail, kept distinct because the screen has
 * to render them differently. An empty board is deliberately *not* here: "no
 * buses coming" and "couldn't reach the API" must never look alike, and the
 * API separates them cleanly (`arrivals: []` with a `stop` and `timestamp`,
 * versus an `errorMessage` with neither).
 */
export type ArrivalsFailure =
  /**
   * The key was rejected. Its own kind rather than an `api` failure carrying
   * the vendor's sentence, because it is the only failure here the user can
   * fix, and the fix is not "wait" — it is "go to Settings".
   *
   * Deliberately carries no message. Observed live on 2026-08-03: a key that
   * was never registered, one that was mistyped, one deleted after six months
   * of inactivity, and no key at all all produce byte-identical responses. The
   * app cannot tell them apart, so a message field would only invite wording
   * that pretends it can.
   */
  | { readonly kind: 'unauthorized' }
  /** The API answered, and said no. Always HTTP 200; the body carries the reason. */
  | { readonly kind: 'api'; readonly message: string }
  /** No usable answer: timeout, offline, DNS, a 404 HTML page, a 5xx. */
  | { readonly kind: 'unreachable' }
  /** An answer arrived and was not a board. Distinct from the two above so a
   *  vendor-side format change is visible rather than looking like an outage. */
  | { readonly kind: 'malformed' };

export type ArrivalsResult =
  | { readonly ok: true; readonly board: ArrivalBoard }
  | { readonly ok: false; readonly failure: ArrivalsFailure };
