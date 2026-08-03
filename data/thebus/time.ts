/**
 * The API's clock. Every time it emits is Hawaii local — `M/D/YYYY` for dates,
 * `h:mm AM` for stop times, and `M/D/YYYY h:mm:ss AM` for the server's own
 * timestamp — and none of them carry a timezone.
 *
 * Hawaii is UTC−10 and does not observe daylight saving, so the offset is a
 * constant rather than something that needs a timezone database. That is the
 * one piece of luck in this format.
 *
 * `Date.parse` is not usable here. Given `"8/1/2026 10:35:40 PM"` it produces a
 * `Date` in the *device's* timezone, which is correct only for a rider who
 * happens to be in Hawaii and silently wrong everywhere else — including on
 * every machine this project is developed on.
 */

/** Hawaii Standard Time, year-round. */
const HST_OFFSET_HOURS = 10;

/**
 * Anchored on purpose. An unanchored version of this pattern matches `08:53 PM`
 * inside `10:08:53 PM`, yielding a time 94 minutes off — wrong by an amount
 * that still looks like a plausible bus, so it reads as the API misbehaving
 * rather than as a parsing bug. Seconds are optional because `stopTime` omits
 * them and `timestamp` includes them.
 */
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i;
const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * A stop time and the date it falls on, together.
 *
 * Both parts are required because the arrivals window crosses midnight: a
 * response at 22:35 routinely carries times belonging to the following day, so
 * `stopTime` alone is ambiguous by 24 hours and `date` is what resolves it.
 *
 * Returns `null` rather than an `Invalid Date` so a caller cannot accidentally
 * carry a broken value forward — `new Date(NaN)` propagates silently through
 * arithmetic and only surfaces at the point of display.
 */
export function hawaiiDateTime(date: string, time: string): Date | null {
  const d = DATE.exec(date);
  const t = TIME.exec(time);
  if (!d || !t) return null;

  const [, month, day, year] = d;
  const [, hour12, minute, second, meridiem] = t;

  const h = Number(hour12);
  const m = Number(minute);
  const s = second === undefined ? 0 : Number(second);
  if (h < 1 || h > 12 || m > 59 || s > 59) return null;

  // 12 AM is hour 0 and 12 PM is hour 12, so the modulo has to come before the
  // PM adjustment rather than after it.
  const hour = (h % 12) + (meridiem?.toUpperCase() === 'PM' ? 12 : 0);

  const stamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour + HST_OFFSET_HOURS,
    m,
    s,
  );

  // Date.UTC rolls impossible dates over rather than rejecting them — 2/31
  // becomes 3/3 — so the components are read back to confirm the calendar
  // accepted what it was given.
  const parsed = new Date(stamp);
  const rolled =
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1;
  return rolled ? null : parsed;
}

/**
 * The server's own `timestamp`, which packs the date and the time into one
 * string with seconds. Split on the first space only: the date has none, and
 * the meridiem is separated from the time by another one.
 */
export function hawaiiTimestamp(stamp: string): Date | null {
  const cut = stamp.indexOf(' ');
  if (cut === -1) return null;
  return hawaiiDateTime(stamp.slice(0, cut), stamp.slice(cut + 1));
}
