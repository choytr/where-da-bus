import { StyleSheet } from 'react-native';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { StopCard } from '../StopCard';
import { NOTICES } from '../../arrivals/board';
import { TestTheme } from '../../../lib/testing/theme';
import type { Stop } from '../../../data/gtfs/types';
import type { Arrival, ArrivalsResult, TheBusClient } from '../../../data/thebus';

/**
 * The card is the full arrival board inside the sheet, so what is under test is
 * that it says the same things the standalone screen says — most of all that
 * "no buses are due" and "could not reach the service" are never the same
 * view — plus the one thing only this host has: a way back to the list.
 *
 * The sheet's scrollables are doubled by the package's own mock, which maps
 * `BottomSheetSectionList` onto React Native's. `__esModule: true` is not
 * optional; see MapScreen.test.tsx for what its absence looks like.
 */
jest.mock('@gorhom/bottom-sheet', () => ({
  __esModule: true,
  ...require('@gorhom/bottom-sheet/mock'),
}));

const STOP: Stop = {
  stop_id: '5',
  stop_code: '596',
  stop_name: 'KING ST + BISHOP ST',
  lat: 21.31,
  lon: -157.86,
};

const arrival = (over: Partial<Arrival> = {}): Arrival => ({
  id: 'a1',
  tripId: 't1',
  route: '2',
  headsign: 'WAIKIKI',
  direction: 'Westbound',
  arrivesAt: new Date('2026-08-02T08:45:00.000Z'),
  estimate: 'live',
  vehicle: '871',
  position: { lat: 21.3, lon: -157.85 },
  canceled: false,
  ...over,
});

const boardOf = (...arrivals: Arrival[]): ArrivalsResult => ({
  ok: true,
  board: {
    stopCode: '596',
    serverTime: new Date('2026-08-02T08:40:00.000Z'),
    arrivals,
  },
});

/** Each success carries a moving `serverTime`, as real responses do. */
const clientOf = (...results: ArrivalsResult[]): TheBusClient => {
  let call = 0;
  return {
    arrivals: async () => {
      const result = results[Math.min(call++, results.length - 1)];
      return result.ok ? { ...result, board: { ...result.board, serverTime: new Date() } } : result;
    },
  };
};

const show = (client: TheBusClient, over: Partial<Parameters<typeof StopCard>[0]> = {}) =>
  render(
    <TestTheme>
      <StopCard
        stop={STOP}
        meters={180}
        routes={[]}
        isFavorite={false}
        onBack={jest.fn()}
        onToggleFavorite={jest.fn()}
        onPressRoute={jest.fn()}
        client={client}
        {...over}
      />
    </TestTheme>,
  );

describe('StopCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-02T08:40:00.000Z'));
  });

  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it('shows the stop name and code', async () => {
    await show(clientOf(boardOf(arrival())));

    screen.getByText('KING ST + BISHOP ST');
    screen.getByText('Stop 596');
    // The legend the terms require is no longer this card's to render — it is
    // pinned once by `StopSheet`, under whichever mode is showing, and asserted
    // there. See `lib/Attribution.tsx`.
    expect(screen.queryByText(/provided by permission of/)).toBeNull();
  });

  /**
   * Reported on a device 2026-08-09: the board announced itself as scrollable
   * and then would not move an inch.
   *
   * A scroll view that is a flex child of a sized column and carries no
   * `flex: 1` sizes itself to its content rather than to the room it has, so
   * its frame ends up equal to its content and there is nothing left to
   * scroll. `StopSheet`'s nearby list had exactly this on 2026-08-08 and was
   * the only list fixed.
   *
   * Jest cannot scroll anything — that is a layout pass this renderer never
   * makes — so what is guarded here is the property whose absence caused it.
   * **This is a proxy for the bug, not a reproduction of it.**
   */
  it('gives the board room to scroll in', async () => {
    await show(clientOf(boardOf(arrival())));

    expect(
      StyleSheet.flatten(screen.getByTestId('stop-card-arrivals').props.style).flex,
    ).toBe(1);
  });

  it('renders arrivals grouped by direction', async () => {
    await show(
      clientOf(
        boardOf(
          arrival({ id: 'a1', direction: 'Westbound' }),
          arrival({
            id: 'a2',
            direction: 'Eastbound',
            arrivesAt: new Date('2026-08-02T08:50:00.000Z'),
          }),
        ),
      ),
    );

    screen.getByText('Buses traveling westbound');
    screen.getByText('Buses traveling eastbound');
    screen.getByText('5 min');
    screen.getByText('10 min');
  });

  it('distinguishes no buses from unreachable', async () => {
    await show(clientOf(boardOf()));

    screen.getByText(NOTICES.empty);
    expect(screen.queryByText(NOTICES.unreachable)).toBeNull();

    await cleanup();

    await show(clientOf({ ok: false, failure: { kind: 'unreachable' } }));

    screen.getByText(NOTICES.unreachable);
    expect(screen.queryByText(NOTICES.empty)).toBeNull();
    // Nothing was ever received, so nothing may claim to be showing old times.
    expect(screen.queryByText(new RegExp(NOTICES.stale))).toBeNull();
  });

  it('calls onBack from the back control', async () => {
    const onBack = jest.fn();
    await show(clientOf(boardOf(arrival())), { onBack });

    await fireEvent.press(screen.getByLabelText('Back to nearby stops'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps stale times visible when a refresh fails', async () => {
    await show(clientOf(boardOf(arrival()), { ok: false, failure: { kind: 'unreachable' } }));

    screen.getByText('5 min');

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    // The failed poll took nothing away; it only said so.
    screen.getByText('WAIKIKI');
    screen.getByText('4 min');
    screen.getByText(new RegExp(NOTICES.stale));
  });
});
