import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { BusMarker } from '../BusMarker';
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

/**
 * Both handlers are stable across renders, which is what the props' contract
 * asks for and what keeps `memo` doing its job.
 */
const noop = () => {};

/** The default shape: drawn, not tapped, covering nothing. */
const plain = {
  highlighted: false,
  selected: false,
  nextStop: null,
  onPress: noop,
  onPressNextStop: noop,
} as const;

describe('BusMarker', () => {
  it('draws the fleet number, which is what a rider is shown', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} {...plain} placement="below" />
      </TestTheme>,
    );

    expect(screen.getByTestId('bus-label-252')).toHaveTextContent('252');
  });

  /**
   * The label and the popup are both always mounted and hidden with opacity.
   * What must not happen is a *conditional* mount — see this component's header
   * and the map section of docs/backlog.md.
   */
  it('mounts its label unconditionally', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(0)} {...plain} placement="below" />
      </TestTheme>,
    );

    expect(screen.getByTestId('bus-label-252')).toHaveTextContent('252');
  });

  it('identifies itself by fleet number, so keys stay stable across polls', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000, '197')} {...plain} placement="below" />
      </TestTheme>,
    );

    expect(screen.getByTestId('bus-197')).toBeTruthy();
  });

  /** An employee number must not reach a screen, a log, or a snapshot. */
  it('never renders anything but the number and the age', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} {...plain} placement="below" />
      </TestTheme>,
    );

    expect(screen.queryByText(/WAIKIKI/)).toBeNull();
    expect(screen.queryByText(/t-1/)).toBeNull();
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
      <BusMarker bus={busOnMap(0, '252', adherence)} {...plain} placement="below" />
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
        <BusMarker bus={busOnMap(0)} {...plain} placement={null} />
      </TestTheme>,
    );

    const label = screen.getByTestId('bus-label-252');
    expect(StyleSheet.flatten(label.props.style).opacity).toBe(0);
  });

  it('shows it once the labeller has placed it', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(0)} {...plain} placement="above" />
      </TestTheme>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('bus-label-252').props.style).opacity).toBe(1);
  });
});

/**
 * The popup, which is the whole of "tapping a bus" — no card, no sheet mode, no
 * camera follow, all three offered and set aside. It is the accepted fix for
 * lateness being communicated by ring colour alone.
 */
describe('BusMarker’s popup', () => {
  const nextStop = {
    stop_id: 'r1',
    stop_code: '901',
    stop_name: 'KALIHI TRANSIT CENTER',
    lat: 21.31,
    lon: -157.85,
  };

  it('shows only the fleet number when unselected', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} {...plain} placement="below" />
      </TestTheme>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('bus-label-252').props.style).opacity).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('bus-popup-252').props.style).opacity).toBe(0);
  });

  it('adds lateness and age when selected', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000, '252', -12)} {...plain} selected placement="below" />
      </TestTheme>,
    );

    const popup = screen.getByTestId('bus-popup-252');
    expect(StyleSheet.flatten(popup.props.style).opacity).toBe(1);
    expect(within(popup).getByText('252')).toBeTruthy();
    expect(within(popup).getByText('12 min behind')).toBeTruthy();
    expect(within(popup).getByText('here 15 s ago')).toBeTruthy();
  });

  /** The number is the popup's own first line; two copies of it is one too many. */
  it('hides the collapsed label behind the popup', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} {...plain} selected placement="below" />
      </TestTheme>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('bus-label-252').props.style).opacity).toBe(0);
  });

  it('says early rather than late for a positive adherence', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000, '252', 4)} {...plain} selected placement="below" />
      </TestTheme>,
    );

    expect(within(screen.getByTestId('bus-popup-252')).getByText('4 min ahead')).toBeTruthy();
  });

  /**
   * Mounted at all times and hidden, exactly like the label. This one would
   * otherwise mount and unmount on every tap — the most frequent churn this
   * component could possibly have had across the seam behind the SIGABRT.
   */
  it('keeps the popup mounted while the bus is not selected', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} {...plain} placement={null} />
      </TestTheme>,
    );

    expect(screen.getByTestId('bus-popup-252')).toBeTruthy();
  });

  it('names the stop the bus is heading for', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} {...plain} selected nextStop={nextStop} placement="below" />
      </TestTheme>,
    );

    expect(
      within(screen.getByTestId('bus-popup-252')).getByText('Next: KALIHI TRANSIT CENTER'),
    ).toBeTruthy();
  });

  it('names no stop at the end of the run, where there is no next one', async () => {
    await render(
      <TestTheme>
        <BusMarker bus={busOnMap(20_000)} {...plain} selected placement="below" />
      </TestTheme>,
    );

    expect(within(screen.getByTestId('bus-popup-252')).queryByText(/KALIHI/)).toBeNull();
  });

  /**
   * The second tap: "where is this bus going next" and "when does it get there"
   * are one press apart.
   */
  it('hands a press to the next stop once the popup is open', async () => {
    const onPress = jest.fn();
    const onPressStopUnder = jest.fn();
    await render(
      <TestTheme>
        <BusMarker
          bus={busOnMap(20_000)}
          highlighted={false}
          selected
          nextStop={nextStop}
          placement="below"
          onPress={onPress}
          onPressNextStop={onPressStopUnder}
        />
      </TestTheme>,
    );

    await fireEvent.press(screen.getByTestId('bus-252'), { stopPropagation: () => {} });

    expect(onPressStopUnder).toHaveBeenCalledWith(nextStop);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('takes the press itself when it has no next stop to offer', async () => {
    const onPress = jest.fn();
    const onPressStopUnder = jest.fn();
    await render(
      <TestTheme>
        <BusMarker
          bus={busOnMap(20_000)}
          highlighted={false}
          selected
          nextStop={null}
          placement="below"
          onPress={onPress}
          onPressNextStop={onPressStopUnder}
        />
      </TestTheme>,
    );

    await fireEvent.press(screen.getByTestId('bus-252'), { stopPropagation: () => {} });

    expect(onPress).toHaveBeenCalled();
    expect(onPressStopUnder).not.toHaveBeenCalled();
  });

  /** The first tap is always the bus's own, next stop or not. */
  it('takes the first press even when a next stop is known', async () => {
    const onPress = jest.fn();
    const onPressStopUnder = jest.fn();
    await render(
      <TestTheme>
        <BusMarker
          bus={busOnMap(20_000)}
          highlighted={false}
          selected={false}
          nextStop={nextStop}
          placement="below"
          onPress={onPress}
          onPressNextStop={onPressStopUnder}
        />
      </TestTheme>,
    );

    await fireEvent.press(screen.getByTestId('bus-252'), { stopPropagation: () => {} });

    expect(onPress).toHaveBeenCalled();
    expect(onPressStopUnder).not.toHaveBeenCalled();
  });
});
