import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { FilterChips } from '../search/FilterChips';
import { ResultList } from '../search/ResultList';
import { useSearch, type SearchFilter } from '../search/useSearch';
import { IDLE, LOOKING, lookUpAddress, type AddressLookup } from './address';
import { Attribution } from '../../lib/Attribution';
import { useTheme } from '../../lib/theme';
import type { RouteSummary, Stop } from '../../data/gtfs/types';
import type { Coords } from '../../lib/distance';

/**
 * The map's fullscreen search.
 *
 * **A sibling of `MapView`, never a child.** Mounting anything inside a
 * `react-native-maps` component changes a view tree whose subviews belong to
 * MapKit rather than to React, and that seam has produced a SIGABRT, markers
 * thrown to the top-left corner, and labels swallowing neighbouring taps. See
 * the map section of `docs/backlog.md`. It is drawn over the map and over the
 * sheet, so it is the last thing `MapScreen` renders.
 *
 * **It opens on Address**, which is the only thing this search does that the
 * Stops tab cannot — and it offers all three filters, because a rider who
 * typed a stop number into an address field must be one tap from the answer
 * rather than at a dead end. See `useSearch` for why there is no classifier.
 *
 * Query and filter are its own state, so closing the search forgets them and
 * the local queries stop with it. Nothing here survives a close except what a
 * result did to the map.
 */

/** All three, and it opens on the first. The Stops tab offers the other two. */
const FILTERS: readonly SearchFilter[] = ['address', 'stops', 'routes'];

const CANCEL = 'Cancel';
const CLOSE_LABEL = 'Close search';

/** The field says what the selected filter will actually search. */
const PLACEHOLDERS: Record<SearchFilter, string> = {
  address: 'Address or place',
  stops: 'Stop number or name',
  routes: 'Route number or name',
};

/** What a rider who cannot see the chips is told the field is for. */
const FIELD_LABELS: Record<SearchFilter, string> = {
  address: 'Find an address',
  stops: 'Find a stop by number or name',
  routes: 'Find a route by number or name',
};

/**
 * Every end an address lookup can reach, and no two of them alike.
 *
 * `NO_ADDRESS` and `OFF_ISLAND` are different answers to different questions,
 * and `ADDRESS_FAILED` is not an answer at all — see `AddressLookup`.
 */
const LOOKING_UP = 'Looking up that address…';
const NO_ADDRESS = 'No address matched that.';
const OFF_ISLAND = 'That address is real, but it is not on Oahu.';
const ADDRESS_FAILED = 'Could not look up that address.';
const GO = 'Go';
const CANCEL_ADDRESS = 'Cancel';
const didYouMean = (label: string): string => `Did you mean ${label}?`;

export type SearchOverlayProps = {
  onClose: () => void;
  /** Anchors the map on the stop and selects it; the rider stays on the map. */
  onSelectStop: (stop: Stop) => void;
  onSelectRoute: (route: RouteSummary) => void;
  /** Anchors and frames the map on a confirmed address. */
  onSelectAddress: (coords: Coords) => void;
  /**
   * How much of this view's bottom edge the tab bar is drawn over, from
   * `tabBarOverlapOf` — zero when the scene is already inset above the bar.
   * Only the pinned legend needs it.
   */
  tabBarOverlap: number;
};

