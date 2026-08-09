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
  /**
   * The `shape_id` of the exact variant this bus is running, keying into the
   * asset's `shapes` table.
   *
   * Present on every arrival in the real capture, unlike `position`, which 23 of
   * 25 withhold — which is why the asset stores all 532 variants rather than one
   * representative per route and direction. A short-turn or an express run is a
   * different shape from the one the route view draws.
   */
  readonly shape: string | null;
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
export type ApiFailure =
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

/**
 * The arrivals endpoint's failures are the fleet endpoint's failures, so there
 * is one type with two names rather than two identical types. The alias keeps
 * every existing `ArrivalsFailure` reading naturally at a call site about
 * arrivals.
 */
export type ArrivalsFailure = ApiFailure;

export type ArrivalsResult =
  | { readonly ok: true; readonly board: ArrivalBoard }
  | { readonly ok: false; readonly failure: ApiFailure };

/**
 * One bus, from the fleet endpoint.
 *
 * **There is no field for the driver, and that is the point.** `<driver>` is an
 * employee number — confirmed by the vendor documentation — and it sits directly
 * beside `<number>`, the fleet number, which *is* what gets displayed. Dropping
 * it at this boundary rather than merely not rendering it means no screen can
 * show one and no log can print one, because the app has no way to say it.
 */
export type Vehicle = {
  /** The fleet number painted on the bus. This is what a rider is shown. */
  readonly number: string;
  /** Joins to `Arrival.tripId`, which is how tapping an arrival finds its bus. */
  readonly tripId: string | null;
  /**
   * The number on the front of the bus. `null` where the vendor sent the
   * literal string `"null"`, which 17 of 235 live buses do — so some real buses
   * cannot be attributed to a route at all. Known, and accepted.
   */
  readonly route: string | null;
  /** Required: a bus with no position is not a bus this app can draw. */
  readonly position: Coords;
  readonly headsign: string | null;
  /**
   * Minutes off schedule. **Positive means *early***, and nothing bounds it to
   * ±60. Carried but deliberately unrendered — where lateness is shown is
   * deferred in `docs/backlog.md`, so surfacing it later is a UI change and not
   * a data change.
   */
  readonly adherence: number | null;
  /**
   * When this bus last reported. The whole freshness rule hangs off it: most of
   * the fleet response is buses parked since 2022 carrying entirely plausible
   * Oahu coordinates, so an unfiltered draw puts ~1,100 ghosts on the map.
   */
  readonly lastMessage: Date;
};

export type Fleet = {
  /** The server's own clock when it answered — what a bus's age is measured from. */
  readonly serverTime: Date;
  readonly vehicles: readonly Vehicle[];
};

export type FleetResult =
  | { readonly ok: true; readonly fleet: Fleet }
  | { readonly ok: false; readonly failure: ApiFailure };
