import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, THEME_PREFERENCES, type ThemePreference } from '../../lib/theme';
import { useStopQueries } from '../../data/gtfs/db';
import { feedValidity, formatFeedDate, timeAgo } from '../../data/gtfs/feedValidity';
import { refreshStopData } from '../../data/gtfs/dataRefresh';
import { loadCurrentDatabase, loadLastChecked } from '../../data/storage/database';
import { ATTRIBUTION, DISCLAIMER } from '../../lib/legal';
import { useTheBus } from '../../data/thebus';
import { REGISTRATION_URL } from '../onboarding/KeyGate';

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

/**
 * Enough of the key to tell one from another, and no more.
 *
 * The last four characters are what someone checks against the email the key
 * arrived in. The rest is a credential and does not need to be on a screen in
 * a bus shelter — the reveal toggle is there for when it does.
 *
 * A fixed number of bullets rather than one per character, so the mask does not
 * quietly report the key's length.
 */
function maskKey(key: string): string {
  return `${'•'.repeat(12)}${key.slice(-4)}`;
}

/**
 * The key section. Replacing and removing both live here because this is where
 * someone arrives after being told "your API key was rejected" by the arrival
 * board — the two things they might do about it should be in the same place as
 * the thing that told them.
 */
function ApiKeySection() {
  const { palette } = useTheme();
  const { key, setKey, clearKey } = useTheBus();
  const [revealed, setRevealed] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [failed, setFailed] = useState(false);

  const group = [styles.group, { backgroundColor: palette.section, borderColor: palette.border }];
  /** The hairline between rows inside a group, matching the appearance list. */
  const divider = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border };
  const trimmed = replacement.trim();

  const saveReplacement = async () => {
    if (trimmed === '') return;
    setFailed(false);
    try {
      await setKey(trimmed);
      setReplacement('');
      setRevealed(false);
    } catch {
      setFailed(true);
    }
  };

  /**
   * Removing the key drops the user back to onboarding, because the gate is
   * above the router and there is nothing behind it without a key. That is a
   * long way to go on a mis-tap, so it asks first.
   */
  const confirmRemove = () => {
    Alert.alert(
      'Remove your API key?',
      'The app cannot show arrivals without a key, and you will be asked for one again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void clearKey();
          },
        },
      ],
    );
  };

  return (
    <>
      <Text style={[styles.sectionHeader, { color: palette.muted }]}>API KEY</Text>
      <View style={group}>
        <View style={styles.keyRow}>
          <Text
            style={[styles.keyValue, { color: palette.text }]}
            // Selectable only once revealed, so copying gets the key rather
            // than a string of bullets. `key` is non-null in practice — the
            // gate is the only way onto this screen — and the branch is here
            // so the type does not have to be widened to say otherwise.
            selectable={revealed}
          >
            {key === null ? '' : revealed ? key : maskKey(key)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide key' : 'Show key'}
            onPress={() => setRevealed((was) => !was)}
            style={styles.reveal}
          >
            <Text style={[styles.revealLabel, { color: palette.text }]}>
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>

        <View style={divider}>
          <TextInput
            accessibilityLabel="Replacement API key"
            placeholder="Paste a new key to replace it"
            placeholderTextColor={palette.muted}
            value={replacement}
            onChangeText={(next) => {
              setReplacement(next);
              setFailed(false);
            }}
            // Masked, on the same toggle that reveals the stored key above.
            // One control for "show me the key material on this screen" is
            // what makes the pair legible; two would beg the question of why
            // the field a credential is typed *into* is the readable one.
            secureTextEntry={!revealed}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            // iOS is especially keen to offer to save a `secureTextEntry`
            // field as a password. This is a GUID pasted from an email.
            textContentType="none"
            spellCheck={false}
            onSubmitEditing={() => void saveReplacement()}
            returnKeyType="done"
            style={[styles.input, { color: palette.text }]}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: trimmed === '' }}
          disabled={trimmed === ''}
          onPress={() => void saveReplacement()}
          style={[styles.option, divider, trimmed === '' && styles.dimmed]}
        >
          <Text style={[styles.optionLabel, { color: palette.text }]}>Save key</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={confirmRemove}
          style={[styles.option, divider]}
        >
          <Text style={[styles.optionLabel, { color: palette.warning }]}>Remove key</Text>
        </Pressable>
      </View>

      {failed ? (
        <Text style={[styles.footnote, { color: palette.warning }]}>
          That key could not be saved on this device. Please try again.
        </Text>
      ) : null}

      <Text style={[styles.footnote, { color: palette.muted }]}>
        Keys are deleted by the transit service after six months without use. If arrivals stop
        loading, register again and paste the new key here.
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          void Linking.openURL(REGISTRATION_URL).catch(() => {});
        }}
      >
        <Text style={[styles.footnote, { color: palette.text }]}>{REGISTRATION_URL}</Text>
      </Pressable>
    </>
  );
}

/**
 * What a **Check now** can end in. Deliberately four states rather than three:
 * "installed" is not "up to date", because the build it just fetched is not the
 * one on screen — the pointer is read once at launch, so a new generation is
 * opened next time the app starts. Saying "up to date" here would be a small
 * lie that makes the next launch's changed stop names look like a glitch.
 */
type CheckState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'installed' }
  | { state: 'failed' };

