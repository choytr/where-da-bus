/**
 * Douglas–Peucker line simplification with a tolerance in metres.
 *
 * Build-only, and deliberately not in `data/gtfs/polyline.ts` alongside the
 * codec. The encoder and decoder must agree or a route draws through the sea,
 * which is why those two are one shared file; simplification happens once, in
 * this script, and the app never needs it.
 *
 * Oahu's `shapes.txt` is 9.8 MB at full precision. At 10 m — the tolerance the
 * increment settled on — all 532 variants store in ~152 KiB, and 10 m is well
 * under the width of the roads being drawn.
 */

const METERS_PER_DEGREE_LAT = 111320;

/**
 * Local flat projection, in metres, about a reference point.
 *
 * Equirectangular rather than anything spherical: this measures the sagitta of
 * a few hundred metres of road, where the error of pretending Oahu is flat is
 * far below the tolerance being tested against. `boundingBox` in
 * `data/gtfs/sql.ts` makes the same approximation for the same reason.
 */
function projector(reference) {
  const lonScale = Math.cos((reference.lat * Math.PI) / 180);
  return (point) => ({
    x: (point.lon - reference.lon) * METERS_PER_DEGREE_LAT * lonScale,
    y: (point.lat - reference.lat) * METERS_PER_DEGREE_LAT,
  });
}

/**
 * Distance from `p` to the **segment** `a`–`b`, not to the infinite line
 * through them.
 *
 * Textbook Douglas–Peucker uses the line. The segment is what is actually being
 * drawn, and the two differ where a shape doubles back on itself — a bus loop
 * at a terminus, which Oahu's feed has plenty of. Measuring to the line there
 * reports a point as near to a segment it is nowhere near, and the loop
 * collapses.
 */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment is a repeated point; distance to it is distance to it.
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  // Clamped, which is what makes this the segment rather than the line.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * `points`, thinned so that no discarded point lies further than
 * `toleranceMeters` from the line that replaces it. The first and last points
 * are always kept.
 *
 * Iterative with an explicit stack rather than recursive. A GTFS shape runs to
 * a few thousand points and the recursion depth of Douglas–Peucker is bounded
 * only by the input in the worst case — a gently curving road being exactly
 * that case, splitting one point off at a time.
 */
export function simplify(points, toleranceMeters) {
  if (points.length <= 2) return [...points];

  const project = projector(points[0]);
  const flat = points.map(project);

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let furthest = -1;
    let furthestDistance = toleranceMeters;

    for (let i = first + 1; i < last; i += 1) {
      const distance = distanceToSegment(flat[i], flat[first], flat[last]);
      if (distance > furthestDistance) {
        furthest = i;
        furthestDistance = distance;
      }
    }

    // Nothing between them strays far enough to be worth a point.
    if (furthest === -1) continue;

    keep[furthest] = true;
    stack.push([first, furthest], [furthest, last]);
  }

  return points.filter((_, index) => keep[index]);
}
