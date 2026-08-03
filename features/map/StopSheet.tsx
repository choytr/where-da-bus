import { forwardRef, useCallback, useMemo } from 'react';
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
import { ATTRIBUTION } from '../../lib/legal';
import type { RouteSummary, StopWithDistance } from '../../data/gtfs/types';
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
export const DETENTS = ['14%', '45%', '90%'] as const;
export const PEEK_DETENT = 0;
export const MEDIUM_DETENT = 1;
export const FULL_DETENT = 2;

/**
 * How much of the screen's height is *not* under the sheet at a given detent.
 *
 * Read off the detents themselves rather than written out a second time: the
 * camera framing and the sheet's height must not be able to disagree about how
 * much of the map a rider can see.
 */
export function visibleAbove(detent: number): number {
  const height = DETENTS[detent] ?? DETENTS[PEEK_DETENT];
  return 1 - Number.parseFloat(height) / 100;
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
   * The detent the sheet has *settled* on, reported as it settles. The screen
   * needs it for two things it cannot ask the sheet about: whether raising to
   * medium would actually be a raise, and whether the map underneath is still
   * visible enough to be worth touching.
   */
  onDetentChange: (index: number) => void;
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
  },
  ref,
) {
  const { palette } = useTheme();
  const detents = useMemo(() => [...DETENTS], []);

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
      snapPoints={detents}
      enablePanDownToClose={false}
      backgroundStyle={{ backgroundColor: palette.background }}
      handleIndicatorStyle={{ backgroundColor: palette.muted }}
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      onChange={onDetentChange}
    >
      {selectedStop === null ? (
        <BottomSheetFlatList
          data={stops}
          keyExtractor={(stop) => stop.stop_id}
          renderItem={renderItem}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.header}>
              {/*
                At the top, as the terms require wherever this data appears. The
                map's tiles are Apple's, but every pin and every row below is the
                provider's, so this is the first thing in the sheet.
              */}
              <Text style={[styles.legal, { color: palette.muted }]}>{ATTRIBUTION}</Text>
            </View>
          }
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
        />
      )}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  legal: { fontSize: 11, lineHeight: 15 },
  empty: { paddingHorizontal: 16, paddingTop: 8 },
  emptyText: { fontSize: 14, lineHeight: 20 },
});
