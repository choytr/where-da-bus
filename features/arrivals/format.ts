/**
 * Turning instants into the words on the arrival board.
 *
 * All of it is pure and takes `now` as an argument rather than reading the
 * clock, so every case below is testable and the screen re-renders on a tick
 * it controls instead of one hidden inside a formatter.
 */

/** Hawaii Standard Time, year-round — no daylight saving to track. */
const HST_OFFSET_MS = 10 * 60 * 60 * 1000;

/**
 * The wall clock in Honolulu.
 *
 * Deliberately not `Intl.DateTimeFormat` with a `timeZone`. Hermes ships a
 * reduced ICU, so timezone support there is not something to rely on for a
 * value a rider reads off a screen at a bus stop — and the offset is a
 * constant, which makes the arithmetic version both shorter and certain.
 */
export function hawaiiClock(instant: Date): string {
  const local = new Date(instant.getTime() - HST_OFFSET_MS);
  const hours24 = local.getUTCHours();
  const meridiem = hours24 < 12 ? 'AM' : 'PM';
  // 0 and 12 both display as 12.
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hours12}:${minutes} ${meridiem}`;
}

/**
 * How long until a bus arrives, as a rider would say it.
 *
 * Rounds **down**, so four and a half minutes reads as "4 min". Rounding up
 * would tell someone they have five minutes to reach the stop when they have
 * four and a half, and the cost of that error is a missed bus.
 *
 * Anything at or before `now` is "Arriving" rather than a zero or a negative:
 * the API does not return times in the past, but a device clock running fast
 * will manufacture them.
 */
export function countdown(arrivesAt: Date, now: Date): string {
  const minutes = Math.floor((arrivesAt.getTime() - now.getTime()) / 60_000);
  if (minutes < 1) return 'Arriving';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/**
 * How old the data on screen is.
 *
 * §4 requires this to be visible at all times rather than only when something
 * has gone wrong: the vendor's own documentation says information can be up
 * to two minutes late before it ever reaches us, so a displayed "3 min" can
 * legitimately be five minutes old.
 */
export function ageLabel(fetchedAt: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - fetchedAt.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

/**
 * How far the device's clock sits from the server's, in milliseconds.
 *
 * Countdowns have to keep counting between polls, which means measuring
 * against the device clock; but the times being counted down to come from the
 * server's. Adding this offset reconciles the two, so a device four minutes
 * fast does not render every arrival as "Arriving".
 */
export function serverClockOffset(serverTime: Date, fetchedAt: Date): number {
  return serverTime.getTime() - fetchedAt.getTime();
}
