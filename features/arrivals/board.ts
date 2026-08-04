import { useMemo } from 'react';
import type { Arrival, ArrivalBoard, ArrivalsFailure, TheBusClient } from '../../data/thebus';
import { serverClockOffset } from './format';
import { useArrivals } from './useArrivals';
import { useNow } from './useNow';

/**
 * The arrival board, minus the screen it used to be part of.
 *
 * Two places now show one stop's arrivals — the standalone `/stop/[code]`
 * screen and the map sheet's detail card — and they must not drift into
 * disagreeing about what "no buses" or "could not reach the service" means.
 * §4's three states, the direction grouping and the two clocks all live here so
 * that both hosts are reading from the same answer.
 *
 * What is deliberately *not* here is the list. A shared component taking the
 * list type as a prop cannot accept `BottomSheetSectionList` without a type
 * assertion, which this project forbids, so each host renders its own over
 * these `sections` instead. See the plan for that trade.
 */

/**
 * Every message the board can end on. They are worded so that no two read
 * alike: §4 is explicit that "no buses coming" and "couldn't reach the API"
 * must never look the same, because a rider who cannot tell them apart at a
 * stop at night has no reason to trust the app at all.
 */
export const NOTICES = {
  loading: 'Loading arrivals…',
  empty: 'No buses are due at this stop right now.',
  emptyHint: 'Service may have finished for the night, or this stop may not be in use.',
  unreachable: 'Could not reach the bus service.',
  malformed: 'The bus service sent a reply this app could not read.',
  stale: 'Showing the last times received.',
  retry: 'Try again',
  unknownStop: 'That stop is not in the bundled stop data.',
} as const;

/** How often the countdowns and the age re-render. Independent of the 60s poll. */
const TICK_MS = 10_000;

export function describe(failure: ArrivalsFailure): string {
  switch (failure.kind) {
    case 'api':
      // The vendor's own wording. It is terse but accurate, and inventing a
      // friendlier sentence would hide which of several things went wrong.
      return failure.message;
    case 'malformed':
      return NOTICES.malformed;
    case 'unreachable':
      return NOTICES.unreachable;
  }
}

export type Section = { title: string; data: Arrival[] };

/**
 * Grouped by direction, chronological within each group — the shape the
 * discontinued DaBus app used, and the one a rider standing on one side of
 * the street needs. 79% of stops sampled serve a single direction, so this is
 * usually one heading over the whole list rather than a real split.
 */
export function sectionsByDirection(arrivals: readonly Arrival[]): Section[] {
  const order: string[] = [];
  const grouped = new Map<string, Arrival[]>();

  for (const arrival of arrivals) {
    const existing = grouped.get(arrival.direction);
    if (existing === undefined) {
      order.push(arrival.direction);
      grouped.set(arrival.direction, [arrival]);
    } else {
      existing.push(arrival);
    }
  }

  return order.map((direction) => ({
    title: `Buses traveling ${direction.toLowerCase()}`,
    data: grouped.get(direction) ?? [],
  }));
}

export type ArrivalBoardView = {
  /** The board's arrivals, grouped by direction. Empty until the first success. */
  readonly sections: Section[];
  readonly board: ArrivalBoard | null;
  readonly failure: ArrivalsFailure | null;
  readonly fetchedAt: Date | null;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly refresh: () => void;
  /**
   * The clock the **countdowns** are measured against: the device's, shifted
   * onto the server's, so a device running fast does not render every arrival
   * as "Arriving".
   */
  readonly now: Date;
  /**
   * The device's own clock, unshifted. `fetchedAt` is a device timestamp, so
   * this is what the displayed age has to be measured from — shifting it too
   * would count the server's offset twice.
   */
  readonly tick: Date;
};

export function useArrivalBoard(stopCode: string, client: TheBusClient): ArrivalBoardView {
  const { board, failure, fetchedAt, loading, refreshing, refresh } = useArrivals(stopCode, client);
  const tick = useNow(TICK_MS);

  const now = useMemo(() => {
    if (board === null || fetchedAt === null) return tick;
    return new Date(tick.getTime() + serverClockOffset(board.serverTime, fetchedAt));
  }, [board, fetchedAt, tick]);

  const sections = useMemo(
    () => (board === null ? [] : sectionsByDirection(board.arrivals)),
    [board],
  );

  return { sections, board, failure, fetchedAt, loading, refreshing, refresh, now, tick };
}