const CHECK_MESSAGE: Record<Exclude<CheckState['state'], 'idle' | 'checking'>, string> = {
  'up-to-date': 'Your stop data is the latest published.',
  installed:
    'New stop data downloaded. It will be used the next time you open the app.',
  // Names what did *not* happen, because that is the question someone reads
  // this to answer. A refresh that failed changes nothing, and the alternative
  // wording — "stop data could not be updated" — reads like a fault in the data
  // on the device rather than in reaching the service.
  failed: 'Could not reach the stop-data service. The data on this device is unchanged.',
};

/**
 * Where the stop data came from and how fresh it is, plus the one control that
 * does something about it.
 *
 * The refresh runs on its own at launch, so this section is mostly a report.
 * **Check now** exists because a background task nobody can see is
 * indistinguishable from one that is not running — the same reason the arrival
 * board shows its age at all times rather than only when something is wrong.
 */
function StopDataSection({ feedEnd }: { feedEnd: string | null }) {
  const { palette } = useTheme();
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckState>({ state: 'idle' });

  const readState = useCallback(async () => {
    const [current, last] = await Promise.all([loadCurrentDatabase(), loadLastChecked()]);
    return { builtAt: current?.builtAt ?? null, checkedAt: last };
  }, []);

  useEffect(() => {
    let cancelled = false;
    readState()
      .then((state) => {
        if (cancelled) return;
        setBuiltAt(state.builtAt);
        setCheckedAt(state.checkedAt);
      })
      // Both reads already swallow their own failures and answer null, which
      // renders as the bundled-data wording — true of a device that has never
      // refreshed, and the honest thing to say when we cannot tell.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [readState]);

  const checkNow = async () => {
    setCheck({ state: 'checking' });
    let outcome: CheckState;
    try {
      const result = await refreshStopData();
      outcome = { state: result.state === 'installed' ? 'installed' : 'up-to-date' };
    } catch {
      outcome = { state: 'failed' };
    }
    // Re-read afterwards rather than deriving from the result: the refresh
    // writes "last checked" on both paths, and this is also what picks up a
    // check the launch effect ran and this screen coalesced with.
    const state = await readState();
    setBuiltAt(state.builtAt);
    setCheckedAt(state.checkedAt);
    setCheck(outcome);
  };

  const busy = check.state === 'checking';
  const group = [styles.group, { backgroundColor: palette.section, borderColor: palette.border }];
  const divider = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border };
  const checkedOn = checkedAt === null ? null : new Date(checkedAt);
  const builtOn = builtAt === null ? null : new Date(builtAt);

  return (
    <>
      <Text style={[styles.sectionHeader, { color: palette.muted }]}>STOP DATA</Text>
      <View style={group}>
        <Text style={[styles.body, { color: palette.text }]}>{feedLine(feedEnd, new Date())}</Text>

        <View style={divider}>
          <Text style={[styles.body, { color: palette.muted }]}>
            {builtOn === null || Number.isNaN(builtOn.getTime())
              ? 'Using the copy that came with the app.'
              : `Using the copy published ${formatFeedDate(builtOn)}.`}
            {'\n'}
            {checkedOn === null || Number.isNaN(checkedOn.getTime())
              ? 'Not checked for updates yet.'
              : `Last checked ${timeAgo(checkedOn, new Date())}.`}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={() => void checkNow()}
          style={[styles.option, divider, busy && styles.dimmed]}
        >
          <Text style={[styles.optionLabel, { color: palette.text }]}>
            {busy ? 'Checking…' : 'Check now'}
          </Text>
        </Pressable>
      </View>

      {check.state === 'idle' || busy ? null : (
        <Text
          style={[
            styles.footnote,
            { color: check.state === 'failed' ? palette.warning : palette.muted },
          ]}
        >
          {CHECK_MESSAGE[check.state]}
        </Text>
      )}

      <Text style={[styles.footnote, { color: palette.muted }]}>
        Arrival times always come from the live service and are never read from this copy.
      </Text>
    </>
  );
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

        <ApiKeySection />

        <StopDataSection feedEnd={feedEnd} />

        <Text style={[styles.sectionHeader, { color: palette.muted }]}>ABOUT</Text>
        <View style={group}>
          <Text style={[styles.body, { color: palette.text }]}>{DISCLAIMER}</Text>
          {/*
            This screen presents none of the provider's route or arrival data —
            it is appearance, a key, and how old a local file is — so the terms'
            legend is not owed here and no longer leads the screen. It stays in
            About as the app's one fixed statement of provenance, findable
            without a stop on screen. See `lib/Attribution.tsx`.
          */}
          <Text style={[styles.attribution, { color: palette.muted }]}>{ATTRIBUTION}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 8 },
  /**
   * Inset to match `body` above it, which it sits under inside the same group.
   * It had the type size and no padding at all, so it ran flush into the
   * group's rounded border while the disclaimer above kept a 14 pt margin — the
   * two lines looked like they belonged to different cards.
   *
   * No `paddingTop`: `body`'s own bottom padding is the gap between them, and
   * adding a second would double it.
   */
  attribution: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
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
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    minHeight: 48,
  },
  keyValue: { fontSize: 15, fontVariant: ['tabular-nums'], flexShrink: 1 },
  reveal: { paddingHorizontal: 14, paddingVertical: 14, minHeight: 48, justifyContent: 'center' },
  revealLabel: { fontSize: 15, fontWeight: '600' },
  input: { fontSize: 16, padding: 14, minHeight: 48 },
  dimmed: { opacity: 0.5 },
});
