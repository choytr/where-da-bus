import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Arrival } from '../../data/thebus';
import { countdown, hawaiiClock } from './format';

export type ArrivalRowProps = {
  arrival: Arrival;
  /** The server's clock, carried onto the device's — see `serverClockOffset`. */
  now: Date;
};

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
export function ArrivalRow({ arrival, now }: ArrivalRowProps) {
  const palette = useColorScheme() === 'dark' ? dark : light;
  const isLive = arrival.estimate === 'live';

  const status = isLive
    ? arrival.vehicle === null
      ? 'Live'
      : `Live · Bus ${arrival.vehicle}`
    : 'Scheduled — no bus tracking yet';

  return (
    <View
      // `accessible` is what makes the label below replace the children rather
      // than sit alongside them: without it VoiceOver reads the countdown, the
      // clock, the route and the status as four separate unlabelled items.
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        `Route ${arrival.route} to ${arrival.headsign}, ` +
        `${countdown(arrival.arrivesAt, now)}, at ${hawaiiClock(arrival.arrivesAt)}, ` +
        (isLive ? 'tracked live' : 'scheduled, not tracked') +
        (arrival.canceled ? ', canceled' : '')
      }
      style={[styles.row, { borderBottomColor: palette.border }]}
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
    </View>
  );
}

const light = {
  text: '#11181c',
  muted: '#687076',
  border: '#e6e8eb',
  chip: '#eceef0',
  live: '#0a7d33',
  canceled: '#b3261e',
};

const dark = {
  text: '#ecedee',
  muted: '#9ba1a6',
  border: '#2a2f31',
  chip: '#22282a',
  live: '#4ac26b',
  canceled: '#f2836b',
};

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
