import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterChips } from '../search/FilterChips';
import { ResultList } from '../search/ResultList';
import { useSearch, type SearchFilter } from '../search/useSearch';
import { Attribution } from '../../lib/Attribution';
import { useTheme } from '../../lib/theme';
import type { RouteSummary, Stop } from '../../data/gtfs/types';

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

export type SearchOverlayProps = {
  onClose: () => void;
  /** Anchors the map on the stop and selects it; the rider stays on the map. */
  onSelectStop: (stop: Stop) => void;
  onSelectRoute: (route: RouteSummary) => void;
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
  tabBarOverlap,
}: SearchOverlayProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('address');
  const { state, otherMatches } = useSearch(query, filter);

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
  /** Never squeezed by the list above it, and never squeezing it either. */
  legend: { flexShrink: 0 },
});
