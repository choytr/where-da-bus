import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteRow } from './RouteRow';
import { SearchNudge } from './SearchNudge';
import { nudgeFor } from './nudge';
import { useTheme } from '../../lib/theme';
import type { OtherMatches, SearchFilter, SearchResult, SearchState } from './useSearch';
import type { RouteSummary, Stop } from '../../data/gtfs/types';

/**
 * What a search found, or the reason it found nothing.
 *
 * The three states stay apart, as §4 requires: still looking, looked and there
 * is nothing, and could not look at all. A spinner never replaces results
 * already on screen — `running` carries them — because a keystroke must not
 * blank the list out from under a thumb already reaching for a row.
 *
 * The nudge lives here because this is the component that can see both the
 * empty result and the other filters' counts.
 */

const RUNNING = 'Searching…';
const FAILED = 'Could not search the stop list on this device.';
const emptyFor = (filter: SearchFilter): string =>
  filter === 'routes' ? 'No routes match that.' : 'No stops match that.';
/** Address shows nothing until a submit, so it says what it is waiting for. */
const ADDRESS_HINT = 'Type an address, then search.';

export type ResultListProps = {
  /** As typed, for the nudge — an empty field is not a failed search. */
  query: string;
  filter: SearchFilter;
  filters: readonly SearchFilter[];
  state: SearchState;
  otherMatches: OtherMatches;
  onSelectStop: (stop: Stop) => void;
  onSelectRoute: (route: RouteSummary) => void;
  onSwitchFilter: (filter: SearchFilter) => void;
  /** Rendered above the results — the address confirmation, in Address mode. */
  header?: React.ReactNode;
};

export function ResultList({
  query,
  filter,
  filters,
  state,
  otherMatches,
  onSelectStop,
  onSelectRoute,
  onSwitchFilter,
  header,
}: ResultListProps) {
  const { palette } = useTheme();
  const results = state.state === 'running' || state.state === 'done' ? state.results : [];
  const searched = query.trim() !== '';
  const nudge = nudgeFor({ query, filter, filters, state, matches: otherMatches });

  return (
    <View style={styles.fill}>
      {header}

      <SearchNudge nudge={nudge} onSwitchFilter={onSwitchFilter} />

      {state.state === 'running' ? (
        // Beside the results rather than instead of them.
        <View style={styles.busy}>
          <ActivityIndicator />
          <Text style={[styles.notice, { color: palette.muted }]}>{RUNNING}</Text>
        </View>
      ) : null}

      {state.state === 'failed' ? (
        <Text style={[styles.notice, { color: palette.warning }]}>{FAILED}</Text>
      ) : null}

      {/* Suppressed under a nudge, which already says nothing matched and adds
          what to do about it — two lines saying the same thing is one too
          many. */}
      {state.state === 'done' && results.length === 0 && nudge === null ? (
        <Text style={[styles.notice, { color: palette.muted }]}>{emptyFor(filter)}</Text>
      ) : null}

      {filter === 'address' && !searched ? (
        <Text style={[styles.notice, { color: palette.muted }]}>{ADDRESS_HINT}</Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={keyOf}
        // Without this the first tap on a row while the keyboard is up is
        // swallowed by the dismissal, and the rider has to tap twice.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) =>
          item.kind === 'route' ? (
            <RouteRow route={item.route} onPress={onSelectRoute} />
          ) : (
            <StopResultRow stop={item.stop} onPress={onSelectStop} />
          )
        }
      />
    </View>
  );
}

const keyOf = (result: SearchResult): string =>
  result.kind === 'stop' ? `stop:${result.stop.stop_id}` : `route:${result.route.route_id}`;

/**
 * A search result is for *picking* a stop, so this is the name and the number
 * on the pole and nothing else.
 *
 * Deliberately not `StopRow`, which carries a star and the routes serving the
 * stop: both need data this list does not fetch, and both are already on the
 * thing a tap opens — the arrival board in one host, the map's card in the
 * other. A star that needed a second query per screenful of results would be
 * paying for a decoration.
 */
function StopResultRow({ stop, onPress }: { stop: Stop; onPress: (stop: Stop) => void }) {
  const { palette } = useTheme();
  const code = stop.stop_code === '' ? stop.stop_id : stop.stop_code;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stop.stop_name}, stop ${code}`}
      onPress={() => onPress(stop)}
      style={[styles.stop, { borderBottomColor: palette.border }]}
    >
      <Text style={[styles.stopName, { color: palette.text }]}>{stop.stop_name}</Text>
      <Text style={[styles.stopCode, { color: palette.muted }]}>Stop {code}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  busy: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  notice: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
  stop: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stopName: { fontSize: 16, fontWeight: '600' },
  stopCode: { fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
});
