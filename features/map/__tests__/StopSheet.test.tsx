import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  StopSheet,
  detentsFor,
  visibleAbove,
  PEEK_DETENT,
  MEDIUM_DETENT,
  FULL_DETENT,
} from '../StopSheet';
import { TestTheme } from '../../../lib/testing/theme';
import { ATTRIBUTION } from '../../../lib/legal';
import type { StopWithDistance } from '../../../data/gtfs/types';
import type { ArrivalsResult, TheBusClient } from '../../../data/thebus';

/**
 * The sheet's two modes. What is under test is only which of them is on screen
 * and how a rider gets between them — the card's own contents are
 * StopCard.test.tsx, and how the sheet slides is not testable off-device.
 */
/**
 * The shipped double renders children and swallows `onChange`, which is not
 * enough any more: the sheet leaves the legend off at the peek — there is no
 * room for it there, and a sheet showing only its handle presents no Data to
 * attribute — so a test about the legend has to be able to settle the sheet
 * somewhere else. This adds that one control and keeps the rest.
 */
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');

  const MockBottomSheet = React.forwardRef(({ children, onChange }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ snapToIndex: () => {} }));
    return (
      <View>
        {[0, 1, 2].map((index: number) => (
          <Pressable
            key={index}
            accessibilityLabel={`settle the sheet at ${index}`}
            onPress={() => onChange?.(index)}
          />
        ))}
        {children}
      </View>
    );
  });

  return {
    __esModule: true,
    ...require('@gorhom/bottom-sheet/mock'),
    default: MockBottomSheet,
  };
});

const mockArrivalsResult: ArrivalsResult = {
  ok: true,
  board: { stopCode: '5', serverTime: new Date('2026-08-02T22:00:00Z'), arrivals: [] },
};

/**
 * The card inside the sheet is the only thing here that asks the network, and
 * it is handed this rather than reaching for a shared instance. Before
 * Increment 4 this file mocked the whole data/thebus barrel to replace a
 * module-level `theBus`; passing a stub is both smaller and honest about the
 * dependency, since there is no longer a client to reach for.
 */
const client: TheBusClient = { arrivals: jest.fn(async () => mockArrivalsResult) };

const stop = (id: string, name: string, meters: number): StopWithDistance => ({
  stop_id: id,
  stop_code: id,
  stop_name: name,
  lat: 21.3,
  lon: -157.85,
  meters,
});

const STOPS = [stop('5', 'LAGOON DR', 120), stop('6', 'KAPALULU PL', 340)];

/** Truman's device: 852 pt of window under an 83 pt tab bar. */
const WINDOW_HEIGHT = 852;
const TAB_BAR = 83;

const show = (selectedStop: StopWithDistance | null, onBack = jest.fn()) =>
  render(
    <TestTheme>
      <StopSheet
        stops={STOPS}
        status="ready"
        routesByStop={new Map()}
        favoriteIds={[]}
        selectedStop={selectedStop}
        onSelect={jest.fn()}
        onBack={onBack}
        onToggleFavorite={jest.fn()}
        onOpenRoute={jest.fn()}
        onDetentChange={jest.fn()}
        client={client}
        detents={detentsFor(WINDOW_HEIGHT, TAB_BAR)}
        tabBarHeight={TAB_BAR}
      />
    </TestTheme>,
  );

/**
 * The detents are points now, not percentage strings, and the peek is the only
 * one that is arithmetic. What these pin down is the reason for the change: the
 * thing the peek has to clear is a tab bar measured in points, and a percentage
 * cannot be told about it.
 */
