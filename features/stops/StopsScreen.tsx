import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStopQueries } from '../../data/gtfs/db';
import { feedValidity, formatFeedDate } from '../../data/gtfs/feedValidity';
import {
  addFavorite,
  isFavorite,
  readFavorites,
  removeFavorite,
} from '../../data/storage/favorites';
import { StopRow } from './StopRow';
import { FilterChips } from '../search/FilterChips';
import { RouteRow } from '../search/RouteRow';
import { SearchNudge } from '../search/SearchNudge';
import { nudgeFor } from '../search/nudge';
import { useSearch, type SearchFilter, type SearchState } from '../search/useSearch';
import type { RouteSummary, Stop } from '../../data/gtfs/types';
import { DISCLAIMER } from '../../lib/legal';
import { Attribution } from '../../lib/Attribution';
import { useTheme } from '../../lib/theme';

/**
 * The Stops tab: a search field over the bundled stop list, with saved
 * favorites as its empty state.
 *
 * What is *not* here is the nearby list. Proximity moved to the map tab, where
 * an anchor point can be seen and moved rather than being an invisible thing
 * the list sorts by — so this screen has no `useLocation`, asks for no
 * permission, and works identically with location switched off. That is the
 * whole reason search became its own tab rather than a field inside the map's
 * bottom sheet: a text field over a map fights the sheet's gestures through
 * the keyboard.
 */

/**
 * Every message this screen can end on. No two read alike: "nothing matched"
 * and "the lookup failed" are different facts, and a rider standing at a stop
 * at night has to be able to tell which one they are looking at.
 */
const SEARCH_RUNNING = 'Searching…';
const SEARCH_EMPTY = 'No stops match that.';
const ROUTES_EMPTY = 'No routes match that.';
const ROUTES_PROMPT = 'Search for a route by number or name.';
const NO_FAVORITES_TITLE = 'No saved stops yet';
const NO_FAVORITES_BODY =
  'Search for a stop by number or name, then tap its star to keep it here.';
const DATABASE_PROBLEM = 'Something went wrong reading the stop list on this device.';
const FAVORITES_PROBLEM = 'Something went wrong reading your saved favorites.';

/**
 * The bundled stop list has a stated shelf life and has passed it. Worded as a
 * fact about the data's age rather than as a fault: nothing is broken, nothing
 * is blocked, and the screen behaves exactly as it did the day before.
 *
 * Settings says the same thing in more detail, but this notice stays here too.
 * Reference data that quietly goes stale is the one thing a rider cannot
 * detect for themselves, and a notice only reachable by opening Settings is a
 * notice nobody reads.
 */
const feedExpiredNotice = (endsOn: Date): string =>
  `Stop names and locations on this device were published for service through ${formatFeedDate(endsOn)}. A few may have changed since.`;

/** The two this tab offers. There is no Address here — it cannot geocode. */
const FILTERS: readonly SearchFilter[] = ['stops', 'routes'];

/** Digits only means the rider typed the number printed on the pole. */
const isNumericQuery = (value: string): boolean => /^\d+$/.test(value.trim());

/**
 * One shared empty list rather than a fresh `[]` per render, so the effects
 * keyed on the visible list do not re-run every render.
 */
const NO_STOPS: Stop[] = [];
const NO_ROUTES: RouteSummary[] = [];

/**
 * The three separate things this screen asks the database on its own account,
 * tracked separately.
 *
 * They fail independently — `routesForStops` can fall over on a result set
 * while `feedEndDate` answered fine at mount — so a single flag would be
 * cleared by whichever of them happened to succeed last, taking a live problem
 * off screen with it. Naming them is what lets a success clear only its own
 * failure. The search itself is no longer among them: `useSearch` reports its
 * own failure, and the notice below folds that in.
 */
type DatabaseQuery = 'feed' | 'favorite-stops' | 'routes';

const NOTHING_FAILING: ReadonlySet<DatabaseQuery> = new Set();

const foundStops = (search: SearchState): Stop[] =>
  search.state === 'running' || search.state === 'done'
    ? search.results.flatMap((result) => (result.kind === 'stop' ? [result.stop] : []))
    : NO_STOPS;

const foundRoutes = (search: SearchState): RouteSummary[] =>
  search.state === 'running' || search.state === 'done'
    ? search.results.flatMap((result) => (result.kind === 'route' ? [result.route] : []))
    : NO_ROUTES;

