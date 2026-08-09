import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import {
  StopSheet,
  detentsFor,
  tabBarOverlapOf,
  visibleAbove,
  PEEK_DETENT,
  MEDIUM_DETENT,
  FULL_DETENT,
} from '../StopSheet';
import { PEEK_BAND, PEEK_ROW } from '../peek';
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

/**
 * Truman's device: an 896 pt window, an 83 pt tab bar, a 48 pt top inset. The
 * scene turned out to be inset above the bar, so the sheet's container is
 * 813 pt and the bar covers none of it — which is the whole point of measuring.
 */
const WINDOW_HEIGHT = 896;
const TAB_BAR = 83;
const TOP_INSET = 48;
const INSET_SCENE = WINDOW_HEIGHT - TAB_BAR;
const OVERLAP = tabBarOverlapOf(INSET_SCENE, WINDOW_HEIGHT, TAB_BAR);
const DETENTS = detentsFor(INSET_SCENE, OVERLAP, TOP_INSET);

const show = (
  selectedStop: StopWithDistance | null,
  onBack = jest.fn(),
  overlap = OVERLAP,
) =>
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
        detents={DETENTS}
        tabBarOverlap={overlap}
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
  it('derives a peek that is the grab handle, one band and one row', () => {
    // Four device rounds settled this. `'14%'` left about a dozen points of
    // content; sizing it to the card's header gave ~211 pt and spent too much
    // map; the handle alone was Truman's "horrendous"; a band alone said what
    // the sheet was without showing anything.
    expect(DETENTS[PEEK_DETENT]).toBe(24 + PEEK_BAND + PEEK_ROW);
    expect(DETENTS[PEEK_DETENT]).toBeLessThan(DETENTS[MEDIUM_DETENT]);
  });

  it('adds the tab bar to the peek only where the bar actually covers the sheet', () => {
    // The bug this measurement exists to close. Assuming the bar overlaid a
    // scene that was in fact inset above it added 83 pt to the peek, so a sheet
    // meant to show one band showed a screenful of stops.
    const overlaid = detentsFor(
      WINDOW_HEIGHT,
      tabBarOverlapOf(WINDOW_HEIGHT, WINDOW_HEIGHT, TAB_BAR),
      TOP_INSET,
    );

    expect(OVERLAP).toBe(0);
    expect(overlaid[PEEK_DETENT]).toBe(24 + PEEK_BAND + PEEK_ROW + TAB_BAR);
    // Either way, the same band is what shows above the bar.
    expect(overlaid[PEEK_DETENT] - TAB_BAR).toBe(DETENTS[PEEK_DETENT]);
  });

  it('keeps the tallest detent clear of the notch', () => {
    // Truman, 2026-08-09: the top edge went under the status bar. It was 90% of
    // the *window* inside a container 83 pt shorter, which landed 7 pt from the
    // top. Capped against the safe area, the fraction can no longer do that.
    const top = INSET_SCENE - DETENTS[FULL_DETENT];

    expect(top).toBeGreaterThanOrEqual(TOP_INSET);
    expect(DETENTS[FULL_DETENT]).toBeGreaterThan(DETENTS[MEDIUM_DETENT]);
  });

  it('caps the tallest detent on a deep notch rather than letting the fraction win', () => {
    // A short container under a deep inset is where 90% and "clears the notch"
    // disagree, and the cap has to be the one that wins.
    const cramped = detentsFor(600, 0, 120);

    expect(600 - cramped[FULL_DETENT]).toBeGreaterThanOrEqual(120);
    expect(cramped[FULL_DETENT]).toBeGreaterThan(cramped[MEDIUM_DETENT]);
  });

  it('leaves about half the map showing at the middle detent', () => {
    // The fraction `region.ts` and every camera call are handed. Raised from
    // 0.45 to 0.5 on 2026-08-09 — Truman, on a device: "a bit low" — so what is
    // left above it moved the other way.
    // Two places, not three: the detent is rounded to a whole point, so on an
    // odd-height container the fraction comes back a shade off its own value.
    expect(visibleAbove(DETENTS, MEDIUM_DETENT, INSET_SCENE)).toBeCloseTo(0.5, 2);
  });
});

/** Off the peek, where the sheet is actually showing something. */
const raise = () => fireEvent.press(screen.getByLabelText('settle the sheet at 1'));

describe('StopSheet', () => {
  /**
   * The resting sheet is one band, and both modes have to fill exactly it — or
   * the sheet changes height when a rider selects a stop, which reads as a
   * twitch. Asserted on the two heights rather than by rendering at the peek,
   * because Jest runs no layout.
   */
  it('gives both modes a top band of the same height', async () => {
    await show(null);
    const heading = StyleSheet.flatten(screen.getByTestId('nearby-band').props.style);

    await show(STOPS[0]);
    const card = StyleSheet.flatten(screen.getByTestId('stop-card-band').props.style);

    expect(heading.height).toBe(PEEK_BAND);
    expect(card.height).toBe(PEEK_BAND);
  });

  it('titles the card from BoardHeader, not from its band', async () => {
    // The name lived in the band for one round, while the peek was the band and
    // nothing else. The peek now shows a row below it, so the name is back at
    // its own size in `BoardHeader` — which keeps this host identical to
    // `/stop/[code]`, and keeps it off the band's cramped single line.
    await show(STOPS[0]);

    const band = within(screen.getByTestId('stop-card-band'));
    expect(band.queryByText('LAGOON DR')).toBeNull();
    band.getByLabelText('Back to nearby stops');
    screen.getByText('LAGOON DR');
  });

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
  /**
   * Only as much clearance as the tab bar actually takes. Padding by the bar's
   * full height on a scene already inset above it is how the sheet ended up
   * with 83 pt of dead space under its content.
   */
  it('pins the legend clear of whatever the tab bar covers', async () => {
    await show(null, jest.fn(), TAB_BAR);
    await raise();

    expect(
      StyleSheet.flatten(screen.getByTestId('sheet-attribution').props.style).paddingBottom,
    ).toBe(TAB_BAR);
  });

  it('reserves nothing when the scene is already inset above the tab bar', async () => {
    await show(null);
    await raise();

    expect(
      StyleSheet.flatten(screen.getByTestId('sheet-attribution').props.style).paddingBottom,
    ).toBe(0);
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
