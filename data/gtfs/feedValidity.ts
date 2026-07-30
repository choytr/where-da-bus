/**
 * How long the bundled reference data claims to be good for.
 *
 * The GTFS feed states a last day of validity (`feed_info.txt`'s
 * `feed_end_date`, carried into the `meta` table by the build). Past that day
 * the stop names, codes and coordinates on the device are simply old — not
 * broken, not an error, just no longer the publisher's current answer. Saying
 * so is the whole job here; refreshing the feed is Increment 3's.
 *
 * Pure and clock-injected: every function takes the `now` it should compare
 * against, so the tests do not go stale on the day the shipped feed does.
 */

/**
 * The three things the screen can honestly say. `unknown` is deliberately not
 * folded into `current` — "the feed never said when it expires" is not the
 * same fact as "it has not expired yet", and only the second one is a promise.
 */
export type FeedValidity =
  | { state: 'unknown' }
  | { state: 'current'; endsOn: Date }
  | { state: 'expired'; endsOn: Date };

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Parses GTFS's `YYYYMMDD` into the final instant of that day, local time.
 *
 * End of day rather than midnight because `feed_end_date` names the last day
 * the data is valid *through*, so a feed ending 20260822 is still current all
 * day on the 22nd. Local time because that is the clock the rider is standing
 * under; the feed's dates carry no zone of their own.
 *
 * Returns null for anything that is not eight digits naming a real date —
 * `Date` would otherwise happily roll `20260231` forward into March.
 */
export function parseFeedDate(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (match === null) return null;

  const [, year, month, day] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    23,
    59,
    59,
    999,
  );
  const rolledOver =
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day);

  return rolledOver ? null : parsed;
}

/** Whether the bundled data is still within the period the feed published it for. */
export function feedValidity(feedEndDate: string | null, now: Date): FeedValidity {
  if (feedEndDate === null) return { state: 'unknown' };
  const endsOn = parseFeedDate(feedEndDate);
  if (endsOn === null) return { state: 'unknown' };
  return now.getTime() > endsOn.getTime()
    ? { state: 'expired', endsOn }
    : { state: 'current', endsOn };
}

/**
 * A date a rider can read: "22 August 2026". Spelled out rather than numeric
 * so it cannot be misread day-first or month-first, and built by hand rather
 * than through `toLocaleDateString` so it renders identically on a device with
 * a trimmed-down ICU build.
 */
export function formatFeedDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