/**
 * Whether a saved stop is one the rider could have meant by what they typed.
 *
 * Deliberately looser than the database's own matching and run against the
 * favorites already in memory, for two reasons. A favorite has to surface even
 * when it falls outside `searchByName`'s result limit — being pushed off the
 * end of a list by strangers is exactly what "my saved stop is lost in there"
 * means. And a numeric query is an exact code lookup in SQL, which returns at
 * most one stop, so a favorite whose code merely *starts* with those digits
 * would otherwise never appear at all.
 *
 * The gap this leaves: the database uses FTS, so `"lagoon iolana"` matches a
 * stop that a plain substring test does not. Such a favorite still appears —
 * it just appears in the search results rather than pinned above them.
 */
function favoriteMatches(stop: Stop, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return false;
  if (isNumericQuery(trimmed)) {
    return stop.stop_code.startsWith(trimmed) || stop.stop_id.startsWith(trimmed);
  }
  return stop.stop_name.toLowerCase().includes(trimmed);
}

/**
 * `interactive` lets the keyboard follow a downward drag on iOS, which is what
 * a rider does when they want to see more of the list. Android has no such
 * gesture, so it dismisses on any drag.
 */
const KEYBOARD_DISMISS_MODE = Platform.select({
  ios: 'interactive',
  android: 'on-drag',
} as const);

