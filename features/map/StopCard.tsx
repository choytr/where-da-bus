import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetSectionList } from '@gorhom/bottom-sheet';
import { ArrivalRow } from '../arrivals/ArrivalRow';
import { BoardHeader } from '../arrivals/BoardHeader';
import { NOTICES, describe, useArrivalBoard } from '../arrivals/board';
import { PEEK_BAND } from './peek';
import { formatDistance } from '../stops/StopRow';
import { useTheme } from '../../lib/theme';
import type { RouteSummary, Stop } from '../../data/gtfs/types';
import type { TheBusClient } from '../../data/thebus';

/**
 * One selected stop, filling the sheet: the **full** arrival board, not a
 * preview of one.
 *
 * The shipped design had three levels of stop detail — the compact row, a
 * three-arrival expansion, and `/stop/[code]` — and the middle one is where
 * riders got lost, because a row that grew did not read as an invitation to
 * tap it again. Two levels is the fix. So this card shows everything the
 * standalone screen shows, and the way back is a control that says so rather
 * than a second tap on something that already looks tapped.
 *
 * There is no pull-to-refresh. At scroll offset zero the pull gesture belongs
 * to the sheet, and `@gorhom/bottom-sheet` has no iOS `RefreshControl` shim to
 * take it back; the 60-second poll and the retry below cover it.
 */

const BACK_LABEL = 'Back to nearby stops';
const BACK_TEXT = '‹ Nearby';

export type StopCardProps = {
  stop: Stop;
  /** Null when location is unknown — distance is not a precondition for arrivals. */
  meters: number | null;
  routes: RouteSummary[];
  isFavorite: boolean;
  onBack: () => void;
  onToggleFavorite: (stopId: string) => void;
  onPressRoute: (route: RouteSummary) => void;
  /** Handed down from MapScreen, which reads it from `useTheBus()`. */
  client: TheBusClient;
};

export function StopCard({
  stop,
  meters,
  routes,
  isFavorite,
  onBack,
  onToggleFavorite,
  onPressRoute,
  client,
}: StopCardProps) {
  const { palette } = useTheme();
  const code = stop.stop_code || stop.stop_id;
  const { sections, board, failure, loading, fetchedAt, refresh, now, tick } = useArrivalBoard(
    code,
    client,
  );

  const favoriteLabel = isFavorite
    ? `Remove ${stop.stop_name} from favorites`
    : `Add ${stop.stop_name} to favorites`;

  return (
    <View style={styles.fill}>
      {/*
        Fixed above the list rather than scrolling with it: the way out of this
        mode has to be reachable from wherever the rider has scrolled to.

        It is exactly `PEEK_BAND` tall, matching the *Nearby Stops* heading the
        list mode shows, so the resting sheet does not change height when a stop
        is selected. That is also why the stop's name is here and not only in
        `BoardHeader` below — this band is the whole of the resting sheet, and
        "‹ Nearby ★" on its own would say nothing about which stop.
      */}
      <View testID="stop-card-band" style={[styles.bar, { borderBottomColor: palette.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={BACK_LABEL}
          onPress={onBack}
          hitSlop={12}
        >
          <Text style={[styles.back, { color: palette.text }]}>{BACK_TEXT}</Text>
        </Pressable>

        <Text style={[styles.barName, { color: palette.text }]} numberOfLines={1}>
          {stop.stop_name}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favoriteLabel}
          onPress={() => onToggleFavorite(stop.stop_id)}
          hitSlop={12}
        >
          <Text style={[styles.star, { color: isFavorite ? palette.star : palette.muted }]}>
            {isFavorite ? '★' : '☆'}
          </Text>
        </Pressable>
      </View>

      <BottomSheetSectionList
        testID="stop-card-arrivals"
        sections={sections}
        keyExtractor={(arrival) => arrival.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <BoardHeader
              stopName={stop.stop_name}
              // The band above already carries it; see that band's note.
              showName={false}
              stopCode={code}
              fetchedAt={fetchedAt}
              failure={failure}
              now={tick}
            />

            {/* Distance and the routes served: what a rider uses to choose
                between two stops a block apart, which is the decision being
                made with a map on screen. */}
            <View style={styles.meta}>
              {meters === null ? null : (
                <Text style={[styles.metaText, { color: palette.muted }]}>
                  {formatDistance(meters)}
                </Text>
              )}
              <View style={styles.chips}>
                {routes.map((route) => (
                  <Pressable
                    key={route.route_id}
                    accessibilityRole="button"
                    accessibilityLabel={`Route ${route.short_name}`}
                    onPress={() => onPressRoute(route)}
                    hitSlop={6}
                    style={[styles.chip, { backgroundColor: palette.chip }]}
                  >
                    <Text style={[styles.chipText, { color: palette.text }]}>
                      {route.short_name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.data.length === 0 ? null : (
            <Text
              style={[
                styles.sectionHeader,
                { color: palette.muted, backgroundColor: palette.section },
              ]}
            >
              {section.title}
            </Text>
          )
        }
        renderItem={({ item }) => <ArrivalRow arrival={item} now={now} />}
        ListEmptyComponent={
          // §4's states, kept apart at this size as much as at full screen:
          // still asking, asked and there is nothing, and could not ask.
          <View style={styles.notice}>
            {loading && board === null ? (
              <View style={styles.busy}>
                <ActivityIndicator />
                <Text style={[styles.noticeText, { color: palette.muted }]}>
                  {NOTICES.loading}
                </Text>
              </View>
            ) : null}

            {board === null && failure !== null ? (
              <>
                <Text style={[styles.noticeTitle, { color: palette.text }]}>
                  {describe(failure)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={refresh}
                  hitSlop={8}
                  style={[styles.retry, { borderColor: palette.border }]}
                >
                  <Text style={[styles.retryText, { color: palette.text }]}>{NOTICES.retry}</Text>
                </Pressable>
              </>
            ) : null}

            {board !== null ? (
              <>
                <Text style={[styles.noticeTitle, { color: palette.text }]}>{NOTICES.empty}</Text>
                <Text style={[styles.noticeText, { color: palette.muted }]}>
                  {NOTICES.emptyHint}
                </Text>
              </>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    // Breathing room under the last arrival. The tab bar is cleared by the
    // legend pinned below this card by `StopSheet`, not by this list.
    paddingBottom: 32,
  },
  bar: {
    height: PEEK_BAND,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 16, fontWeight: '600' },
  /** Takes the middle and ellipsises, so a long name cannot push the star off. */
  barName: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'right' },
  star: { fontSize: 22 },
  meta: { paddingHorizontal: 16, gap: 8 },
  metaText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 8,
  },
  notice: { paddingHorizontal: 16, paddingTop: 16, gap: 8, alignItems: 'flex-start' },
  noticeTitle: { fontSize: 16, fontWeight: '600' },
  noticeText: { fontSize: 14, lineHeight: 20 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  retry: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  retryText: { fontSize: 15, fontWeight: '600' },
});
