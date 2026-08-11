/**
 * What draws over what, in one place.
 *
 * **`Marker`'s `zIndex` is `@platform iOS: Supported`** — checked in
 * `MapMarker.d.ts:257`, which is now a habit rather than a courtesy. Without it
 * MapKit's own words are that "the order of overlays with the same z-index is
 * arbitrary", and arbitrary is what Truman saw on 2026-08-10: *"the arrows, bus
 * stop icons, and live bus icons have inconsistent z-indexes. Messing around
 * with the map often leads to some things being on top of the others
 * inconsistently."*
 *
 * **This is not the `zIndex` the backlog warns about.** That entry blamed
 * `zIndex` for the `-[__NSArrayM insertObject:atIndex:]` SIGABRT, and then
 * **disproved it**: the crash returned on 2026-08-09 with `zIndex` absent from
 * the whole app, twice, with the same stack frame for frame. The entry says so
 * in as many words. What provokes that seam is still open; layering is not it.
 *
 * **One constant per layer, and a marker's z-index never changes while it is
 * mounted.** That restriction is the whole of what makes this safe. The
 * reproduction behind the original removal was `zIndex={selected ? 2 : 1}` on
 * `StopMarker` — selecting stops quickly crashed the app reliably, *the faster
 * the fewer taps* — so what was being exercised was a value being **reassigned**
 * across dozens of live annotations, not the existence of a z-index. A layer
 * constant is assigned once and never touched again.
 *
 * So nothing here is per-selection. A selected stop already reads by *form*,
 * growing rather than rising, which is what `StopMarker`'s own note asked for;
 * a selected bus grows and opens a popup. Neither needs to be reordered, and
 * neither may be.
 *
 * The order is the order of how much each layer is *about* right now:
 *
 * - the **line** is context, and MapKit draws overlays under annotations anyway;
 * - the **arrows** annotate the line, so they sit just above it and below
 *   anything a rider can tap;
 * - **stops** are the reference layer;
 * - **buses** are the live layer and draw over the reference one, which is also
 *   why a bus can be covering a pin at all — see `stopUnderBus`;
 * - the **dropped pin** is a question waiting for an answer, and the answer is a
 *   tap on it, so nothing may cover it.
 */
export const Z = {
  arrow: 1,
  stop: 2,
  bus: 3,
  pending: 4,
} as const;
