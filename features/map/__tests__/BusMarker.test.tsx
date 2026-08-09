import { render, screen } from '@testing-library/react-native';
import { BusMarker, ageWords, busLabel } from '../BusMarker';
import { TestTheme } from '../../../lib/testing/theme';
import type { BusOnMap } from '../useVehicles';

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    Marker: ({ identifier, accessibilityLabel, children }: any) => (
      <View accessibilityLabel={accessibilityLabel} testID={identifier}>
        {children}
      </View>
    ),
  };
});

const busOnMap = (ageMs: number, number = '252'): BusOnMap => ({
  ageMs,
  vehicle: {
    number,
    tripId: 't-1',
    route: '1',
    position: { lat: 21.31, lon: -157.85 },
    headsign: 'WAIKIKI',
    adherence: 4,
    lastMessage: new Date('2026-08-02T21:42:40Z'),
  },
});

describe('ageWords', () => {
  /**
   * Coarse on purpose: the value is recomputed on a thirty-second tick, and
   * every change re-snapshots the marker's bitmap. Precision it cannot keep
   * current would cost redraws for nothing.
   */
  it('says "here now" for a report that just landed', () => {
    expect(ageWords(3_000)).toBe('here now');
  });

  it('counts seconds in fifteens', () => {
    expect(ageWords(20_000)).toBe('here 15 s ago');
    expect(ageWords(50_000)).toBe('here 45 s ago');
  });

  it('switches to minutes past a minute', () => {
    expect(ageWords(65_000)).toBe('here 1 min ago');
    expect(ageWords(200_000)).toBe('here 3 min ago');
  });
});

describe('busLabel', () => {
  /** Truman asked for this shape by name, after the old DaBus app. */
  it('is the fleet number and how much to trust the dot', () => {
    expect(busLabel(busOnMap(20_000))).toBe('252 · here 15 s ago');
  });
});

describe('BusMarker', () => {
  it('draws the fleet number, which is what a rider is shown', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} highlighted={false} />
      </TestTheme>,
    );

    expect(screen.getByText('252 · here 15 s ago')).toBeTruthy();
  });

  /**
   * The label is always mounted and hidden with opacity elsewhere; here it is
   * always visible, because the age is the reason the bus is drawn at all. What
   * must not happen is a *conditional* mount — see this component's header and
   * the map section of docs/backlog.md.
   */
  it('mounts its label unconditionally', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(0)} highlighted={false} />
      </TestTheme>,
    );

    expect(screen.getByText('252 · here now')).toBeTruthy();
  });

  it('identifies itself by fleet number, so keys stay stable across polls', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000, '197')} highlighted={false} />
      </TestTheme>,
    );

    expect(screen.getByTestId('bus-197')).toBeTruthy();
  });

  /** An employee number must not reach a screen, a log, or a snapshot. */
  it('never renders anything but the number and the age', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} highlighted={false} />
      </TestTheme>,
    );

    expect(screen.queryByText(/WAIKIKI/)).toBeNull();
    expect(screen.queryByText(/4/)).toBeNull();
  });
});
