import { adherenceOf } from './adherence';
import type { BusOnMap } from './useVehicles';

/**
 * What a bus says about itself, in words, for the popup that opens when one is
 * tapped.
 *
 * **Lateness in words is the point of the popup.** Until now it was a ring
 * colour and nothing else, which says *that* a bus is off schedule and never by
 * how much or which way — the open finding in `docs/backlog.md`. Colour also
 * cannot be read by anyone who does not already know the convention, and the
 * convention here is the confusing one.
 *
 * Kept out of `BusMarker` so it is testable as strings rather than through a
 * marker Jest cannot render, and so `MapScreen` can reach the same words for an
 * accessibility label without importing a component.
 */

/**
 * "here 20 s ago" — Truman asked for this by name, after the old DaBus app.
 *
 * Coarse on purpose. The value is recomputed on a thirty-second tick, so a
 * second-by-second reading would be precise about a number it cannot keep
 * current, and every change costs a re-snapshot of the marker.
 */
export function ageWords(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 15) return 'here now';
  if (seconds < 60) return `here ${Math.floor(seconds / 15) * 15} s ago`;
  const minutes = Math.floor(seconds / 60);
  return `here ${minutes} min ago`;
}

/**
 * How far off schedule this bus is running, in words.
 *
 * **Positive minutes mean *early*.** The vendor's convention, backwards to
 * everyone who meets it, and the reason this reads through `adherenceOf` rather
 * than comparing a number to zero here. Nothing bounds the value — thirty live
 * readings on 2026-08-02 spanned −19 to +4 and no ceiling is documented — so
 * every input has to resolve.
 *
 * The two honest absences are named rather than skipped. A bus that did not
 * report its adherence is **not** a bus that is on time, and the popup would be
 * claiming one if it simply left the line out.
 */
export function latenessWords(adherence: number | null): string {
  switch (adherenceOf(adherence)) {
    case 'unknown':
      return 'Not reporting';
    case 'onTime':
      return 'On time';
    case 'early':
      return `${Math.round(adherence ?? 0)} min ahead`;
    case 'late':
      return `${Math.abs(Math.round(adherence ?? 0))} min behind`;
  }
}

/**
 * The collapsed label: the fleet number, alone.
 *
 * **It used to carry the age too**, and that moved into the popup when the
 * popup arrived. Buses are only ever drawn in route mode, so the sheet header
 * already names the route and the direction — there is no headsign here and
 * there should not be.
 *
 * A pleasant second effect: an unselected bus no longer changes what it draws
 * on the thirty-second age tick, so it is not re-snapshotted for a string
 * nobody is reading.
 */
export function busLabel(bus: BusOnMap): string {
  return bus.vehicle.number;
}

/**
 * The three lines of the popup, top to bottom: which bus, how it is running,
 * and how much to trust the dot.
 *
 * **No headsign and no driver.** `vehicle:driver` is an employee number and
 * must never be displayed, logged or persisted.
 */
export function busDetailLines(bus: BusOnMap): readonly string[] {
  return [busLabel(bus), latenessWords(bus.vehicle.adherence), ageWords(bus.ageMs)];
}
