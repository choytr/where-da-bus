import type { Coords } from '../../lib/distance';

/**
 * Google's encoded-polyline format, at precision 5 (~1.1 m).
 *
 * A route shape is a few thousand coordinate pairs, and stored as JSON that is
 * roughly 40 bytes a point. Encoded it is 4–6, because consecutive points on a
 * road differ in their fifth decimal place and the format stores only the
 * difference. That is the whole reason all 532 shape variants fit in ~152 KiB
 * rather than the 9.8 MB `shapes.txt` they come from.
 *
 * **This file is shared, and that is deliberate.** `scripts/build-gtfs/emit.mjs`
 * imports `encodePolyline` from here the same way it imports `SCHEMA_VERSION`
 * from `sql.ts` — Node strips the types and loads it directly, which
 * `data/gtfs/package.json`'s three bytes of `{"type":"module"}` are what make
 * possible. An encoder in the build and a decoder in the app that were written
 * twice could disagree, and the failure would be a route drawn through the sea.
 *
 * `Coords` arrives through `import type`, which type stripping erases, so
 * importing it costs the build script nothing at runtime. Do not declare a
 * second coordinate type here to avoid it.
 */

/** Five decimal places. Changing this changes every stored polyline. */
const PRECISION = 1e5;

/**
 * Five-bit chunks, ASCII-shifted by 63 so every byte is printable.
 *
 * 0x20 is the continuation bit: it is set on every chunk except the last of a
 * value, which is what lets a reader find the boundary without a separator.
 */
const CHUNK_BITS = 5;
const CHUNK_MASK = 0x1f;
const CONTINUATION = 0x20;
const ASCII_OFFSET = 63;

/**
 * One signed value, zigzagged so that small negatives cost one byte rather
 * than six.
 *
 * The left shift is the zigzag; the conditional inversion is what maps −1 to 1
 * and 1 to 2, keeping the magnitude of the *encoded* number proportional to the
 * magnitude of the original rather than to its sign.
 */
function encodeValue(value: number): string {
  let zigzag = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (zigzag >= CONTINUATION) {
    out += String.fromCharCode((CONTINUATION | (zigzag & CHUNK_MASK)) + ASCII_OFFSET);
    zigzag >>= CHUNK_BITS;
  }
  return out + String.fromCharCode(zigzag + ASCII_OFFSET);
}

/**
 * Points to an encoded polyline.
 *
 * **Deltas are taken between the *rounded* values, never between the raw ones.**
 * Rounding after subtracting lets a half-unit of error accumulate across a few
 * thousand points, and the shape drifts steadily off the road it describes —
 * a failure that looks like bad source data rather than like arithmetic.
 */
export function encodePolyline(points: readonly Coords[]): string {
  let previousLat = 0;
  let previousLon = 0;
  let out = '';

  for (const point of points) {
    const lat = Math.round(point.lat * PRECISION);
    const lon = Math.round(point.lon * PRECISION);
    out += encodeValue(lat - previousLat);
    out += encodeValue(lon - previousLon);
    previousLat = lat;
    previousLon = lon;
  }

  return out;
}

/**
 * An encoded polyline back to points.
 *
 * Trailing or malformed bytes yield the points read so far rather than
 * throwing: this decodes data that arrived over the network in a published
 * database, and a route that draws short is a better failure at a bus stop
 * than a screen that does not draw.
 */
export function decodePolyline(encoded: string): Coords[] {
  const points: Coords[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index) - ASCII_OFFSET;
      index += 1;
      result |= (byte & CHUNK_MASK) << shift;
      shift += CHUNK_BITS;
    } while (byte >= CONTINUATION && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // A value whose companion is missing is a truncated pair, not a point.
    if (index >= encoded.length) break;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index) - ASCII_OFFSET;
      index += 1;
      result |= (byte & CHUNK_MASK) << shift;
      shift += CHUNK_BITS;
    } while (byte >= CONTINUATION && index < encoded.length);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / PRECISION, lon: lon / PRECISION });
  }

  return points;
}
