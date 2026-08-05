import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { useTheme } from '../../lib/theme';

/**
 * ============================================================================
 * THROWAWAY. DELETE THIS FILE BEFORE INCREMENT 6 MERGES.
 * ============================================================================
 *
 * It exists to answer one question with observation instead of argument: what
 * does Apple's geocoder actually return for Oahu? Address search was specced
 * on the strength of `Location.geocodeAsync` being free, already a dependency,
 * and needing no native module — all true — but what it *resolves* is the part
 * nobody here can check without a device.
 *
 * Truman types six things (a street address, a mall, a school, a restaurant, a
 * beach, a neighbourhood) and screenshots the results. Then the real feature
 * gets designed against what came back.
 *
 * Two things already known, and worth confirming rather than assuming:
 *
 * - **Places are not addresses.** `geocodeAsync` is `CLGeocoder` on iOS, an
 *   address geocoder. Point-of-interest search is `MKLocalSearch`, which
 *   `react-native-maps` does not expose. Truman accepted address-only if
 *   places do not resolve.
 * - **Nothing comes back but coordinates.** `LocationGeocodedLocation` is
 *   `latitude`/`longitude` plus optional `altitude`/`accuracy` — there is no
 *   formatted address in the reply, so a "did you mean…" confirmation would
 *   need a reverse-geocode of the result. The raw dump below is what proves
 *   that on a device rather than from a `.d.ts`.
 *
 * Submit-on-enter, never on change: Apple documents at most one geocoding
 * request per user action, so the debounced type-ahead the stop search uses is
 * exactly the wrong shape here.
 *
 * No tests, deliberately — a test for this would outlive it.
 */

type Probe =
  | { state: 'idle' }
  | { state: 'running'; query: string }
  | { state: 'done'; query: string; results: Location.LocationGeocodedLocation[] }
  | { state: 'failed'; query: string; message: string };

export function GeocoderProbe() {
  const { palette } = useTheme();
  const [value, setValue] = useState('');
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });

  const run = async (query: string) => {
    const trimmed = query.trim();
    if (trimmed === '') return;

    setProbe({ state: 'running', query: trimmed });
    try {
      const results = await Location.geocodeAsync(trimmed);
      setProbe({ state: 'done', query: trimmed, results });
    } catch (error) {
      // Printed rather than classified. Which failures this throws for — an
      // empty result versus a network problem versus a rate limit — is one of
      // the things the probe is here to find out.
      setProbe({
        state: 'failed',
        query: trimmed,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <>
      <Text style={[styles.header, { color: palette.muted }]}>
        GEOCODER PROBE (TEMPORARY)
      </Text>
      <View style={[styles.group, { backgroundColor: palette.section, borderColor: palette.border }]}>
        <TextInput
          value={value}
          onChangeText={setValue}
          onSubmitEditing={() => run(value)}
          placeholder="An address, or a place to see if it resolves"
          placeholderTextColor={palette.muted}
          accessibilityLabel="Geocoder probe query"
          style={[styles.field, { color: palette.text, borderColor: palette.border }]}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          // The whole point of the probe: one request per deliberate action.
          blurOnSubmit={false}
        />

        {probe.state === 'idle' ? (
          <Text style={[styles.body, { color: palette.muted }]}>
            Type something and press search. Nothing is sent until you do.
          </Text>
        ) : null}

        {probe.state === 'running' ? (
          <Text style={[styles.body, { color: palette.muted }]}>Geocoding “{probe.query}”…</Text>
        ) : null}

        {probe.state === 'failed' ? (
          <Text style={[styles.body, { color: palette.warning }]}>
            threw for “{probe.query}”: {probe.message}
          </Text>
        ) : null}

        {probe.state === 'done' ? (
          <>
            <Text style={[styles.body, { color: palette.text }]}>
              “{probe.query}” → {probe.results.length}{' '}
              {probe.results.length === 1 ? 'result' : 'results'}
            </Text>
            {probe.results.map((result, index) => (
              // Whole object, not picked fields — what is *absent* from the
              // reply is as much of the finding as what is in it.
              <Text key={index} style={[styles.raw, { color: palette.muted }]}>
                {JSON.stringify(result)}
              </Text>
            ))}
          </>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginTop: 24, marginBottom: 8 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 10 },
  field: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    fontSize: 16,
  },
  body: { fontSize: 14, lineHeight: 20 },
  raw: { fontSize: 12, lineHeight: 17, fontFamily: 'Courier' },
});
