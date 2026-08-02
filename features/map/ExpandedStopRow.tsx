import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useArrivals } from '../arrivals/useArrivals';
import { useNow } from '../arrivals/useNow';
import { ageLabel, countdown, serverClockOffset } from '../arrivals/format';
import { useTheme } from '../../lib/theme';
import type { Stop } from '../../data/gtfs/types';

/**
 * The selected stop's next few arrivals, inline in the sheet.
 *
 * The point of this component is that it is *small*, and §4's states still have
 * to be told apart at this size. `CLAUDE.md` puts it plainly: "no buses coming"
 * and "couldn't reach the service" must never render alike, because that
 * ambiguity is what makes a transit app untrustworthy at a stop at night.
 * Squeezing three lines out of the arrival board is not a licence to collapse
 * them — each state gets its own sentence, and a failure keeps the last known
 * times on screen with their age rather than replacing them with a spinner.
 */

/** Enough to decide whether to run for it. The full board is one tap away. */
const SHOWN = 3;

const CHECKING = 'Checking arrivals…';
const NO_BUSES = 'No buses due here right now.';
const UNREACHABLE = 'Could not reach the service.';

/** How often the countdowns re-render. Independent of useArrivals' 60s poll. */
const TICK_MS = 10_000;

export function ExpandedStopRow({ stop, onOpen }: { stop: Stop; onOpen: (stop: Stop) => void }) {
  const { palette } = useTheme();
  const code = stop.stop_code || stop.stop_id;
  const { board, failure, fetchedAt, loading } = useArrivals(code);
  const tick = useNow(TICK_MS);

  /**
   * Countdowns tick on the device's clock but count down to the server's, so
   * the offset between them is carried across — a device four minutes fast
   * would otherwise render every arrival as "Arriving". Same reconciliation the
   * full board does; see `serverClockOffset`.
   */
  const now =
    board !== null && fetchedAt !== null
      ? new Date(tick.getTime() + serverClockOffset(board.serverTime, fetchedAt))
      : tick;

  const arrivals = board?.arrivals.slice(0, SHOWN) ?? [];
  const nothingYet = board === null && failure === null;

  return (
    // One tap target for the whole thing: a row that has said everything it can
    // in three lines has nothing left to offer, so touching any part of it
    // means the rider wants the rest.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open arrivals for ${stop.stop_name}`}
      onPress={() => onOpen(stop)}
      style={[styles.body, { borderTopColor: palette.border }]}
    >
      {loading && nothingYet ? (
        <View style={styles.busy}>
          <ActivityIndicator />
          <Text style={[styles.status, { color: palette.muted }]}>{CHECKING}</Text>
        </View>
      ) : null}

      {/*
        Rendered above the times it describes, so a rider who reads one line and
        looks away has read the warning rather than the stale number.
      */}
      {failure !== null ? (
        <Text style={[styles.status, { color: palette.warning }]}>
          {UNREACHABLE}
          {fetchedAt !== null && board !== null
            ? ` Showing times from ${ageLabel(fetchedAt, tick)}.`
            : ''}
        </Text>
      ) : null}

      {arrivals.map((arrival) => (
        <View key={arrival.id} style={styles.arrival}>
          <Text style={[styles.route, { backgroundColor: palette.chip, color: palette.text }]}>
            {arrival.route}
          </Text>
          <Text numberOfLines={1} style={[styles.headsign, { color: palette.muted }]}>
            {arrival.headsign}
          </Text>
          <Text
            style={[
              styles.countdown,
              { color: arrival.estimate === 'live' ? palette.live : palette.text },
            ]}
          >
            {countdown(arrival.arrivesAt, now)}
          </Text>
        </View>
      ))}

      {/*
        A distinct sentence, not the same shrug as a failure. "Nothing is
        coming" is an answer; "I could not ask" is not, and a rider does
        different things in each case.
      */}
      {board !== null && board.arrivals.length === 0 && failure === null ? (
        <Text style={[styles.status, { color: palette.muted }]}>{NO_BUSES}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  arrival: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  route: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    minWidth: 38,
    textAlign: 'center',
  },
  headsign: { flex: 1, fontSize: 13 },
  countdown: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  status: { fontSize: 13, lineHeight: 18, paddingTop: 10 },
});
