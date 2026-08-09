import { forwardRef, useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  useBottomSheetSpringConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { StopRow } from '../stops/StopRow';
import { StopCard } from './StopCard';
import { useTheme } from '../../lib/theme';
import { Attribution } from '../../lib/Attribution';
import type { RouteSummary, StopWithDistance } from '../../data/gtfs/types';
import type { TheBusClient } from '../../data/thebus';
import type { AnchoredStatus } from './useAnchoredStops';

/**
 * What sits under the map, in a sheet that can be peeked, half-raised or pulled
 * to full height.
 *
 * **Two modes, not one list in two states.** With nothing selected it is the
 * nearby list — the same stops the pins show, never a second set. Select one
 * and the card *replaces* that list, with a back control returning to it. The
 * first shipped version expanded the selected row in place among its
 * neighbours, on the theory that a row visibly growing invites a second tap;
 * on a device it did not, and the middle level of detail was where riders got
 * lost. Apple Maps and Google Maps both push a card, and riders arrive already
 * knowing it.
 *
 * There is no search field in here, deliberately. A text field inside a sheet
 * over a map fights the sheet's own gestures through the keyboard, so search is
 * its own tab — see the increment spec.
 */

/** Peek, medium, full. Medium is where a selected stop's arrivals fit. */
export const PEEK_DETENT = 0;
export const MEDIUM_DETENT = 1;
export const FULL_DETENT = 2;

/**
 * The sheet's own grab handle: `@gorhom/bottom-sheet`'s default handle is 10 pt
 * of padding either side of a 4 pt indicator. Read off its stylesheet rather
 * than guessed.
 */
const HANDLE_HEIGHT = 24;

/**
 * The three detents, in **points**.
 *
 * They were percentage strings until Increment 7, and the peek was `'14%'` —
 * ~119 pt on Truman's device, of which the tab bar took ~83 and the handle 24,
 * leaving on the order of 16 pt for content. That one number is behind three
 * separately-reported complaints, and a percentage cannot fix it: the thing the
 * peek has to clear is a bar whose height is measured in points and differs per
 * device.
 *
 * **The peek shows the handle and nothing else.** It was briefly sized to fit
 * `StopCard`'s header — ~211 pt, one full row plus a sliver — and on a device
 * Truman's verdict was that it took too much map for what it bought. A peek
 * that shows *part* of something has to be right about which part, and there
 * was no version of that anyone was happy with; a peek that shows nothing is
 * honest about being a grab handle, and the map gets the height back. What
 * belongs in a resting sheet is a question for a later increment, with a device
 * in hand.
 *
 * So the peek is arithmetic and the other two are not — medium and full are
 * genuinely "about half" and "nearly all" of the screen, which is what a
 * fraction says well.
 */
export function detentsFor(
  windowHeight: number,
  tabBarHeight: number,
): readonly [number, number, number] {
  return [
    tabBarHeight + HANDLE_HEIGHT,
    Math.round(windowHeight * 0.45),
    Math.round(windowHeight * 0.9),
  ];
}

/**
 * How much of the screen's height is *not* under the sheet at a given detent.
 *
 * Read off the detents themselves rather than written out a second time: the
 * camera framing and the sheet's height must not be able to disagree about how
 * much of the map a rider can see.
 */
export function visibleAbove(
  detents: readonly number[],
  index: number,
  windowHeight: number,
): number {
  const height = detents[index] ?? detents[PEEK_DETENT] ?? 0;
  return 1 - height / windowHeight;
}

const EMPTY_HERE = 'No stops within walking distance of here.';
const FAILED = 'Could not read the stop list on this device.';
const LOADING = 'Looking for stops…';

export type StopSheetProps = {
  stops: StopWithDistance[];
  status: AnchoredStatus;
  routesByStop: Map<string, RouteSummary[]>;
  favoriteIds: string[];
  /** The whole stop, not an id: the card needs its name and distance too. */
  selectedStop: StopWithDistance | null;
  onSelect: (stop: StopWithDistance) => void;
  onBack: () => void;
  onToggleFavorite: (stopId: string) => void;
  onOpenRoute: (route: RouteSummary) => void;
  /**
   * Forwarded to the card, which is the only thing here that asks the network.
   * The sheet passes it through rather than reading `useTheBus()` itself so a
   * test can drive the card with a stub client instead of a real one built
   * from a real key.
   */
  client: TheBusClient;
  /**
   * The detent the sheet has *settled* on, reported as it settles. The screen
   * needs it for two things it cannot ask the sheet about: whether raising to
   * medium would actually be a raise, and whether the map underneath is still
   * visible enough to be worth touching.
   */
  onDetentChange: (index: number) => void;
  /**
   * The three snap heights, in points, from `detentsFor`. Passed in rather
   * than computed here because the peek's height depends on the tab bar, and
   * `useBottomTabBarHeight()` throws outside a navigator — which the sheet's
   * own tests are.
   */
  detents: readonly number[];
  /**
   * How much of the sheet's bottom the tab bar covers.
   *
   * The bar does not clip the sheet — it is **drawn over** it, and the content
   * underneath goes on rendering with nothing reserving space. That is why the
   * stop code's descenders appeared to touch the bar, and it is true at every
   * detent rather than only at the peek.
   */
  tabBarHeight: number;
};

export const StopSheet = forwardRef<BottomSheet, StopSheetProps>(function StopSheet(
  {
    stops,
    status,
    routesByStop,
    favoriteIds,
    selectedStop,
    onSelect,
    onBack,
    onToggleFavorite,
    onOpenRoute,
    onDetentChange,
    client,
    detents,
    tabBarHeight,
  },
  ref,
) {
  const { palette } = useTheme();
  // Copied because `snapPoints` is declared mutable, and the detents are shared
  // with the camera framing — which must not be able to write to them.
  const snapPoints = useMemo(() => [...detents], [detents]);

  /**
   * The tab bar is cleared by the pinned legend below the list, not by the list
   * itself, so this is only breathing room under the last row.
   */
  const listContent = useMemo(() => ({ paddingBottom: CONTENT_INSET }), []);

  /**
   * Lifts the pinned legend off the tab bar, which is drawn *over* the sheet
   * rather than clipping it.
   */
  const footer = useMemo(() => ({ paddingBottom: tabBarHeight }), [tabBarHeight]);

  /**
   * The detent the sheet has settled on, tracked here as well as reported, so
   * the legend below can be left off at the peek.
   *
   * At the peek the content area is exactly the tab bar's height — there is no
   * room for a legend, and a fixed-height block in a flex column does not
   * shrink: it takes its space and the list collapses to nothing. That is the
   * broken list. It is also the older bug in disguise, the one
   * `lib/Attribution.tsx` records: a resting sheet whose entire visible content
   * is legal text.
   *
   * A sheet showing only its handle presents no Data and so owes no legend, so
   * the honest fix is not to render one there.
   */
  const [settled, setSettled] = useState(PEEK_DETENT);
  const handleDetentChange = useCallback(
    (index: number) => {
      setSettled(index);
      onDetentChange(index);
    },
    [onDetentChange],
  );

  const animationConfigs = useBottomSheetSpringConfigs({
    damping: 90,
    stiffness: 650,
    mass: 0.70,
    overshootClamping: true,
  });

  /**
   * Dims the map only at full height, where it is a sliver nobody is reading,
   * and a press on it drops back to medium rather than closing — the sheet has
   * no closed state to drop to. Below full height the map stays undimmed and
   * live, which is the whole reason for a sheet rather than a screen.
   */
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={FULL_DETENT}
        disappearsOnIndex={MEDIUM_DETENT}
        pressBehavior={MEDIUM_DETENT}
      />
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: StopWithDistance }) => (
      <StopRow
        stop={item}
        routes={routesByStop.get(item.stop_id) ?? []}
        meters={item.meters}
        isFavorite={favoriteIds.includes(item.stop_id)}
        onToggleFavorite={onToggleFavorite}
        // Not `onPress={onSelect}`: the row knows its stop only as a `Stop`,
        // and the card needs the distance that came with it.
        onPress={() => onSelect(item)}
        onPressRoute={onOpenRoute}
      />
    ),
    [routesByStop, favoriteIds, onSelect, onToggleFavorite, onOpenRoute],
  );

  return (
    <BottomSheet
      ref={ref}
      index={0}
      enableDynamicSizing={false}
      snapPoints={snapPoints}
      enablePanDownToClose={false}
      backgroundStyle={{ backgroundColor: palette.background }}
      handleIndicatorStyle={{ backgroundColor: palette.muted }}
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      onChange={handleDetentChange}
    >
    {/*
      A column, so the legend can be pinned under whichever mode is showing
      rather than living at the foot of each one's scroll. Both modes are
      `flex: 1` above it.
    */}
    <View style={styles.fill}>
      {selectedStop === null ? (
        <BottomSheetFlatList
          testID="nearby-stops"
          // Explicit, because it is now a sibling of the legend rather than the
          // sheet's only child: without it the list sizes to its content and
          // pushes the legend out of the sheet entirely.
          style={styles.fill}
          data={stops}
          keyExtractor={(stop) => stop.stop_id}
          renderItem={renderItem}
          contentContainerStyle={listContent}
          ListEmptyComponent={
            // Three states kept apart, as §4 requires: still looking, looked and
            // found nothing here, and could not look at all.
            <View style={styles.empty}>
              {status === 'loading' ? (
                <Text style={[styles.emptyText, { color: palette.muted }]}>{LOADING}</Text>
              ) : null}
              {status === 'empty' ? (
                <Text style={[styles.emptyText, { color: palette.muted }]}>{EMPTY_HERE}</Text>
              ) : null}
              {status === 'failed' ? (
                <Text style={[styles.emptyText, { color: palette.warning }]}>{FAILED}</Text>
              ) : null}
            </View>
          }
        />
      ) : (
        /*
          Mounted only while a stop is selected, which is what keeps exactly one
          arrivals poll running: unmounting tears down useArrivals' fetch and its
          60-second timer with it, so changing selection cannot leave the
          previous stop polling in the background.
        */
        <StopCard
          stop={selectedStop}
          meters={selectedStop.meters}
          routes={routesByStop.get(selectedStop.stop_id) ?? []}
          isFavorite={favoriteIds.includes(selectedStop.stop_id)}
          onBack={onBack}
          onToggleFavorite={onToggleFavorite}
          onPressRoute={onOpenRoute}
          client={client}
        />
      )}

      {/*
        Pinned under the content, not at the foot of its scroll — the same
        placement the stop list, the arrival board and route detail already
        use, so the legend is on screen from the first frame at every detent
        that shows any Data. `lib/Attribution.tsx` carries the reading of the
        terms behind that, and why the sheet stopped being the exception.

        Not at the peek: see `settled` above.
      */}
      {settled === PEEK_DETENT ? null : (
        <View testID="sheet-attribution" style={[styles.legend, footer]}>
          <Attribution />
        </View>
      )}
    </View>
    </BottomSheet>
  );
});

/** Breathing room under the last row. The tab bar is the legend's to clear. */
const CONTENT_INSET = 32;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /** Never squeezed by the list above it, and never squeezing it either. */
  legend: { flexShrink: 0 },
  empty: { paddingHorizontal: 16, paddingTop: 8 },
  emptyText: { fontSize: 14, lineHeight: 20 },
});
