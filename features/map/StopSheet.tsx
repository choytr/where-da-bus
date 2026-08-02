import { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { StopRow } from '../stops/StopRow';
import { ExpandedStopRow } from './ExpandedStopRow';
import { useTheme } from '../../lib/theme';
import { ATTRIBUTION } from '../../lib/legal';
import type { RouteSummary, Stop, StopWithDistance } from '../../data/gtfs/types';
import type { AnchoredStatus } from './useAnchoredStops';

/**
 * The list of stops under the map, in a sheet that can be peeked, half-raised
 * or pulled to full height.
 *
 * The sheet holds **one** list — the same stops the pins show, never a second
 * set. That is what makes the map and the list two views of one answer rather
 * than two answers, and it is why selecting a pin scrolls this list instead of
 * opening a callout of its own.
 *
 * There is no search field in here, deliberately. A text field inside a sheet
 * over a map fights the sheet's own gestures through the keyboard, so search is
 * its own tab — see the increment spec.
 */

/** Peek, medium, full. Medium is where a selected stop's arrivals fit. */
export const DETENTS = ['14%', '45%', '90%'] as const;
export const MEDIUM_DETENT = 1;

const EMPTY_HERE = 'No stops within walking distance of here.';
const FAILED = 'Could not read the stop list on this device.';
const LOADING = 'Looking for stops…';

export type StopSheetProps = {
  stops: StopWithDistance[];
  status: AnchoredStatus;
  routesByStop: Map<string, RouteSummary[]>;
  favoriteIds: string[];
  selectedId: string | null;
  onSelect: (stop: Stop) => void;
  onToggleFavorite: (stopId: string) => void;
  onOpenStop: (stop: Stop) => void;
  onOpenRoute: (route: RouteSummary) => void;
};

export const StopSheet = forwardRef<BottomSheet, StopSheetProps>(function StopSheet(
  {
    stops,
    status,
    routesByStop,
    favoriteIds,
    selectedId,
    onSelect,
    onToggleFavorite,
    onOpenStop,
    onOpenRoute,
  },
  ref,
) {
  const { palette } = useTheme();
  const detents = useMemo(() => [...DETENTS], []);

  const renderItem = useCallback(
    ({ item }: { item: StopWithDistance }) => (
      <View>
        <StopRow
          stop={item}
          routes={routesByStop.get(item.stop_id) ?? []}
          meters={item.meters}
          isFavorite={favoriteIds.includes(item.stop_id)}
          onToggleFavorite={onToggleFavorite}
          onPress={onSelect}
          onPressRoute={onOpenRoute}
        />
        {/*
          Mounted only for the selected stop, which is what keeps exactly one
          arrivals poll running at a time: unmounting tears down useArrivals'
          fetch and its 60-second timer with it, so changing selection cannot
          leave the previous stop polling in the background.
        */}
        {selectedId === item.stop_id ? (
          <ExpandedStopRow stop={item} onOpen={onOpenStop} />
        ) : null}
      </View>
    ),
    [routesByStop, favoriteIds, selectedId, onSelect, onToggleFavorite, onOpenStop, onOpenRoute],
  );

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={detents}
      enablePanDownToClose={false}
      backgroundStyle={{ backgroundColor: palette.background }}
      handleIndicatorStyle={{ backgroundColor: palette.muted }}
    >
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
