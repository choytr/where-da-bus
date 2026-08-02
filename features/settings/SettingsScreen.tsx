import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, THEME_PREFERENCES, type ThemePreference } from '../../lib/theme';
import { useStopQueries } from '../../data/gtfs/db';
import { feedValidity, formatFeedDate } from '../../data/gtfs/feedValidity';
import { ATTRIBUTION, DISCLAIMER } from '../../lib/legal';

/**
 * Appearance, what the bundled data says about its own age, and the small
 * print. Nothing here touches the network, so beyond the one query for the
 * feed's end date there is no loading state to speak of.
 */

const LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  automatic: 'Automatic',
};

/**
 * The feed states a last day it is good through. Past it the stop names,
 * codes and coordinates are simply old — not broken, not an error, and the
 * wording says so as a fact about the data rather than as a fault.
 *
 * `unknown` gets its own sentence rather than being folded into `current`:
 * "the feed never said when it expires" is not "it has not expired yet", and
 * only the second is a promise. feedValidity.ts keeps the two apart for the
 * same reason and this screen must not undo that.
 */
function feedLine(feedEnd: string | null, now: Date): string {
  const validity = feedValidity(feedEnd, now);

  switch (validity.state) {
    case 'expired':
      return `Published for service through ${formatFeedDate(validity.endsOn)}. A few stop names and locations may have changed since.`;
    case 'current':
      return `Published for service through ${formatFeedDate(validity.endsOn)}.`;
    case 'unknown':
      return 'This copy does not state how long it was published for.';
  }
}

export function SettingsScreen() {
  const { palette, preference, setPreference } = useTheme();
  const { feedEndDate } = useStopQueries();
  const [feedEnd, setFeedEnd] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    feedEndDate()
      .then((date) => {
        if (!cancelled) setFeedEnd(date);
      })
      // A feed date this screen cannot read does not need an error state of its
      // own: the `unknown` wording already says the honest thing, and a failure
      // to open the database at all is the shell's problem, not this screen's.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [feedEndDate]);

  const group = [styles.group, { backgroundColor: palette.section, borderColor: palette.border }];

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/*
          The terms require the attribution wherever their data appears, and
          this screen describes that data's provenance — so it sits at the top
          here for the same reason it does on the three data screens.
        */}
        <Text style={[styles.attribution, { color: palette.muted }]}>{ATTRIBUTION}</Text>

        <Text style={[styles.title, { color: palette.text }]}>Settings</Text>

        <Text style={[styles.sectionHeader, { color: palette.muted }]}>APPEARANCE</Text>
        <View style={group}>
          {THEME_PREFERENCES.map((option, index) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: preference === option }}
              accessibilityLabel={LABELS[option]}
              onPress={() => setPreference(option)}
              style={[
                styles.option,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: palette.border,
                },
              ]}
            >
              <Text style={[styles.optionLabel, { color: palette.text }]}>{LABELS[option]}</Text>
              {/*
                A checkmark, not colour alone. This screen is where someone who
                has just picked Dark checks that it took, and that check must
                not depend on telling two greys apart.
              */}
              {preference === option ? (
                <Text style={[styles.check, { color: palette.text }]}>✓</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
        <Text style={[styles.footnote, { color: palette.muted }]}>
          Automatic follows your phone&rsquo;s appearance.
        </Text>

        <Text style={[styles.sectionHeader, { color: palette.muted }]}>STOP DATA</Text>
        <View style={group}>
          <Text style={[styles.body, { color: palette.text }]}>{feedLine(feedEnd, new Date())}</Text>
        </View>
        <Text style={[styles.footnote, { color: palette.muted }]}>
          Arrival times always come from the live service and are never read from this copy.
        </Text>

        <Text style={[styles.sectionHeader, { color: palette.muted }]}>ABOUT</Text>
        <View style={group}>
          <Text style={[styles.body, { color: palette.text }]}>{DISCLAIMER}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 8 },
  attribution: { fontSize: 11, lineHeight: 15 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginTop: 16,
    marginLeft: 4,
  },
  group: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    // 44pt is Apple's minimum touch target; this clears it.
    minHeight: 48,
  },
  optionLabel: { fontSize: 16 },
  check: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20, padding: 14 },
  footnote: { fontSize: 12, lineHeight: 17, marginLeft: 4 },
});
