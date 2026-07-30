import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStopQueries } from '../../data/gtfs/db';
import { feedValidity, formatFeedDate } from '../../data/gtfs/feedValidity';
import { useLocation } from './useLocation';
import {
  addFavorite,
  isFavorite,
  loadFavorites,
  removeFavorite,
} from '../../data/storage/favorites';
import { StopRow } from './StopRow';
import type { RouteSummary, Stop } from '../../data/gtfs/types';

/**
 * Required by the data provider's terms and kept as constants so neither can
 * be edited away by accident. The attribution text is verbatim, including the
 * missing full stop. The disclaimer's exact wording is still pending
 * verification against the real user agreement.
 */
export const ATTRIBUTION =
  'Route and arrival data provided by permission of Oahu Transit Services, Inc';
export const DISCLAIMER =
  'This is an unofficial app. Not affiliated with or endorsed by Oahu Transit Services, Inc.';

/**
 * Every message this screen can end on. They are constants, and deliberately
 * worded so that no two states read alike: "nothing is near you" and
 * "the lookup failed" are different facts, and a rider standing at a stop at
 * night has to be able to tell which one they are looking at.
 */
const LOCATING = 'Finding your location…';
const LOCATION_DENIED = 'Location is off, so search for a stop by number or name.';
const LOCATION_FAILED =
  'Could not read your location. Search for a stop by number or name instead.';
const NEARBY_LOADING = 'Looking for stops near you…';
const NEARBY_EMPTY = 'No stops found within walking distance.';
const SEARCH_RUNNING = 'Searching…';
const SEARCH_EMPTY = 'No stops match that.';
const DATABASE_PROBLEM = 'Something went wrong reading the stop list on this device.';
const FAVORITES_PROBLEM = 'Something went wrong reading your saved favorites.';

/**
 * The bundled stop list is reference data with a stated shelf life, and it has
 * passed it. Worded as a fact about the data's age rather than as a fault:
 * nothing is broken, nothing is blocked, and the screen behaves exactly as it
 * did the day before. It reads unlike every other notice here for the same
 * reason those read unlike each other — a rider must be able to tell "this is
 * old" from "this failed" at a glance. Refreshing the feed is Increment 3;
 * saying so out loud is this increment's whole obligation, because reference
 * data that quietly goes stale is the one thing a rider cannot detect.
 */
const feedExpiredNotice = (endsOn: Date): string =>
  `Stop names and locations on this device were published for service through ${formatFeedDate(endsOn)}. A few may have changed since.`;

/** A stop as this screen lists it: distance is present only when known. */
type Listed = Stop & { meters?: number };

/**
 * `waiting` is "no coordinates yet", not "no stops" — collapsing the two is
 * what would make an in-flight lookup and a genuinely empty result render
 * alike. `failed` carries no stops rather than an empty array for the same
 * reason.
 */
type NearbyState =
  | { state: 'waiting' }
  | { state: 'loading' }
  | { state: 'ready'; stops: Listed[] }
  | { state: 'failed' };

/**
 * `running` carries whatever the rider was already looking at — earlier
 * results mid-search, or the favorites-and-nearby list on the first keystroke
 * — so a keystroke never blanks the list out from under a thumb already
 * reaching for a row. The same rule the arrival board follows: a spinner does
 * not replace data that is already good enough to act on. `failed` carries no
 * stops, deliberately: results that could not be fetched are not results.
 */
type SearchState =
  | { state: 'off' }
  | { state: 'running'; stops: Listed[] }
  | { state: 'done'; stops: Listed[] }
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
 * One shared empty list rather than a fresh `[]` per render: the visible list
 * is memoised on the arrays it is built from, and a new identity every render
 * would re-run the route lookup every render.
 */
const NO_STOPS: Listed[] = [];

const keptStops = (search: SearchState): Listed[] =>
  search.state === 'running' || search.state === 'done' ? search.stops : NO_STOPS;

