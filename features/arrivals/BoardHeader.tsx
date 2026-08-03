import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme';
import { ATTRIBUTION } from '../../lib/legal';
import type { ArrivalsFailure } from '../../data/thebus';
import { NOTICES, describe } from './board';
import { ageLabel } from './format';

/**
 * What sits above one stop's arrivals: the attribution, which stop this is,
 * how old the times are, and — when a poll has failed over a board already on
 * screen — the banner that admits it.
 *
 * Shared by both hosts so the legal line cannot go missing from one of them,
 * and so the stale banner keeps saying the same thing in both places. It takes
 * the stop's *name* rather than resolving it, because the two hosts know it by
 * different routes: the standalone screen has only a code and has to look it
 * up, while the sheet was handed the whole stop when the pin was tapped.
 */
export type BoardHeaderProps = {
  /** Already resolved by the host. Empty and unknown-stop wording differ per host. */
  stopName: string;
  stopCode: string;
  fetchedAt: Date | null;
  failure: ArrivalsFailure | null;
  /**
   * The **device** clock — `useArrivalBoard`'s `tick`, not its `now`. The age
   * is the distance from `fetchedAt`, which is a device timestamp.
   */
  now: Date;
};

export function BoardHeader({ stopName, stopCode, fetchedAt, failure, now }: BoardHeaderProps) {
  const { palette } = useTheme();

  return (
    <View style={styles.header}>
      {/* The provider's terms require prominent display wherever their route
          and arrival data appears, so it leads the board in both hosts. */}
      <Text style={[styles.attribution, { color: palette.muted }]}>{ATTRIBUTION}</Text>

      <Text style={[styles.stopName, { color: palette.text }]}>{stopName}</Text>
      <Text style={[styles.stopCode, { color: palette.muted }]}>Stop {stopCode}</Text>

      {fetchedAt === null ? null : (
        <Text style={[styles.age, { color: palette.muted }]}>
          Updated {ageLabel(fetchedAt, now)}
        </Text>
      )}

      {failure === null || fetchedAt === null ? null : (
        // Stale data stays on screen and says so. This is the §4 state that a
        // spinner would otherwise have quietly destroyed.
        //
        // `fetchedAt === null` means nothing was ever received, so there are no
        // "last times" for this banner to be about — that failure is the host's
        // to render, and both hosts do, in the space the arrivals would fill.
        <View style={[styles.banner, { backgroundColor: palette.bannerBg }]}>
          <Text style={[styles.bannerText, { color: palette.bannerText }]}>
            {describe(failure)} {NOTICES.stale}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  attribution: { fontSize: 11, lineHeight: 15, marginBottom: 10 },
  stopName: { fontSize: 20, fontWeight: '700' },
  stopCode: { fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  age: { fontSize: 12, marginTop: 6, fontVariant: ['tabular-nums'] },
  banner: { marginTop: 10, padding: 10, borderRadius: 8 },
  bannerText: { fontSize: 13, lineHeight: 18 },
});
