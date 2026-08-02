import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  loadFavorites,
  removeFavorite,
} from '../../data/storage/favorites';
import { StopRow } from './StopRow';
import type { RouteSummary, Stop } from '../../data/gtfs/types';
import { ATTRIBUTION, DISCLAIMER } from '../../lib/legal';
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

/**
 * `running` carries whatever the rider was already looking at, so a keystroke
 * never blanks the list out from under a thumb already reaching for a row —
 * the same rule the arrival board follows. `failed` carries no stops,
 * deliberately: results that could not be fetched are not results.
 */
type SearchState =
  | { state: 'off' }
  | { state: 'running'; stops: Stop[] }
  | { state: 'done'; stops: Stop[] }
  | { state: 'failed' };

/**
 * How long typing has to pause before the database is asked anything. A query
 * per keystroke is a query storm on the native bridge — none of which can be
 * called back once queued — for results nobody reads, since the rider is still
 * typing. Short enough to feel immediate at the end of a word.
 */
const SEARCH_DEBOUNCE_MS = 175;

/** Digits only means the rider typed the number printed on the pole. */
const isNumericQuery = (value: string): boolean => /^\d+$/.test(value.trim());

/**
 * One shared empty list rather than a fresh `[]` per render, so the effects
 * keyed on the visible list do not re-run every render.
 */
const NO_STOPS: Stop[] = [];

