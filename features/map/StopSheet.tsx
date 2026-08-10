import { forwardRef, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  useBottomSheetSpringConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { StopRow } from '../stops/StopRow';
import { StopCard } from './StopCard';
import { RouteList } from './RouteList';
import { PEEK_BAND, PEEK_ROW } from './peek';
import { useTheme } from '../../lib/theme';
import { Attribution, LEGEND_GAP } from '../../lib/Attribution';
import type { RouteSummary, StopWithDistance } from '../../data/gtfs/types';
import type { RouteDirection } from '../../data/gtfs/db';
import type { ApiFailure, Arrival, TheBusClient } from '../../data/thebus';
import type { AnchoredStatus } from './useAnchoredStops';

/**
 * What sits under the map, in a sheet that can be peeked, half-raised or pulled
 * to full height.
 *
 * **Two modes, not one list in two states.** With nothing selected it is the
 * nearby list — the same stops the pins show, never a second set. Select one
 * and the card *replaces* that list, with a back control returning to it. The
 * first shipped version expanded the selected row in place among its
 * neighbours, on the theory that a row visibly growing invites a second tap;
 * on a device it did not, and the middle level of detail was where riders got
 * lost. Apple Maps and Google Maps both push a card, and riders arrive already
 * knowing it.
 *
 * There is no search field in here, deliberately. A text field inside a sheet
 * over a map fights the sheet's own gestures through the keyboard, so search is
 * its own tab — see the increment spec.
 */

/** Peek, medium, full. Medium is where a selected stop's arrivals fit. */
export const PEEK_DETENT = 0;
export const MEDIUM_DETENT = 1;
export const FULL_DETENT = 2;

/**
 * The sheet's own grab handle: `@gorhom/bottom-sheet`'s default handle is 10 pt
 * of padding either side of a 4 pt indicator. Read off its stylesheet rather
 * than guessed.
 */
const HANDLE_HEIGHT = 24;

/** Clear air between the raised sheet and the notch. */
const TOP_GAP = 16;

/** Tuned by eye on a device. Named so the next nudge is a one-line change. */
const MEDIUM_FRACTION = 0.4985;

const NEARBY_HEADING = 'Nearby Stops';

const LEAVE_ROUTE_LABEL = 'Stop showing this route';
const FLIP_LABEL = 'Show the other direction';

/**
 * Where a direction ends up, which is what a rider recognises — the same
 * wording `features/routes/RouteScreen.tsx` uses, and for the same reason.
 * GTFS's `direction_id` is `0` or `1` and never says which is which; the last
 * stop in the sequence is what the sign on the front of the bus says.
 */
export function directionLabel(direction: RouteDirection | null): string {
  const last = direction?.stops[direction.stops.length - 1]?.stop_name;
  return last === undefined ? '' : `Toward ${last}`;
}

/**
 * The three detents, in **points**, against the height of the sheet's own
 * container.
 *
 * **`containerHeight` is measured by `MapScreen`, never derived from the
 * window.** React Navigation's tab scene may or may not be inset above the tab
 * bar, and computing against the window when it *is* inset breaks both ends at
 * once — the peek shows a tab bar's worth of content it meant to hide, and the
 * tallest detent lands under the status bar. `tabBarOverlap` comes from the
 * same measurement, so nothing here has to be right about the navigator.
 *
 * The peek is the handle, one band and one row: `PEEK_BAND` names the mode and
 * `PEEK_ROW` shows something under it. The tallest detent is 90% of the
 * container **or** as tall as it can be while clearing the safe area, whichever
 * is shorter — the cap is what makes the notch unreachable by construction
 * rather than by a fraction that happens to work out on one phone.
 */
export function detentsFor(
  containerHeight: number,
  tabBarOverlap: number,
  topInset: number,
): readonly [number, number, number] {
  const medium = Math.round(containerHeight * MEDIUM_FRACTION);
  const clearsNotch = containerHeight - topInset - TOP_GAP;
  return [
    HANDLE_HEIGHT + PEEK_BAND + PEEK_ROW + tabBarOverlap,
    medium,
    // Never below medium, however small the container or however deep the
    // notch — an ordering violation would make the sheet unsnappable.
    Math.round(Math.max(Math.min(containerHeight * 0.9, clearsNotch), medium + 1)),
  ];
}

/**
 * How much of `containerHeight` the tab bar is drawn over.
 *
 * Zero when React Navigation has already inset the scene above the bar, and the
 * bar's full height when the scene runs underneath it. Both happen, depending
 * on version and options, and the difference is the whole of the bug above — so
 * it is subtracted out of a measurement instead of being decided in advance.
 */
export function tabBarOverlapOf(
  containerHeight: number,
  windowHeight: number,
  tabBarHeight: number,
): number {
  return Math.max(0, Math.min(tabBarHeight, containerHeight - (windowHeight - tabBarHeight)));
}

/**
 * How much of the screen's height is *not* under the sheet at a given detent.
 *
 * Read off the detents themselves rather than written out a second time: the
 * camera framing and the sheet's height must not be able to disagree about how
 * much of the map a rider can see.
 */
export function visibleAbove(
  detents: readonly number[],
  index: number,
  windowHeight: number,
): number {
  const height = detents[index] ?? detents[PEEK_DETENT] ?? 0;
  return 1 - height / windowHeight;
}

const EMPTY_HERE = 'No stops within walking distance of here.';
const FAILED = 'Could not read the stop list on this device.';
const LOADING = 'Looking for stops…';

export type StopSheetProps = {
  stops: StopWithDistance[];
  status: AnchoredStatus;
  routesByStop: Map<string, RouteSummary[]>;
  favoriteIds: string[];
  /** The whole stop, not an id: the card needs its name and distance too. */
  selectedStop: StopWithDistance | null;
  onSelect: (stop: StopWithDistance) => void;
  onBack: () => void;
  onToggleFavorite: (stopId: string) => void;
  onOpenRoute: (route: RouteSummary) => void;
  /**
   * Forwarded to the card, which is the only thing here that asks the network.
   * The sheet passes it through rather than reading `useTheBus()` itself so a
   * test can drive the card with a stub client instead of a real one built
   * from a real key.
   */
  client: TheBusClient;
  /**
   * The detent the sheet has *settled* on, reported as it settles. The screen
   * needs it for two things it cannot ask the sheet about: whether raising to
   * medium would actually be a raise, and whether the map underneath is still
   * visible enough to be worth touching.
   */
  onDetentChange: (index: number) => void;
  /**
   * The three snap heights, in points, from `detentsFor`. Passed in rather
   * than computed here because the peek's height depends on the tab bar, and
   * `useBottomTabBarHeight()` throws outside a navigator — which the sheet's
   * own tests are.
   */
  detents: readonly number[];
  /**
   * How much of the sheet's bottom edge the tab bar is drawn over, from
   * `tabBarOverlapOf` — zero when the scene is already inset above the bar.
   * Only the pinned legend needs it; everything above the legend is clear of
   * the bar by construction.
   */
  tabBarOverlap: number;
  /**
   * The route the map is drawing, or null when it is not in route mode.
   *
   * Passed in rather than read from the store here so this component stays a
   * plain function of its props — the same reason `client` and `detents` are
   * passed — and so the sheet's own tests can drive all three modes without
   * touching module state.
   *
   * Optional because "not in route mode" is the sheet's normal condition and
   * every existing caller and test predates it.
   */
  routeView?: RouteView | null;
  /**
   * Only route mode passes these, and only through to the card: an arrival
   * tapped there highlights the bus already drawn on the map behind the sheet.
   */
  onSelectArrival?: (arrival: Arrival) => void;
  selectedTripId?: string | null;
};

/**
 * What the bus layer is doing, which the map itself cannot say.
 *
 * **Four states that used to be one.** An empty map meant "still fetching",
 * "this route has no buses running" and "the API is unreachable" all at once,
 * and `CLAUDE.md` is explicit that conflating the last two is what makes a
 * transit app untrustworthy at a stop at night. The bus layer was the one place
 * left in the app that did it, because `MapScreen` took `buses` off
 * `useVehicles` and dropped `failure` on the floor.
 */
export type BusLayerState =
  | { kind: 'loading' }
  | { kind: 'running'; count: number; late: number }
  | { kind: 'none' }
  | { kind: 'unreachable' };

/**
 * Which of the four the layer is in, from what `useVehicles` returns.
 *
 * **A pure function, because the order of these tests is the whole correctness
 * and the order is not obvious.** Driving it through `MapScreen` would need a
 * poll and an age-out, which means fake timers in a real-timer suite — the
 * hazard `CLAUDE.md` describes, and one that breaks the *next* test rather than
 * this one. Tested as arithmetic instead, the way `labels.ts` is.
 *
 * Buses in hand come first: a fetch that fails after a good one deliberately
 * leaves the previous fleet drawn and counting up, and the band should describe
 * what the map is showing. Their labels carry the age.
 *
 * **A failure then beats `fetchedAt`, and the other order was a bug.**
 * `fetchedAt` records the last *success* and survives an outage, so testing it
 * first made the band say "No buses running" once the drawn buses aged out — a
 * confident, wrong sentence about a route that may be perfectly busy, and
 * exactly the pair `CLAUDE.md` says must never render alike. `useVehicles`
 * clears `failure` on the next success, so this heals itself.
 *
 * `fetchedAt` then separates a route with genuinely nothing running from a
 * first request still in flight, which an empty list means equally.
 */
export function busLayerFor(
  busCount: number,
  lateCount: number,
  failure: ApiFailure | null,
  fetchedAt: Date | null,
): BusLayerState {
  if (busCount > 0) return { kind: 'running', count: busCount, late: lateCount };
  if (failure !== null) return { kind: 'unreachable' };
  if (fetchedAt !== null) return { kind: 'none' };
  return { kind: 'loading' };
}

/**
 * The line, in as few characters as it can be said in — it shares one line with
 * the direction inside a band that cannot grow. See the render.
 *
 * The late count is dropped when it is zero rather than written as `· 0 late`,
 * which is a sentence about nothing.
 */
export function busLayerWords(state: BusLayerState): string {
  switch (state.kind) {
    case 'loading':
      return 'Looking for buses…';
    case 'running':
      return state.late === 0
        ? `${state.count} ${state.count === 1 ? 'bus' : 'buses'}`
        : `${state.count} ${state.count === 1 ? 'bus' : 'buses'} · ${state.late} late`;
    case 'none':
      return 'No buses running';
    case 'unreachable':
      return "Can't reach TheBus";
  }
}

/** What the sheet needs in order to draw a route, from `MapScreen`. */
export type RouteView = {
  route: RouteSummary | null;
  /** The direction being drawn, already clamped. Null while it is still loading. */
  direction: RouteDirection | null;
  /** Its stops, carrying their distance from the anchor so rows and pins agree. */
  stops: readonly StopWithDistance[];
  /** How many directions the route has. One means no flip control. */
  directionCount: number;
  /** What the live layer is doing. See `BusLayerState`. */
  busLayer: BusLayerState;
  onFlip: () => void;
  onLeave: () => void;
};

export const StopSheet = forwardRef<BottomSheet, StopSheetProps>(function StopSheet(
  {
    stops,
    status,
    routesByStop,
    favoriteIds,
    selectedStop,
    onSelect,
    onBack,
    onToggleFavorite,
    onOpenRoute,
    onDetentChange,
    client,
    detents,
    tabBarOverlap,
    routeView = null,
    onSelectArrival,
    selectedTripId = null,
  },
  ref,
) {
  const { palette } = useTheme();
  // Copied because `snapPoints` is declared mutable, and the detents are shared
  // with the camera framing — which must not be able to write to them.
  const snapPoints = useMemo(() => [...detents], [detents]);

  /**
   * The tab bar is cleared by the pinned legend below the list, not by the list
   * itself, so this is only breathing room under the last row.
   */
  const listContent = useMemo(() => ({ paddingBottom: CONTENT_INSET }), []);

  /** Lifts the pinned legend off whatever the tab bar covers, if anything. */
  const footer = useMemo(() => ({ paddingBottom: tabBarOverlap }), [tabBarOverlap]);

  /**
   * The detent the sheet has settled on, tracked here as well as reported, so
   * the legend below can be left off at the peek.
   *
   * **A fixed-height block in a flex column does not shrink.** Rendering the
   * legend at a peek too short to hold it takes the space from the list, which
   * collapses to nothing. It would also be the resting sheet whose visible
   * content is mostly legal text — see `lib/Attribution.tsx`. A peek presents
   * no Data, so it owes no legend either way.
   */
  const [settled, setSettled] = useState(PEEK_DETENT);
  const handleDetentChange = useCallback(
    (index: number) => {
      setSettled(index);
      onDetentChange(index);
    },
    [onDetentChange],
  );

  /**
   * A ceiling on the content column — **alongside `flex: 1`, not instead of it**.
   *
   * `flex: 1` is the right answer and is kept. `@gorhom/bottom-sheet` gives the
   * children's container a definite height of its own — the sheet's *current*
   * height less the grab handle, animated as the sheet moves — so a `flex: 1`
   * column tracks the sheet exactly, and the legend pinned at its foot stays on
   * screen at every detent. That is the design and this does not replace it.
   *
   * **But that height is only there once the sheet has measured its container.**
   * Until then the library's own style returns no height at all, and `flex: 1`
   * against an unbounded parent bounds nothing: the list sizes to however many
   * rows virtualization has drawn. Measured on a device 2026-08-09 — the route
   * list reported a frame of **2846 pt inside a sheet at most ~730 pt tall**,
   * against 3363 pt of content, so it scrolled 517 pt and stopped dead with the
   * rest unreachable.
   *
   * This is the same family as the bug `08e189d` fixed on 2026-08-08, and it is
   * why that fix never reached the sheet: adding `flex: 1` to six children
   * cannot bound anything when the column above them is unbounded.
   *
   * So the cap. When the library has its height, `flex: 1` wins and this never
   * binds; when it does not, this stops the column running away. It is
   * deliberately a `maxHeight` rather than a `height` — a fixed height would
   * pin the column to the *tallest* detent at every detent, pushing the legend
   * below the visible sheet at medium.
   */
  const maxContentHeight = Math.max(0, (detents[FULL_DETENT] ?? 0) - HANDLE_HEIGHT);

  const animationConfigs = useBottomSheetSpringConfigs({
    damping: 90,
    stiffness: 650,
    mass: 0.70,
    overshootClamping: true,
  });

  /**
   * Dims the map only at full height, where it is a sliver nobody is reading,
   * and a press on it drops back to medium rather than closing — the sheet has
   * no closed state to drop to. Below full height the map stays undimmed and
   * live, which is the whole reason for a sheet rather than a screen.
   */
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={FULL_DETENT}
        disappearsOnIndex={MEDIUM_DETENT}
        pressBehavior={MEDIUM_DETENT}
      />
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: StopWithDistance }) => (
      <StopRow
        stop={item}
        routes={routesByStop.get(item.stop_id) ?? []}
        meters={item.meters}
        isFavorite={favoriteIds.includes(item.stop_id)}
        onToggleFavorite={onToggleFavorite}
        // Not `onPress={onSelect}`: the row knows its stop only as a `Stop`,
        // and the card needs the distance that came with it.
        onPress={() => onSelect(item)}
        onPressRoute={onOpenRoute}
      />
    ),
    [routesByStop, favoriteIds, onSelect, onToggleFavorite, onOpenRoute],
  );

  return (
    <BottomSheet
      ref={ref}
      index={0}
      enableDynamicSizing={false}
      snapPoints={snapPoints}
      enablePanDownToClose={false}
      backgroundStyle={{ backgroundColor: palette.background }}
      handleIndicatorStyle={{ backgroundColor: palette.muted }}
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      onChange={handleDetentChange}
    >
      {/*
        A column, so the legend can be pinned under whichever mode is showing
        rather than living at the foot of each one's scroll. Both modes are
        `flex: 1` above it.
      */}
      <View testID="sheet-content" style={[styles.fill, { maxHeight: maxContentHeight }]}>
        {selectedStop !== null ? null : routeView !== null ? (
          <>
            {/*
              Exactly `PEEK_BAND` tall like the other two bands, or the resting
              sheet changes height the moment a route is picked and reads as a
              twitch. Everything in it therefore has to fit on one line.
            */}
            <View testID="route-band" style={[styles.band, styles.bandRow, { borderBottomColor: palette.border }]}>
              <View style={styles.bandMain}>
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  style={[styles.heading, { color: palette.text }]}
                >
                  {routeView.route === null ? 'Route' : `Route ${routeView.route.short_name}`}
                </Text>
                {/*
                  **One line, shared, and the band cannot grow to give them
                  two.** `PEEK_BAND` is 44 points and all three sheet modes must
                  match at the top or the resting sheet twitches the moment a
                  route is picked; it already spends that on the heading and
                  this line.

                  So the direction flexes and truncates while the bus state is
                  fixed and never does. That way round because the direction is
                  recoverable — it names the last stop in the list directly
                  underneath — while a truncated `Can't reach TheB…` is not.

                  Stated as a relationship rather than as measured widths on
                  purpose: there is no device on this side, so a design that
                  needed a string's rendered width to be right would be a design
                  that had to be guessed at.
                */}
                <View style={styles.bandMetaRow}>
                  {directionLabel(routeView.direction) === '' ? null : (
                    <>
                      <Text
                        numberOfLines={1}
                        style={[styles.bandMeta, styles.bandDirection, { color: palette.muted }]}
                      >
                        {directionLabel(routeView.direction)}
                      </Text>
                      {/* Its own element so the state reads alone to VoiceOver. */}
                      <Text style={[styles.bandMeta, { color: palette.muted }]}>{' · '}</Text>
                    </>
                  )}
                  <Text
                    testID="bus-layer-state"
                    numberOfLines={1}
                    style={[
                      styles.bandMeta,
                      {
                        color:
                          routeView.busLayer.kind === 'unreachable'
                            ? palette.warning
                            : palette.muted,
                      },
                    ]}
                  >
                    {busLayerWords(routeView.busLayer)}
                  </Text>
                </View>
              </View>

              {/*
                Hidden when there is nothing to flip to. A control that does
                nothing is worse than an absent one, and 34 of Oahu's routes run
                in a single direction.
              */}
              {routeView.directionCount > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={FLIP_LABEL}
                  onPress={routeView.onFlip}
                  style={[styles.bandButton, { borderColor: palette.border }]}
                >
                  <Text style={[styles.bandGlyph, { color: palette.text }]}>⇄</Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={LEAVE_ROUTE_LABEL}
                onPress={routeView.onLeave}
                style={[styles.bandButton, { borderColor: palette.border }]}
              >
                <Text style={[styles.bandGlyph, { color: palette.text }]}>✕</Text>
              </Pressable>
            </View>

            <RouteList
              stops={routeView.stops}
              selectedStopId={null}
              onSelect={onSelect}
            />
          </>
        ) : (
          <>
            {/*
              Outside the scroll, so it is still there at the peek and does not
              slide away under a thumb. Exactly `PEEK_BAND` tall, which is what
              keeps the resting sheet the same height in both modes.
            */}
            <View testID="nearby-band" style={[styles.band, { borderBottomColor: palette.border }]}>
              <Text
                accessibilityRole="header"
                style={[styles.heading, { color: palette.text }]}
              >
                {NEARBY_HEADING}
              </Text>
            </View>

            <BottomSheetFlatList
              testID="nearby-stops"
              // Explicit, because it is now a sibling of the legend rather than the
              // sheet's only child: without it the list sizes to its content and
              // pushes the legend out of the sheet entirely.
              style={styles.fill}
              data={stops}
              keyExtractor={(stop) => stop.stop_id}
              renderItem={renderItem}
              contentContainerStyle={listContent}
              ListEmptyComponent={
                // Three states kept apart, as §4 requires: still looking, looked and
                // found nothing here, and could not look at all.
                <View style={styles.empty}>
                  {status === 'loading' ? (
                    <Text style={[styles.emptyText, { color: palette.muted }]}>{LOADING}</Text>
                  ) : null}
                  {status === 'empty' ? (
                    <Text style={[styles.emptyText, { color: palette.muted }]}>{EMPTY_HERE}</Text>
                  ) : null}
                  {status === 'failed' ? (
                    <Text style={[styles.emptyText, { color: palette.warning }]}>{FAILED}</Text>
                  ) : null}
                </View>
              }
            />
          </>
        )}

        {/*
          Mounted only while a stop is selected, which is what keeps exactly one
          arrivals poll running: unmounting tears down useArrivals' fetch and its
          60-second timer with it, so changing selection cannot leave the
          previous stop polling in the background.

          The back control names what it goes back *to*, which in route mode is
          the route's own stop list rather than the nearby one.
        */}
        {selectedStop === null ? null : (
          <StopCard
            stop={selectedStop}
            meters={selectedStop.meters}
            routes={routesByStop.get(selectedStop.stop_id) ?? []}
            isFavorite={favoriteIds.includes(selectedStop.stop_id)}
            backLabel={
              routeView?.route == null ? undefined : `‹ Route ${routeView.route.short_name}`
            }
            onBack={onBack}
            onToggleFavorite={onToggleFavorite}
            onPressRoute={onOpenRoute}
            client={client}
            onSelectArrival={onSelectArrival}
            selectedTripId={selectedTripId}
          />
        )}

        {/*
          Pinned under the content, not at the foot of its scroll — the same
          placement the stop list, the arrival board and route detail already
          use, so the legend is on screen from the first frame at every detent
          that shows any Data. `lib/Attribution.tsx` carries the reading of the
          terms behind that, and why the sheet stopped being the exception.

          Not at the peek: see `settled` above.
        */}
        {settled === PEEK_DETENT ? null : (
          <View testID="sheet-attribution" style={[styles.legend, footer]}>
            <Attribution />
          </View>
        )}
      </View>
    </BottomSheet>
  );
});

