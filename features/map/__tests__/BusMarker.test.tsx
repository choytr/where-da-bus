import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { BusMarker, ageWords, busLabel } from '../BusMarker';
import { adherenceOf } from '../adherence';
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

const busOnMap = (ageMs: number, number = '252', adherence: number | null = 4): BusOnMap => ({
  ageMs,
  vehicle: {
    number,
    tripId: 't-1',
    route: '1',
    position: { lat: 21.31, lon: -157.85 },
    headsign: 'WAIKIKI',
    adherence,
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

/**
 * A bus is not interactive; `onPress` exists only so `MapScreen` can hand the
 * tap to the stop underneath. Nothing in this file is about that, so every
 * render passes the same one — which is also what the prop's contract asks for.
 */
const noop = () => {};

describe('BusMarker', () => {
  it('draws the fleet number, which is what a rider is shown', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} highlighted={false} placement="below" onPress={noop} />
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
        <BusMarker bus={busOnMap(0)} highlighted={false} placement="below" onPress={noop} />
      </TestTheme>,
    );

    expect(screen.getByText('252 · here now')).toBeTruthy();
  });

  it('identifies itself by fleet number, so keys stay stable across polls', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000, '197')} highlighted={false} placement="below" onPress={noop} />
      </TestTheme>,
    );

    expect(screen.getByTestId('bus-197')).toBeTruthy();
  });

  /** An employee number must not reach a screen, a log, or a snapshot. */
  it('never renders anything but the number and the age', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} highlighted={false} placement="below" onPress={noop} />
      </TestTheme>,
    );

    expect(screen.queryByText(/WAIKIKI/)).toBeNull();
    expect(screen.queryByText(/4/)).toBeNull();
  });
});

describe('adherenceOf', () => {
  /**
   * The vendor's sign convention, and the trap this whole function exists to
   * contain. It is recorded in `docs/backlog.md` and reads backwards to
   * everyone who meets it: a bus that is *ahead* of schedule reports a
   * *positive* number.
   */
  it('reads a positive value as early, not late', () => {
    expect(adherenceOf(4)).toBe('early');
  });

  it('reads a negative value as late', () => {
    expect(adherenceOf(-12)).toBe('late');
  });

  /** Most of a fleet sits a couple of minutes behind; a ring on all of it says nothing. */
  it('leaves a bus close to schedule unringed', () => {
    expect(adherenceOf(0)).toBe('onTime');
    expect(adherenceOf(-3)).toBe('onTime');
    expect(adherenceOf(1)).toBe('onTime');
  });

  /** A bus that has not said is not a bus that is on time, even though both draw alike. */
  it('keeps an unreported value distinct from an on-time one', () => {
    expect(adherenceOf(null)).toBe('unknown');
  });

  /**
   * Nothing bounds this. Thirty live values sampled on 2026-08-02 spanned −19 to
   * +4, and there is no documented ceiling — so the ±60 an earlier note assumed
   * is not a range this may rely on.
   */
  it('resolves a value far outside any plausible range', () => {
    expect(adherenceOf(-140)).toBe('late');
    expect(adherenceOf(90)).toBe('early');
  });
});

/**
 * The bus's own wrapper view. It throws rather than returning undefined: every
 * test below is about what that box contains, so one that had gone missing must
 * fail the test rather than flow into an assertion as `undefined`.
 */
function wrapperOf(testID: string) {
  const wrap = screen.getByTestId(testID).children[0];
  if (wrap === undefined || typeof wrap === 'string') {
    throw new Error(`marker ${testID} rendered no wrapper view`);
  }
  return wrap;
}

async function dotStyle(adherence: number | null) {
  const view = await render(
    <TestTheme>
      <BusMarker bus={busOnMap(0, '252', adherence)} highlighted={false} placement="below" onPress={noop} />
    </TestTheme>,
  );
  const style = StyleSheet.flatten(wrapperOf('bus-252').props.children[0].props.style);
  await view.unmount();
  return style;
}

describe('BusMarker’s adherence ring', () => {
  it('rings a late bus and an early one differently', async () => {
    const late = await dotStyle(-12);
    const early = await dotStyle(4);

    expect(late.borderColor).not.toBe(early.borderColor);
  });

  /**
   * Absence means fine. Ringing every bus that is two minutes behind would turn
   * route scale into a wall of traffic lights, which is the opposite of what
   * this pass is for.
   */
  it('leaves an on-time bus and an unreported one with the plain border', async () => {
    const onTime = await dotStyle(0);
    const unknown = await dotStyle(null);
    const late = await dotStyle(-12);

    expect(onTime.borderColor).toBe(unknown.borderColor);
    expect(onTime.borderColor).not.toBe(late.borderColor);
  });
});

describe('BusMarker’s label placement', () => {
  /**
   * Mounted and transparent, never unmounted. Mounting and unmounting a child
   * inside a `react-native-maps` marker is the family the SIGABRT and the
   * markers-teleporting-to-the-corner bug both came from — and at the scale
   * threshold it would fire for every bus on screen at once.
   */
  it('keeps an unplaced label mounted and hides it', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(0)} highlighted={false} placement={null} onPress={noop} />
      </TestTheme>,
    );

    const label = screen.getByText('252 · here now');
    expect(StyleSheet.flatten(label.props.style).opacity).toBe(0);
  });

  it('shows it once the labeller has placed it', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(0)} highlighted={false} placement="above" onPress={noop} />
      </TestTheme>,
    );

    expect(StyleSheet.flatten(screen.getByText('252 · here now').props.style).opacity).toBe(1);
  });
});