export function SearchOverlay({
  onClose,
  onSelectStop,
  onSelectRoute,
  onSelectAddress,
  tabBarOverlap,
}: SearchOverlayProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('address');
  const { state, otherMatches } = useSearch(query, filter);

  /**
   * Where the submitted address has got to. Only Address mode ever leaves
   * `idle`; the other two answer from the bundled database as you type.
   */
  const [lookup, setLookup] = useState<AddressLookup>(IDLE);

  /**
   * Which submission the answer on screen belongs to.
   *
   * A geocode is two network round trips, and a rider who types on while one is
   * in flight must not have a confirmation for their previous text appear over
   * their new one. Bumped by the reset below as well as by each submission, so
   * an answer superseded by *typing* is dropped for the same reason as one
   * superseded by a second submit.
   */
  const attempt = useRef(0);

  // Editing the query, or changing filter, retires whatever was being asked
  // about — the confirmation names an address that is no longer the question.
  useEffect(() => {
    attempt.current += 1;
    setLookup(IDLE);
  }, [query, filter]);

  /**
   * The submit, which is the whole of Address mode's trigger. There is no
   * autocomplete and there is not going to be one: `geocodeAsync` returns
   * nothing printable, so a suggestion list would cost two round trips per
   * keystroke to render one row, and `CLGeocoder` throttles per app — a fast
   * typist would break this path for the rest of the session. Re-verified
   * against the installed types on 2026-08-09.
   */
  const submitAddress = useCallback(async () => {
    if (filter !== 'address') return;
    if (query.trim() === '') return;

    const mine = (attempt.current += 1);
    setLookup(LOOKING);
    const result = await lookUpAddress(
      query,
      Location.geocodeAsync,
      Location.reverseGeocodeAsync,
    );
    if (attempt.current === mine) setLookup(result);
  }, [filter, query]);

  /** Back to the field, text intact. The rider said "not that place", not
   *  "forget what I typed". */
  const dismissAddress = useCallback(() => {
    attempt.current += 1;
    setLookup(IDLE);
  }, []);

  return (
    // Opaque, and filling the screen: the map underneath is not something to
    // read through a search, and a translucent one would leave the sheet's
    // rows legible under the results.
    <View
      style={[
        styles.overlay,
        { backgroundColor: palette.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.field}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={PLACEHOLDERS[filter]}
          placeholderTextColor={palette.muted}
          accessibilityLabel={FIELD_LABELS[filter]}
          style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          // The rider tapped a bar to get here, so the field is what they were
          // reaching for. Anything else is a second tap for nothing.
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          inputMode="search"
          // Set explicitly rather than left to `inputMode`'s keyboard mapping,
          // because in Address mode this key is the only way to run the search
          // at all — the other two filters answer as you type.
          returnKeyType="search"
          onSubmitEditing={submitAddress}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CLOSE_LABEL}
          onPress={onClose}
          hitSlop={8}
        >
          <Text style={[styles.cancel, { color: palette.text }]}>{CANCEL}</Text>
        </Pressable>
      </View>

      <FilterChips filters={FILTERS} selected={filter} onSelect={setFilter} />

      <ResultList
        query={query}
        filter={filter}
        filters={FILTERS}
        state={state}
        otherMatches={otherMatches}
        onSelectStop={onSelectStop}
        onSelectRoute={onSelectRoute}
        onSwitchFilter={setFilter}
        header={
          <AddressAnswer
            lookup={lookup}
            onGo={onSelectAddress}
            onDismiss={dismissAddress}
          />
        }
      />

      {/*
        Pinned under the results rather than at the foot of their scroll, like
        every other surface that presents the Data — the stop names and route
        names in that list are it. `lib/Attribution.tsx` carries the reading of
        the terms behind the placement.
      */}
      <View style={[styles.legend, { paddingBottom: tabBarOverlap }]}>
        <Attribution />
      </View>
    </View>
  );
}

/**
 * What became of a submitted address, above the results.
 *
 * The confirmation is a question rather than a notice, and it is asked *before*
 * the map moves: the geocoder has been wrong by five thousand kilometres inside
 * a single confident result, and a bounding box makes that unlikely rather than
 * impossible. Cancel leaves the typed text in the field, because "not that
 * place" is not "forget what I typed".
 *
 * The three ways of not having an address stay apart, as §4 requires — and the
 * nudge underneath is still on screen, so a rider who typed a stop number into
 * the address field is one tap from the answer either way.
 */
function AddressAnswer({
  lookup,
  onGo,
  onDismiss,
}: {
  lookup: AddressLookup;
  onGo: (coords: Coords) => void;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();

  if (lookup.state === 'idle') return null;

  if (lookup.state === 'looking') {
    return (
      <View style={styles.busy}>
        <ActivityIndicator />
        <Text style={[styles.notice, { color: palette.muted }]}>{LOOKING_UP}</Text>
      </View>
    );
  }

  if (lookup.state !== 'confirming') {
    const text =
      lookup.state === 'offIsland'
        ? OFF_ISLAND
        : lookup.state === 'none'
          ? NO_ADDRESS
          : ADDRESS_FAILED;
    return (
      <Text
        style={[
          styles.notice,
          { color: lookup.state === 'failed' ? palette.warning : palette.muted },
        ]}
      >
        {text}
      </Text>
    );
  }

  const question = didYouMean(lookup.label);

  return (
    <View style={[styles.confirm, { borderColor: palette.border }]}>
      <Text style={[styles.question, { color: palette.text }]}>{question}</Text>
      <View style={styles.answers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Go to ${lookup.label}`}
          onPress={() => onGo(lookup.coords)}
          style={[styles.go, { backgroundColor: palette.chip }]}
        >
          <Text style={[styles.goText, { color: palette.text }]}>{GO}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not that address"
          onPress={onDismiss}
          style={styles.dismiss}
        >
          <Text style={[styles.dismissText, { color: palette.muted }]}>{CANCEL_ADDRESS}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    fontSize: 16,
  },
  cancel: { fontSize: 16 },
  busy: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  notice: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
  // Boxed rather than another line of loose text: it is a question waiting for
  // an answer, not a status line, and it must not read as one.
  confirm: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    gap: 12,
  },
  question: { fontSize: 15, lineHeight: 20 },
  answers: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  go: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  goText: { fontSize: 15, fontWeight: '600' },
  dismiss: { paddingHorizontal: 12, paddingVertical: 8 },
  dismissText: { fontSize: 15 },
  /** Never squeezed by the list above it, and never squeezing it either. */
  legend: { flexShrink: 0 },
});