/** Breathing room under the last row. The tab bar is the legend's to clear. */
const CONTENT_INSET = LEGEND_GAP;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /**
   * The band the peek shows. Fixed height and no shrink, because the whole
   * point is that it is exactly as tall as the card's own band — see
   * `PEEK_BAND` and `StopCard`.
   */
  band: {
    height: PEEK_BAND,
    justifyContent: 'center',
    paddingHorizontal: 16,
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heading: { fontSize: 17, fontWeight: '700' },
  /** The route band packs a title, a direction and two controls onto one line. */
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandMain: { flex: 1 },
  bandMeta: { fontSize: 12, marginTop: 1 },
  /** The direction and the bus state, sharing the band's one spare line. */
  bandMetaRow: { flexDirection: 'row', alignItems: 'baseline' },
  /** Flexes, so it is the one that truncates. `flexShrink` is not enough on its
   *  own here — without a basis of zero a long headsign pushes the state off. */
  bandDirection: { flexShrink: 1 },
  bandButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandGlyph: { fontSize: 15, lineHeight: 18 },
  /** Never squeezed by the list above it, and never squeezing it either. */
  legend: { flexShrink: 0 },
  empty: { paddingHorizontal: 16, paddingTop: 8 },
  emptyText: { fontSize: 14, lineHeight: 20 },
});
