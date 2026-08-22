import { metersBetween, type Coords } from '../../lib/distance';
import type { Stop } from '../../data/gtfs/types';

/**
 * Which stop a bus is heading for next.
 *
 * The popup used to name the stop the dot happened to be **covering**, which
 * was about the map rather than about the bus. Truman, 2026-08-21: *"I now
 * think it'd be more intuitive for it to show that bus' next stop. Ignore the
 * overlapping stop(s)."*
 *
 * **Neither feed carries it.** A `Vehicle` has a position, a trip and a
 * headsign and no notion of where it is going next, and the arrivals endpoint
 * answers for one stop at a time. So it is derived: both the bus and the stops
 * are projected onto the route's own drawn line, and the next stop is the first
 * one further along it than the bus.
 *
 * **Along the line, not nearest by air.** Nearest-stop-then-next is wrong twice
 * over — it skips a stop whenever the bus is a little past the midpoint, and it
 * picks the wrong side of the street where a route doubles back, which on Oahu
 * is most of Kalihi. Eight route/directions serve the same stop twice, and
 * measuring along the line is what tells those two calls apart.
 */

/** Metres per degree of latitude. Constant enough anywhere on Earth for this. */
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * The line as a flat plane in metres, so a projection is ordinary geometry.
 *
 * Oahu is small enough that a local tangent plane is exact to well under a
 * metre, and a metre is a fraction of the width of the road being drawn.
 */
function planeAround(origin: Coords) {
  const lonScale = Math.cos((origin.lat * Math.PI) / 180);
  return (at: Coords) => ({
    x: (at.lon - origin.lon) * METERS_PER_DEGREE_LAT * lonScale,
    y: (at.lat - origin.lat) * METERS_PER_DEGREE_LAT,
  });
}

/**
 * How far along `line` a point sits, in metres, or null when the line is not a
 * line.
 *
 * Takes the *closest* segment rather than the first one within some tolerance,
 * which is what makes it right where a route runs back along itself: both
 * passes are candidates and the nearer one wins.
 */
export function distanceAlong(line: readonly Coords[], point: Coords): number | null {
  const origin = line[0];
  if (origin === undefined || line.length < 2) return null;
  const flat = planeAround(origin);
  const p = flat(point);

  let travelled = 0;
  let best: { at: number; away: number } | null = null;

  for (let i = 0; i + 1 < line.length; i += 1) {
    const from = line[i]!;
    const to = line[i + 1]!;
    const a = flat(from);
    const b = flat(to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;

    // Where the point falls on this segment, clamped to its ends.
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length)));
    const away = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (best === null || away < best.away) best = { at: travelled + length * t, away };

    travelled += length;
  }

  return best?.at ?? null;
}

/**
 * The first stop further along `line` than `at`, or null.
 *
 * Null when the line is unusable, or when the bus is past every stop on it —
 * the end of the run, where there is no next stop and saying so would be an
 * invention.
 */
export function nextStopAlong(
  line: readonly Coords[],
  stops: readonly Stop[],
  at: Coords,
): Stop | null {
  const busAt = distanceAlong(line, at);
  if (busAt === null) return null;

  let best: { stop: Stop; at: number } | null = null;
  for (const stop of stops) {
    const stopAt = distanceAlong(line, stop);
    if (stopAt === null || stopAt <= busAt) continue;
    if (best === null || stopAt < best.at) best = { stop, at: stopAt };
  }

  return best?.stop ?? null;
}

/**
 * How close a bus has to be to the line before "next stop" means anything.
 *
 * A bus running the other direction, or one the feed has put on the wrong
 * street, projects onto this line somewhere arbitrary — and an arbitrary answer
 * stated confidently is worse than none. Generous, because a shape thinned to
 * 10 m and a GPS fix are each allowed to be a few tens of metres out.
 */
export const ON_LINE_METERS = 150;

/** Whether `at` is close enough to `line` for `nextStopAlong` to be believed. */
export function isOnLine(line: readonly Coords[], at: Coords): boolean {
  const origin = line[0];
  if (origin === undefined || line.length < 2) return false;
  const along = distanceAlong(line, at);
  if (along === null) return false;

  // Cheapest sufficient check: the nearest vertex is within tolerance plus the
  // longest a thinned segment is likely to be.
  let nearest = Infinity;
  for (const point of line) nearest = Math.min(nearest, metersBetween(point, at));
  return nearest <= ON_LINE_METERS;
}