const keptStops = (search: SearchState): Stop[] =>
  search.state === 'running' || search.state === 'done' ? search.stops : NO_STOPS;

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
  const { searchByName, searchByCode, routesForStops, stopsByIds, feedEndDate } =
    useStopQueries();

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ state: 'off' });
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteStops, setFavoriteStops] = useState<Stop[]>([]);
  const [routesByStop, setRoutesByStop] = useState<Map<string, RouteSummary[]>>(new Map());

  // Reading a bundled asset does not fail transiently: if it fails once it will
  // keep failing, so the notice stays up rather than flickering away on the
  // next query.
  const [problem, setProblem] = useState<string | null>(null);
  // Read once: baked into the bundled asset, and it cannot change while the app
  // is running.
  const [feedEnd, setFeedEnd] = useState<string | null>(null);
  // What is on screen right now, so the first keystroke can carry it into the
  // `running` state. A ref rather than a dependency: the search effect must not
  // re-run — and re-debounce — every time the list underneath it changes.
  const onScreen = useRef<Stop[]>(NO_STOPS);

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

  useEffect(() => {
    let cancelled = false;
    feedEndDate()
      .then((date) => {
        if (!cancelled) setFeedEnd(date);
      })
      .catch(() => {
        if (!cancelled) setProblem(DATABASE_PROBLEM);
      });
    return () => {
      cancelled = true;
    };
  }, [feedEndDate]);

  useEffect(() => {
    let cancelled = false;
    loadFavorites()
      .then((ids) => {
        if (!cancelled) setFavoriteIds(ids);
      })
      .catch(() => {
        if (!cancelled) setProblem(FAVORITES_PROBLEM);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setSearch({ state: 'off' });
      return;
    }

    let cancelled = false;
    // On the first keystroke there is no previous search to carry, so what
    // carries through is the favorites list the rider was reading a moment ago.
    setSearch((previous) => ({
      state: 'running',
      stops: previous.state === 'off' ? onScreen.current : keptStops(previous),
    }));

    const run = async () => {
      if (isNumericQuery(trimmed)) {
        const stop = await searchByCode(trimmed);
        if (!cancelled) setSearch({ state: 'done', stops: stop === null ? [] : [stop] });
        return;
      }
      const found = await searchByName(trimmed);
      if (!cancelled) setSearch({ state: 'done', stops: found });
    };

    // React Native's setTimeout hands back a plain numeric id, but @types/node
    // is in this program (see tsconfig) and its ambient overload — returning
    // NodeJS.Timeout — wins, so the handle is converted rather than declared.
    // Number() is a real conversion and exact on both: React Native returns the
    // id itself, and NodeJS.Timeout converts to its id.
    const handle: number = Number(
      setTimeout(() => {
        run().catch(() => {
          if (cancelled) return;
          setSearch({ state: 'failed' });
          setProblem(DATABASE_PROBLEM);
        });
      }, SEARCH_DEBOUNCE_MS),
    );

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, searchByCode, searchByName]);

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
      })
      .catch(() => {
        if (!cancelled) setProblem(DATABASE_PROBLEM);
      });

    return () => {
      cancelled = true;
    };
  }, [favoriteIds, stopsByIds]);

  // Compared against the clock at render rather than once at mount, so an app
  // left open across the expiry date starts saying so on the next redraw.
  const feed = feedValidity(feedEnd, new Date());

  // Search replaces the list rather than adding to it. With the field empty,
  // favorites are the list.
  const searching = search.state !== 'off';
  const searchStops = keptStops(search);

  /**
   * Matching favorites are pinned above the rest of the results, in the order
   * they were saved. Searching for a stop you have already starred is one of
   * the two things this tab is for, and leaving it to sort in among strangers
   * — or off the end of the result limit entirely — makes the star pointless.
   *
   * A favorite that is also a result appears once, at the top, not twice.
   */
  const visible: Stop[] = useMemo(() => {
    if (!searching) return favoriteStops;

    const pinned = favoriteStops.filter((stop) => favoriteMatches(stop, query));
    if (pinned.length === 0) return searchStops;

    const pinnedIds = new Set(pinned.map((stop) => stop.stop_id));
    return [...pinned, ...searchStops.filter((stop) => !pinnedIds.has(stop.stop_id))];
  }, [searching, searchStops, favoriteStops, query]);

  // Holds a committed list, and is read by the search effect above — which runs
  // first in the same commit and therefore still sees the previous render's
  // list, the one actually on screen when the key was pressed.
  useEffect(() => {
    onScreen.current = visible;
  }, [visible]);

  useEffect(() => {
    const ids = visible.map((stop) => stop.stop_id);
    if (ids.length === 0) return;

    let cancelled = false;
    routesForStops(ids)
      .then((routes) => {
        if (!cancelled) setRoutesByStop(routes);
      })
      .catch(() => {
        if (!cancelled) setProblem(DATABASE_PROBLEM);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, routesForStops]);

  const toggleFavorite = useCallback(
    async (stopId: string) => {
      try {
        const next = favoriteIds.includes(stopId)
          ? await removeFavorite(stopId)
          : await addFavorite(stopId);
        setFavoriteIds(next);
      } catch {
        setProblem(FAVORITES_PROBLEM);
      }
    },
    [favoriteIds],
  );

  const showEmptyState = !searching && favoriteStops.length === 0;

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
        placeholder="Stop number or name"
        placeholderTextColor={palette.muted}
        accessibilityLabel="Find a stop by number or name"
        style={[styles.search, { color: palette.text, borderColor: palette.border }]}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        inputMode="search"
      />

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
        that" over a visible row would be a plain contradiction.
      */}
      {search.state === 'done' && visible.length === 0 ? (
        <Text style={[styles.notice, { color: palette.muted }]}>{SEARCH_EMPTY}</Text>
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
        // At the head of the list, not the foot: the provider's terms ask for
        // prominent display, and under twenty-five rows is not prominent.
        // Scrolling past it afterwards is fine — being seen without hunting is
        // the point.
        ListHeaderComponent={
          <View style={styles.legalBlock}>
            <Text style={[styles.legal, { color: palette.muted }]}>{ATTRIBUTION}</Text>
            <Text style={[styles.legal, { color: palette.muted }]}>{DISCLAIMER}</Text>
          </View>
        }
      />
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
  legalBlock: { paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  legal: { fontSize: 11, lineHeight: 15 },
});