export function HomeScreen() {
  const isDark = useColorScheme() === 'dark';
  const palette = isDark ? dark : light;

  const { nearby, searchByName, searchByCode, routesForStops, stopsByIds, feedEndDate } =
    useStopQueries();
  const location = useLocation();
  const coords = location.coords;

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ state: 'off' });
  const [nearbyState, setNearbyState] = useState<NearbyState>({ state: 'waiting' });
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteStops, setFavoriteStops] = useState<Stop[]>([]);
  const [routesByStop, setRoutesByStop] = useState<Map<string, RouteSummary[]>>(
    new Map(),
  );
  // Reading a bundled asset does not fail transiently: if it fails once it
  // will keep failing, so the notice stays up rather than flickering away on
  // the next query.
  const [problem, setProblem] = useState<string | null>(null);
  // The date the feed itself published as its last valid day, read once: it is
  // baked into the bundled asset and cannot change while the app is running.
  const [feedEnd, setFeedEnd] = useState<string | null>(null);
  // What is on screen right now, so the first keystroke can carry it into the
  // `running` state. A ref rather than a dependency: the search effect must
  // not re-run — and re-debounce — every time the list underneath it changes.
  const onScreen = useRef<Listed[]>(NO_STOPS);

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
    if (coords === null) {
      setNearbyState({ state: 'waiting' });
      return;
    }

    let cancelled = false;
    setNearbyState({ state: 'loading' });
    nearby(coords)
      .then((stops) => {
        if (!cancelled) setNearbyState({ state: 'ready', stops });
      })
      .catch(() => {
        if (cancelled) return;
        setNearbyState({ state: 'failed' });
        setProblem(DATABASE_PROBLEM);
      });

    return () => {
      cancelled = true;
    };
  }, [coords, nearby]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setSearch({ state: 'off' });
      return;
    }

    let cancelled = false;
    // On the first keystroke there is no previous search to carry, so what
    // carries through is the browse list the rider was reading a moment ago.
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
    // Number() is a real conversion and exact on both: React Native returns
    // the id itself, and NodeJS.Timeout converts to its id.
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
    // Resolved from the database, not from nearby results — a favorite must
    // stay visible even when the user is nowhere near it, and must keep the
    // order the rider saved them in.
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

  // Search replaces the list rather than adding to it; with the field empty,
  // favorites sit above whatever is nearby.
  const searching = search.state !== 'off';
  const searchStops = keptStops(search);
  const nearbyStops = nearbyState.state === 'ready' ? nearbyState.stops : NO_STOPS;

  const visible: Listed[] = useMemo(() => {
    if (searching) return searchStops;

    const nearById = new Map(nearbyStops.map((stop) => [stop.stop_id, stop]));
    // A favorite that also happens to be nearby keeps its distance.
    const pinned = favoriteStops.map((stop) => nearById.get(stop.stop_id) ?? stop);
    const rest = nearbyStops.filter((stop) => !favoriteIds.includes(stop.stop_id));
    return [...pinned, ...rest];
  }, [searching, searchStops, nearbyStops, favoriteStops, favoriteIds]);

  // Declared after `visible` so it holds a committed list, and read by the
  // search effect above, which runs first in the same commit and therefore
  // still sees the previous render's list — the one actually on screen when
  // the key was pressed.
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
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

      {search.state === 'off' ? (
        <>
          {location.status === 'idle' ? (
            <Pressable
              accessibilityRole="button"
              onPress={location.request}
              style={[styles.prompt, { borderColor: palette.border }]}
            >
              <Text style={[styles.promptText, { color: palette.text }]}>
                Show stops near you
              </Text>
              <Text style={[styles.promptHint, { color: palette.muted }]}>
                Sorted by walking distance
              </Text>
            </Pressable>
          ) : null}

          {location.status === 'loading' ? (
            <Busy label={LOCATING} color={palette.muted} />
          ) : null}

          {location.status === 'denied' ? (
            <Text style={[styles.notice, { color: palette.muted }]}>
              {LOCATION_DENIED}
            </Text>
          ) : null}

          {location.status === 'error' ? (
            <Text style={[styles.notice, { color: palette.muted }]}>
              {LOCATION_FAILED}
            </Text>
          ) : null}

          {nearbyState.state === 'loading' ? (
            <Busy label={NEARBY_LOADING} color={palette.muted} />
          ) : null}

          {nearbyState.state === 'ready' && nearbyState.stops.length === 0 ? (
            <Text style={[styles.notice, { color: palette.muted }]}>{NEARBY_EMPTY}</Text>
          ) : null}
        </>
      ) : (
        <>
          {search.state === 'running' ? (
            <Busy label={SEARCH_RUNNING} color={palette.muted} />
          ) : null}

          {search.state === 'done' && search.stops.length === 0 ? (
            <Text style={[styles.notice, { color: palette.muted }]}>{SEARCH_EMPTY}</Text>
          ) : null}
        </>
      )}

      <FlatList
        data={visible}
        keyExtractor={(stop) => stop.stop_id}
        renderItem={({ item }) => (
          <StopRow
            stop={item}
            routes={routesByStop.get(item.stop_id) ?? []}
            meters={item.meters ?? null}
            isFavorite={isFavorite(favoriteIds, item.stop_id)}
            onToggleFavorite={toggleFavorite}
          />
        )}
        // At the head of the list, not the foot: the provider's terms ask for
        // prominent display, and under twenty-five rows is not prominent.
        // Scrolling past it afterwards is fine — being seen without hunting
        // is the point.
        ListHeaderComponent={
          <View style={styles.legalBlock}>
            <Text style={[styles.legal, { color: palette.muted }]}>{ATTRIBUTION}</Text>
            <Text style={[styles.legal, { color: palette.muted }]}>{DISCLAIMER}</Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
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

const light = {
  background: '#ffffff',
  text: '#11181c',
  muted: '#687076',
  border: '#e6e8eb',
  warning: '#b3261e',
};

const dark = {
  background: '#101314',
  text: '#ecedee',
  muted: '#9ba1a6',
  border: '#2a2f31',
  warning: '#f2b8b5',
};

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
  prompt: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: 'center',
  },
  promptText: { fontSize: 16, fontWeight: '600' },
  promptHint: { fontSize: 13, marginTop: 2 },
  notice: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
  // Boxed rather than another line of loose text: it is about the data behind
  // the whole screen, not about the state of the list under it, and must not
  // be mistaken for either the error line above it or the status lines below.
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
  legalBlock: { paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  legal: { fontSize: 11, lineHeight: 15 },
});
