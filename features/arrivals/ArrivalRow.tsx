import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Arrival } from '../../data/thebus';
import { countdown, hawaiiClock } from './format';
import { useTheme } from '../../lib/theme';
import { showRowMenu } from '../../lib/rowMenu';
import { showOnMap } from '../map/showOnMap';

export type ArrivalRowProps = {
  arrival: Arrival;
  /** The server's clock, carried onto the device's — see `serverClockOffset`. */
  now: Date;
  /**
   * Optional, and only the map passes it: tapping an arrival there highlights
   * the bus already drawn behind the sheet, joined on trip id. `/stop/[code]`
   * has no map to point at, so a row there stays a row rather than growing an
   * affordance that leads nowhere.
   */
  onPress?: (arrival: Arrival) => void;
  selected?: boolean;
  /**
   * The stop this board belongs to, so the map can anchor where the rider is
   * and open the board they came from. Null only while `/stop/[code]` is still
   * resolving the code it was given.
   */
  stopId: string | null;
};

/**
 * Whether *Show live bus on map* is worth offering for this arrival.
 *
 * **One fact with three spellings.** Sampled live on 2026-08-10 across 300
 * arrivals: the arrivals carrying a `vehicle`, the ones marked `estimated="1"`,
 * and the ones carrying a real position were the *same* 19. So this needs no
 * request — an `Arrival` already knows — and testing two of the three is belt
 * and braces rather than two conditions.
 *
 * It is a minority: 6.3% at 00:40 HST, and nearer one in ten by day. That is
 * exactly why the entry is **absent** rather than greyed out. A row that is
 * permanently disabled reads as broken; a row that is not there reads as this
 * bus not being tracked, which the status line already says in words.
 */
export function hasReportingBus(arrival: Arrival): boolean {
  return arrival.estimate === 'live' && arrival.vehicle !== null;
}

/**
 * One bus, on one row.
 *
 * The countdown leads because it is the question a rider is actually asking,
 * and the clock time sits under it because a countdown alone cannot be checked
 * against anything. Both are shown for the same reason the old DaBus app
 * showed both.
 *
 * Whether the time is a measurement or a guess is stated in words, not
 * signalled by colour alone — 96% of arrivals are schedule-only, so this is
 * the most common thing on the screen rather than an edge case, and a rider
 * deciding whether to leave the house deserves to know which one they are
 * reading.
 */
export function ArrivalRow({
  arrival,
  now,
  onPress,
  selected = false,
  stopId,
}: ArrivalRowProps) {
  const { palette } = useTheme();
  const isLive = arrival.estimate === 'live';

  /**
   * The long press, on both hosts. Unlike the tap — which the arrival board has
   * no map to answer with, so it is a plain row there — this works from either,
   * because it *takes* the rider to the map rather than pointing at one behind
   * the sheet.
   */
  const openMenu = () =>
    void showRowMenu([
      ...(hasReportingBus(arrival) && stopId !== null
        ? [
            {
              label: 'Show live bus on map',
              run: () =>
                showOnMap({
                  kind: 'arrival',
                  routeName: arrival.route,
                  tripId: arrival.tripId,
                  stopId,
                }),
            },
          ]
        : []),
      {
        // Null trip: the route, without singling out a bus. Every arrival can
        // answer this one, which is why it is the entry that is always here.
        label: 'Show route on map',
        run: () =>
          showOnMap({ kind: 'arrival', routeName: arrival.route, tripId: null, stopId }),
      },
    ]);

  /**
   * Deliberately short and parallel with the live case, because this is the
   * text on roughly 23 rows out of 25 — the normal state of the screen, not an
   * exception on it. "No GPS" is the discontinued DaBus app's wording and the
   * one riders here already know; "Scheduled" is what it *means*, and dropping
   * either leaves the row saying less than it should.
   */
  const status = isLive
    ? arrival.vehicle === null
      ? 'Live'
      : `Live · Bus ${arrival.vehicle}`
    : 'Scheduled · no GPS';

  // Always a `Pressable` now: even where a tap does nothing — `/stop/[code]`
  // has no map behind it to point at — a long press does. The role below still
  // says which, so VoiceOver is not told a tap leads somewhere it does not.
  const Row = Pressable;

  return (
    <Row
      // `accessible` is what makes the label below replace the children rather
      // than sit alongside them: without it VoiceOver reads the countdown, the
      // clock, the route and the status as four separate unlabelled items.
      accessible
      accessibilityRole={onPress === undefined ? 'text' : 'button'}
      accessibilityState={onPress === undefined ? undefined : { selected }}
      onPress={onPress === undefined ? undefined : () => onPress(arrival)}
      onLongPress={openMenu}
      accessibilityLabel={
        `Route ${arrival.route} to ${arrival.headsign}, ` +
        `${countdown(arrival.arrivesAt, now)}, at ${hawaiiClock(arrival.arrivesAt)}, ` +
        (isLive ? 'tracked live' : 'scheduled, not tracked') +
        (arrival.canceled ? ', canceled' : '')
      }
      style={[
        styles.row,
        { borderBottomColor: palette.border },
        selected && { backgroundColor: palette.section },
      ]}
    >
      <View style={styles.when}>
        <Text
          style={[
            styles.countdown,
            { color: arrival.canceled ? palette.muted : palette.text },
            arrival.canceled ? styles.struck : null,
          ]}
        >
          {countdown(arrival.arrivesAt, now)}
        </Text>
        <Text style={[styles.clock, { color: palette.muted }]}>
          {hawaiiClock(arrival.arrivesAt)}
        </Text>
      </View>

      <View style={styles.what}>
        <View style={styles.headline}>
          <View style={[styles.chip, { backgroundColor: palette.chip }]}>
            <Text style={[styles.chipText, { color: palette.text }]}>{arrival.route}</Text>
          </View>
          <Text numberOfLines={2} style={[styles.headsign, { color: palette.text }]}>
            {arrival.headsign}
          </Text>
        </View>

        <Text style={[styles.status, { color: isLive ? palette.live : palette.muted }]}>
          {isLive ? '● ' : '○ '}
          {status}
        </Text>

        {arrival.canceled ? (
          <Text style={[styles.canceled, { color: palette.canceled }]}>Canceled</Text>
        ) : null}
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  when: { width: 78 },
  countdown: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through' },
  clock: { fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  what: { flex: 1 },
  headline: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  headsign: { flex: 1, fontSize: 15, fontWeight: '600' },
  status: { fontSize: 13, marginTop: 6 },
  canceled: { fontSize: 13, fontWeight: '700', marginTop: 4 },
});