export function StopsScreen() {
  const { palette } = useTheme();
  const { routesForStops, stopsByIds, feedEndDate } = useStopQueries();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('stops');
  const { state: search, otherMatches } = useSearch(query, filter);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteStops, setFavoriteStops] = useState<Stop[]>([]);
  const [routesByStop, setRoutesByStop] = useState<Map<string, RouteSummary[]>>(new Map());

  const [failedQueries, setFailedQueries] = useState<ReadonlySet<DatabaseQuery>>(NOTHING_FAILING);
  const [favoritesFailed, setFavoritesFailed] = useState(false);
  // Read once: baked into the bundled asset, and it cannot change while the app
  // is running.
  const [feedEnd, setFeedEnd] = useState<string | null>(null);

  /**
   * Navigation by URL rather than by a passed-in callback. The router owns the
   * back stack, so a row only has to name where it is going — and the stop code
   * is the number on the physical sign, which makes `/stop/596` a link that
   * means something on its own.
   */
  const openStop = useCallback((stop: Stop) => {
    router.push(`/stop/${encodeURIComponent(stop.stop_code || stop.stop_id)}`);
  }, []);

  const openRoute = useCallback((route: RouteSummary) => {
    router.push(`/route/${encodeURIComponent(route.route_id)}`);
  }, []);

  /**
   * Records how one query went, and clears its own past failure on success.
   *
   * Returning `current` unchanged when nothing moved is not a micro-
   * optimisation: this is called from effects keyed on the visible list, and a
   * fresh `Set` every time would be a new state value, a new render, and a new
   * list identity feeding straight back into those effects.
   */
  const noteQuery = useCallback((query: DatabaseQuery, ok: boolean) => {
    setFailedQueries((current) => {
      if (current.has(query) === !ok) return current;
      const next = new Set(current);
      if (ok) next.delete(query);
      else next.add(query);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    feedEndDate()
      .then((date) => {
        if (cancelled) return;
        setFeedEnd(date);
        noteQuery('feed', true);
      })
      .catch(() => {
        if (!cancelled) noteQuery('feed', false);
      });
    return () => {
      cancelled = true;
    };
  }, [feedEndDate, noteQuery]);

  // `readFavorites` rather than `loadFavorites`, because this screen is the one
  // with somewhere to put the difference. The lenient reader answers `[]` to
  // both "you have none" and "storage would not answer", and this screen
  // renders the first as "No saved stops yet" — which, over the second, tells a
  // rider with twenty saved stops that they have none.
  useEffect(() => {
    let cancelled = false;
    readFavorites()
      .then((read) => {
        if (cancelled) return;
        setFavoritesFailed(!read.available);
        if (read.available) setFavoriteIds(read.ids);
      })
      // `readFavorites` handles its own failures, so this is belt to braces —
      // the same shape as the pointer read in AppShell, and for the same
      // reason: an unhandled rejection out of an effect is worse than a notice.
      .catch(() => {
        if (!cancelled) setFavoritesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Resolved from the database rather than from any list already on screen: a
    // favorite must stay visible wherever the rider is, and must keep the order
    // they saved them in.
    let cancelled = false;
    stopsByIds(favoriteIds)
      .then((stops) => {
        if (cancelled) return;
        const byId = new Map(stops.map((stop) => [stop.stop_id, stop]));
        const ordered: Stop[] = [];
        for (const id of favoriteIds) {
          const stop = byId.get(id);
          if (stop !== undefined) ordered.push(stop);
        }
        setFavoriteStops(ordered);
        noteQuery('favorite-stops', true);
      })
      .catch(() => {
        if (!cancelled) noteQuery('favorite-stops', false);
      });

    return () => {
      cancelled = true;
    };
  }, [favoriteIds, stopsByIds, noteQuery]);

  // Compared against the clock at render rather than once at mount, so an app
  // left open across the expiry date starts saying so on the next redraw.
  const feed = feedValidity(feedEnd, new Date());

  // Search replaces the list rather than adding to it. With the field empty,
  // favorites are the list.
  const searching = search.state !== 'off';
  const searchStops = foundStops(search);
  const routeResults = foundRoutes(search);
  const onRoutes = filter === 'routes';

  /**
   * Matching favorites are pinned above the rest of the results, in the order
   * they were saved. Searching for a stop you have already starred is one of
   * the two things this tab is for, and leaving it to sort in among strangers
   * — or off the end of the result limit entirely — makes the star pointless.
   *
   * A favorite that is also a result appears once, at the top, not twice.
   */
  const visible: Stop[] = useMemo(() => {
    // Under the Routes filter there is no stop list at all — favorites are
    // stops, and pinning them beneath a Routes chip would be answering a
    // question nobody asked.
    if (onRoutes) return NO_STOPS;
    if (!searching) return favoriteStops;

    const pinned = favoriteStops.filter((stop) => favoriteMatches(stop, query));
    if (pinned.length === 0) return searchStops;

    const pinnedIds = new Set(pinned.map((stop) => stop.stop_id));
    return [...pinned, ...searchStops.filter((stop) => !pinnedIds.has(stop.stop_id))];
  }, [onRoutes, searching, searchStops, favoriteStops, query]);

  useEffect(() => {
    const ids = visible.map((stop) => stop.stop_id);
    if (ids.length === 0) return;

    let cancelled = false;
    routesForStops(ids)
      .then((routes) => {
        if (cancelled) return;
        setRoutesByStop(routes);
        noteQuery('routes', true);
      })
      .catch(() => {
        if (!cancelled) noteQuery('routes', false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, routesForStops, noteQuery]);

  const toggleFavorite = useCallback(
    async (stopId: string) => {
      try {
        const next = favoriteIds.includes(stopId)
          ? await removeFavorite(stopId)
          : await addFavorite(stopId);
        setFavoriteIds(next);
        // A write is the only thing that asks storage again after the read at
        // mount, so it is the only place a favorites problem can clear. That is
        // also the failure this notice used to outlive: AsyncStorage can refuse
        // one write and take the next.
        setFavoritesFailed(false);
      } catch {
        setFavoritesFailed(true);
      }
    },
    [favoriteIds],
  );

  const showEmptyState = !onRoutes && !searching && favoriteStops.length === 0;

  /**
   * The one line that makes a wrong filter recoverable. Computed here rather
   * than inside `SearchNudge` because the answer is needed twice: a nudge
   * reading "1 route matches — switch to Routes" already says the stop search
   * came back empty, so the plain notice must not also be on screen.
   */
  const nudge = nudgeFor({ query, filter, filters: FILTERS, state: search, matches: otherMatches });

  /**
   * One line, ranked — not a stack of notices.
   *
   * The stop list is what this screen is for, so a database problem outranks a
   * favorites one; a rider who cannot search at all does not need to hear about
   * their stars first. The quieter problem is *displaced, not discarded*: its
   * state is still set, so recovering from the database failure brings the
   * favorites notice back rather than leaving the screen claiming all is well.
   */
  const problem =
    failedQueries.size > 0 || search.state === 'failed'
      ? DATABASE_PROBLEM
      : favoritesFailed
        ? FAVORITES_PROBLEM
        : null;

  return (
    // Top, left and right only. The bottom belongs to the tab bar, which React
    // Navigation already insets the scene above — adding `insets.bottom` here
    // as well would pad the list twice.
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, { backgroundColor: palette.background }]}
    >
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={onRoutes ? 'Route number or name' : 'Stop number or name'}
        placeholderTextColor={palette.muted}
        // The label follows the filter, because it is what a rider who cannot
        // see the chips is told the field is for.
        accessibilityLabel={
          onRoutes ? 'Find a route by number or name' : 'Find a stop by number or name'
        }
        style={[styles.search, { color: palette.text, borderColor: palette.border }]}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        inputMode="search"
      />

      <FilterChips filters={FILTERS} selected={filter} onSelect={setFilter} />

      <SearchNudge nudge={nudge} onSwitchFilter={setFilter} />

      {problem === null ? null : (
        <Text style={[styles.notice, { color: palette.warning }]}>{problem}</Text>
      )}

      {feed.state === 'expired' ? (
        <View style={[styles.feedNotice, { borderColor: palette.border }]}>
          <Text style={[styles.feedNoticeText, { color: palette.muted }]}>
            {feedExpiredNotice(feed.endsOn)}
          </Text>
        </View>
      ) : null}

      {search.state === 'running' ? <Busy label={SEARCH_RUNNING} color={palette.muted} /> : null}

      {/*
        Keyed on what is actually on screen, not on what the database returned:
        a saved stop pinned above the results is a match, and "No stops match
        that" over a visible row would be a plain contradiction. Suppressed
        under a nudge, which says the same thing and adds what to do about it.
      */}
      {search.state === 'done' && nudge === null && (onRoutes ? routeResults : visible).length === 0 ? (
        <Text style={[styles.notice, { color: palette.muted }]}>
          {onRoutes ? ROUTES_EMPTY : SEARCH_EMPTY}
        </Text>
      ) : null}

      {/* A blank screen under the Routes chip would read as a search that
          returned nothing, which is exactly the ambiguity §4 forbids. */}
      {onRoutes && !searching ? (
        <Text style={[styles.notice, { color: palette.muted }]}>{ROUTES_PROMPT}</Text>
      ) : null}

      {showEmptyState ? (
        // An empty state, not a blank screen. A rider who opens the app to
        // nothing at all cannot tell "you have saved none" from "something
        // failed", and this tab is empty by default on a first launch.
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>{NO_FAVORITES_TITLE}</Text>
          <Text style={[styles.emptyBody, { color: palette.muted }]}>{NO_FAVORITES_BODY}</Text>
        </View>
      ) : null}

      {onRoutes ? (
        <FlatList
          data={routeResults}
          keyExtractor={(route) => route.route_id}
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode={KEYBOARD_DISMISS_MODE}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <RouteRow route={item} onPress={openRoute} />}
          ListFooterComponent={
            <Text style={[styles.legal, styles.disclaimer, { color: palette.muted }]}>
              {DISCLAIMER}
            </Text>
          }
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(stop) => stop.stop_id}
          // Lifts the list clear of the keyboard as it opens, so the row being
          // typed towards is not the one under the keyboard.
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode={KEYBOARD_DISMISS_MODE}
          // Without this, the first tap on a row while the keyboard is up is
          // swallowed by the dismissal and the rider has to tap twice.
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <StopRow
              stop={item}
              routes={routesByStop.get(item.stop_id) ?? []}
              meters={null}
              isFavorite={isFavorite(favoriteIds, item.stop_id)}
              onToggleFavorite={toggleFavorite}
              onPress={openStop}
              onPressRoute={openRoute}
            />
          )}
          // The disclaimer is required by nothing and can live at the end of the
          // scroll. The legend cannot — see below.
          ListFooterComponent={
            <Text style={[styles.legal, styles.disclaimer, { color: palette.muted }]}>
              {DISCLAIMER}
            </Text>
          }
        />
      )}

      {/*
        Outside the list, so it is on screen whether or not anyone scrolls.
        Truman's idea, and it is the better answer: moving the legend to the
        foot of a scroll traded away the prominence the terms ask for, and a
        sticky footer gives it back without putting legal text above the
        content again. See `lib/Attribution.tsx`.
      */}
      <Attribution />
    </SafeAreaView>
  );
}

/** A spinner is never on its own here — it always says what it is waiting for. */
function Busy({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.busy}>
      <ActivityIndicator />
      <Text style={[styles.notice, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: {
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    fontSize: 16,
  },
  notice: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
  // Boxed rather than another line of loose text: it is about the data behind
  // the whole screen, not about the state of the list under it, and must not be
  // mistaken for either the error line above it or the status lines below.
  feedNotice: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  feedNoticeText: { fontSize: 13, lineHeight: 18 },
  busy: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  empty: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptyBody: { fontSize: 14, lineHeight: 20 },
  legal: { fontSize: 11, lineHeight: 15 },
  disclaimer: { paddingHorizontal: 16, paddingBottom: 14 },
});
