import type { RouteDirection } from '../../data/gtfs/db';

/**
 * Which of a route's directions a bus signed `headsign` is running.
 *
 * **This is the join that was missing.** `enterRouteMode` used to open every
 * route at direction 0, while the map hides the other direction's buses by
 * design (`drawsInDirection`) — so a rider tapping a live arrival travelling
 * the other way got a map that had deliberately hidden the bus the row had just
 * promised them. The headsign is the only thing both sides carry: GTFS
 * `trip_headsign`, stored per direction in `route_directions`, and the live
 * feed's `headsign`, which `docs/api/README.md` records as byte-identical to it
 * (`KAHAUIKI KALIHI TRANSIT CNTR SKYLINE STN` appears verbatim in both).
 *
 * **`undefined` means "cannot tell", and is not the same as 0.** A headsign the
 * asset has never seen is the app's ignorance rather than the bus's — GTFS here
 * is reference data that can be weeks stale — and answering 0 would flip a
 * rider who is already looking at direction 1 back to a direction nobody asked
 * for. Undefined leaves the direction exactly as it was, which is what every
 * caller wanted before this existed.
 *
 * Exact equality, for the same reason `drawsInDirection` uses it: there is
 * nothing to normalise between two byte-identical strings, and a future
 * divergence degrades to *cannot tell* rather than to a confident wrong answer.
 *
 * **First match wins, and twelve routes make that a real choice.** 123, 14,
 * 444, 51, 52, 521, 53, 535, 54, 6, 7 and 8 sign both directions the same way
 * — mostly loops, where "direction" is a weak idea to begin with. Their buses
 * already draw both ways (`drawsInDirection` puts a shared headsign in
 * `showing` for both), so either index shows the bus, and the first is the one
 * the feed numbers first.
 */
export function directionIndexFor(
  directions: readonly RouteDirection[],
  headsign: string | null,
): number | undefined {
  if (headsign === null) return undefined;
  const index = directions.findIndex((direction) =>
    direction.headsigns.some((sign) => sign === headsign),
  );
  return index === -1 ? undefined : index;
}
