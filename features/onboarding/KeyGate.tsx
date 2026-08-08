import { useState, type ReactNode } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { DISCLAIMER } from '../../lib/legal';
import { useTheBus } from '../../data/thebus';

/**
 * No key, no app.
 *
 * A hard gate rather than a soft one: search and favorites *could* work
 * without a key, since the bundled stop data is present from the first launch.
 * That was considered and rejected — it is two coherent app states instead of
 * one, and every data surface would have to decide which it is in. See the
 * increment spec; this is a product call, not a technical limit.
 *
 * A key gate, not a general prerequisite list. An earlier design made this a
 * list of unmet prerequisites so a database download could be added to it;
 * keeping the bundled asset as a floor means that second item is never coming,
 * and the abstraction would have been paying rent for it forever.
 *
 * It sits above the router, so no screen ever mounts without a key. That is
 * what keeps "no key yet" from being a fourth state threaded through every
 * view that shows data — it is handled once, here, and the only key-related
 * state the screens know about is `unauthorized`, which is a different thing.
 */

export const REGISTRATION_URL = 'https://api.thebus.org/NewAccount/';

const SAVE_FAILED = 'That key could not be saved on this device. Please try again.';

export function KeyGate({ children }: { children: ReactNode }) {
  const { key, loading, setKey } = useTheBus();

  // Nothing, not a spinner. The keychain read takes a frame or two, and a
  // flash of onboarding for someone who already has a key is worse than a
  // blank one.
  if (loading) return null;

  if (key !== null) return <>{children}</>;

  return <Onboarding onSave={setKey} />;
}

function Onboarding({ onSave }: { onSave: (key: string) => Promise<void> }) {
  const { palette } = useTheme();
  const [entered, setEntered] = useState('');
  const [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const trimmed = entered.trim();
  const canContinue = trimmed !== '';

  const save = async () => {
    if (!canContinue) return;
    setFailed(false);
    try {
      await onSave(trimmed);
    } catch {
      // The provider leaves its state alone when a save fails, so the gate is
      // still standing and this is the only thing the user needs told.
      setFailed(true);
    }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* No attribution here. Nothing on this screen presents the
            provider's data — that is the whole point of the gate: it stands
            because there is no key yet, so no request has been made. The
            terms bind "you must present the Data with the following legend",
            and this screen presents none. See `lib/Attribution.tsx`. */}
        <Text style={[styles.title, { color: palette.text }]}>Add your API key</Text>

        <Text style={[styles.body, { color: palette.text }]}>
          Live arrival times come from the island&rsquo;s transit API, which asks each app
          to identify itself with its own key. Registering is free and takes an email
          address.
        </Text>

        <Text style={[styles.sectionHeader, { color: palette.muted }]}>REGISTER</Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            // Nothing to handle if this fails: the URL is on screen as text
            // above, so a phone with no browser to open still shows the user
            // where to go.
            void Linking.openURL(REGISTRATION_URL).catch(() => {});
          }}
          style={[styles.group, { backgroundColor: palette.section, borderColor: palette.border }]}
        >
          <Text style={[styles.link, { color: palette.text }]}>{REGISTRATION_URL}</Text>
        </Pressable>

        <Text style={[styles.sectionHeader, { color: palette.muted }]}>YOUR KEY</Text>
        <View
          style={[
            styles.group,
            styles.keyRow,
            { backgroundColor: palette.section, borderColor: palette.border },
          ]}
        >
          <TextInput
            accessibilityLabel="API key"
            placeholder="Paste your key here"
            placeholderTextColor={palette.muted}
            value={entered}
            onChangeText={(next) => {
              setEntered(next);
              setFailed(false);
            }}
            // Masked by default: this is a credential, and it is entered in
            // whatever public place someone happens to be setting the app up.
            // With a reveal toggle, because a pasted GUID is otherwise
            // unverifiable — the only feedback on a bad paste would come from
            // the arrival board, much later. Same pair as Settings.
            secureTextEntry={!revealed}
            // A key is a GUID pasted from an email. Every one of these is off
            // because the OS would otherwise capitalise it, autocorrect it, or
            // offer to save it as a password — the last of which `secureTextEntry`
            // makes iOS especially keen to do.
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            spellCheck={false}
            onSubmitEditing={() => void save()}
            returnKeyType="done"
            style={[styles.input, { color: palette.text }]}
          />
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

        <Text style={[styles.footnote, { color: palette.muted }]}>
          The key is stored on this device and is sent only to the transit API.
        </Text>

        {failed ? (
          <Text style={[styles.error, { color: palette.warning }]}>{SAVE_FAILED}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          disabled={!canContinue}
          onPress={() => void save()}
          style={[
            styles.button,
            { backgroundColor: palette.section, borderColor: palette.border },
            !canContinue && styles.buttonDisabled,
          ]}
        >
          <Text style={[styles.buttonLabel, { color: palette.text }]}>Continue</Text>
        </Pressable>

        {/*
          The key is not checked here. Validating it means a network round-trip
          that can fail for reasons that are not the key's fault, and the
          arrival board already tells an outage apart from a rejected key. Save,
          proceed, and let the first real request be the one that tells the
          truth.
        */}
        <Text style={[styles.footnote, { color: palette.muted }]}>
          Keys are deleted by the transit service after six months without use. If arrivals
          stop loading, register again and replace the key in Settings.
        </Text>

        <Text style={[styles.legal, { color: palette.muted }]}>{DISCLAIMER}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 8 },
  attribution: { fontSize: 11, lineHeight: 15 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 4, marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 21 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginTop: 16,
    marginLeft: 4,
  },
  group: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  link: { fontSize: 15, padding: 14 },
  keyRow: { flexDirection: 'row', alignItems: 'center' },
  // Takes the row's spare width so the reveal control keeps a fixed target.
  input: { fontSize: 16, padding: 14, minHeight: 48, flex: 1 },
  reveal: { paddingHorizontal: 14, paddingVertical: 14, minHeight: 48, justifyContent: 'center' },
  revealLabel: { fontSize: 15, fontWeight: '600' },
  footnote: { fontSize: 12, lineHeight: 17, marginLeft: 4 },
  error: { fontSize: 13, lineHeight: 18, marginLeft: 4 },
  button: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  legal: { fontSize: 11, lineHeight: 15, marginTop: 16 },
});