describe('the detents', () => {
  it('derives a peek that is the grab handle and nothing else', () => {
    const detents = detentsFor(WINDOW_HEIGHT, TAB_BAR);

    // The old `'14%'` was 119 pt here, of which the tab bar took 83 and the
    // grab handle 24 — about a dozen points of content, which is what three
    // separately-reported complaints were all about. It was then briefly sized
    // to fit the card's header, ~211 pt, and on a device that took too much map
    // for what it bought. A peek showing *part* of something has to be right
    // about which part; a peek showing nothing is honest about being a handle.
    expect(detents[PEEK_DETENT]).toBe(TAB_BAR + 24);
    // Still a peek: well under the detent above it, and clear of the bar.
    expect(detents[PEEK_DETENT]).toBeLessThan(detents[MEDIUM_DETENT]);
    expect(detents[PEEK_DETENT]).toBeGreaterThan(TAB_BAR);
  });

  it('derives the same fraction from points that the percentages used to give', () => {
    const detents = detentsFor(WINDOW_HEIGHT, TAB_BAR);

    // Medium and full are genuinely "about half" and "nearly all" of the
    // screen, so those two are unchanged by the move to points — which is what
    // keeps `region.ts` and every camera call taking the same fraction it did.
    expect(visibleAbove(detents, MEDIUM_DETENT, WINDOW_HEIGHT)).toBeCloseTo(0.55, 3);
    expect(visibleAbove(detents, FULL_DETENT, WINDOW_HEIGHT)).toBeCloseTo(0.1, 3);
  });

  it('a taller tab bar raises the peek by the same amount', () => {
    const short = detentsFor(WINDOW_HEIGHT, 49);
    const tall = detentsFor(WINDOW_HEIGHT, 83);

    expect(tall[PEEK_DETENT] - short[PEEK_DETENT]).toBe(34);
    // And only the peek. The other two are about the screen, not the chrome.
    expect(tall[MEDIUM_DETENT]).toBe(short[MEDIUM_DETENT]);
    expect(tall[FULL_DETENT]).toBe(short[FULL_DETENT]);
  });
});

/** Off the peek, where the sheet is actually showing something. */
const raise = () => fireEvent.press(screen.getByLabelText('settle the sheet at 1'));

describe('StopSheet', () => {
  it('shows the nearby list when nothing is selected', async () => {
    await show(null);

    screen.getByText('LAGOON DR');
    screen.getByText('KAPALULU PL');
    expect(screen.queryByLabelText('Back to nearby stops')).toBeNull();
  });

  it('replaces the list with the card when a stop is selected', async () => {
    await show(STOPS[0]);

    // The card, not a row that grew: the other stops are gone from the sheet.
    screen.getByLabelText('Back to nearby stops');
    screen.getByText('Stop 5');
    expect(screen.queryByText('KAPALULU PL')).toBeNull();
  });

  /**
   * The tab bar is drawn **over** the sheet rather than clipping it, so without
   * something reserving space the sheet's bottom edge renders underneath it —
   * which is what "the stop code's spacing to the bottom bar is really tight
   * and awkward" was. The legend is what sits at that edge, so the clearance is
   * its to carry, and everything above it is clear by construction.
   *
   * Asserted on the style because the failure is a layout one, and Jest runs no
   * layout: there is nothing behavioural to observe off-device.
   */
  it('pins the legend clear of the tab bar', async () => {
    await show(null);
    await raise();

    const padding = StyleSheet.flatten(screen.getByTestId('sheet-attribution').props.style)
      .paddingBottom;
    expect(padding).toBeGreaterThanOrEqual(TAB_BAR);
  });

  /**
   * The peek is the tab bar plus the grab handle, so its content area is
   * exactly the tab bar's height — no room for a legend, and a fixed block in a
   * flex column does not shrink: it would take that space and collapse the list
   * to nothing. It is also `lib/Attribution.tsx`'s older bug in disguise, the
   * resting sheet whose entire visible content is legal text.
   *
   * A sheet showing only its handle presents no Data, and the obligation
   * attaches to presenting the Data.
   */
  it('leaves the legend off the resting sheet, which presents no data', async () => {
    await show(null);

    expect(screen.queryByTestId('sheet-attribution')).toBeNull();
    expect(screen.queryByText(ATTRIBUTION)).toBeNull();

    await raise();

    screen.getByText(ATTRIBUTION);
  });

  /**
   * The sheet was the one surface where the legend scrolled away with the
   * content. Every other one pins it as a sibling of its scroll view, and as of
   * Increment 7 so does this — see `lib/Attribution.tsx` for why the objection
   * that kept it a scroll footer stopped applying.
   */
  it('pins the legend under the nearby list rather than at the foot of it', async () => {
    await show(null);
    await raise();

    screen.getByText(ATTRIBUTION);
    expect(screen.getByTestId('nearby-stops').props.ListFooterComponent).toBeUndefined();
  });

  it('pins the same legend under the card', async () => {
    await show(STOPS[0]);
    await raise();

    screen.getByText(ATTRIBUTION);
    expect(screen.getByTestId('stop-card-arrivals').props.ListFooterComponent).toBeUndefined();
  });

  it('returns to the list from the card', async () => {
    const onBack = jest.fn();
    await show(STOPS[0], onBack);

    await fireEvent.press(screen.getByLabelText('Back to nearby stops'));

    await waitFor(() => {
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});
