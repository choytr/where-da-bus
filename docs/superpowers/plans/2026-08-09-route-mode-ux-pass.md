# Plan — route mode UX pass

Spec: `docs/superpowers/specs/2026-08-09-route-mode-ux-pass.md`. Every decision
is settled there; this is the breakdown, not a second place to argue.

Executed inline, in order. Tasks 1–3 are the zoom tier and depend on each other;
4–6 are independent of them and of each other.

---

## Task 1 — `scaleOf`, and the stop pins tier on it

**Files:** `features/map/labels.ts`, `features/map/StopMarker.tsx`,
`features/map/MapScreen.tsx`, `features/map/__tests__/labels.test.ts`

```ts
// labels.ts
export type MapScale = 'route' | 'street';
export function scaleOf(region: Region | null): MapScale;

// StopMarker.tsx
export type StopMarkerProps = { /* …existing… */ scale: MapScale };
```

`scaleOf` returns `'route'` for a null region and for
`longitudeDelta > MAX_SPAN_FOR_LABELS`; `'street'` otherwise. It reuses that
constant rather than declaring a second one — the spec says why.

`StopMarker` at `'route'`: an 8-pt plain dot in `palette.pin`, no glyph, label
opacity 0. **The `wrap` view stays `SLOT` (34) at both scales** — the tap target
and the marker's centre both hang off it. `scale` joins `selected` and
`placement` in the `tracksViewChanges` effect deps.

`MapScreen` computes `scale` from `camera ?? region` in a `useMemo` alongside
`labelled`, so it too is recomputed only on a settled camera.

**Tests:** `scaleOf` — "is route scale past the label threshold", "is street
scale inside it", "is route scale before the camera has reported".
`StopMarker` — "keeps its 34pt tap target at route scale".

## Task 2 — one labeller core, two callers

**Files:** `features/map/labels.ts`, `features/map/__tests__/labels.test.ts`

```ts
type Labelled = { id: string; lat: number; lon: number; box: { w: number; h: number } };
function placeLabels(items: readonly Labelled[], obstacles: readonly Box[], …): Map<string, LabelPlacement>;

export function labelledStopIds(/* unchanged signature */): Map<string, LabelPlacement>;
export function labelledBusIds(
  buses: readonly BusOnMap[],
  stops: readonly StopWithDistance[],
  region: Region | null,
  viewport: Viewport,
  highlightedNumber: string | null,
): Map<string, LabelPlacement>;
```

`labelledStopIds` keeps its exported signature and its behaviour exactly — every
existing test in `labels.test.ts` must pass untouched, which is the check that
the refactor changed nothing.

Buses claim before stops, so `MapScreen` calls `labelledBusIds` first and passes
its claimed boxes into the stop pass. Bus labels are suppressed entirely at
`'route'` scale, except `highlightedNumber`, which is unconditional the way the
selected stop already is.

**Tests:** "a bus label wins a collision against a stop name", "no bus is
labelled at route scale", "the highlighted bus keeps its label at route scale",
plus the existing suite unchanged.

## Task 3 — `BusMarker` takes its placement and its ring

**Files:** `features/map/BusMarker.tsx`, `features/map/MapScreen.tsx`,
`lib/theme.tsx`, `features/map/__tests__/BusMarker.test.tsx`

```ts
export type Adherence = 'late' | 'early' | 'onTime' | 'unknown';
export function adherenceOf(minutes: number | null): Adherence;

export type BusMarkerProps = { bus; highlighted; placement: LabelPlacement | null };
```

`adherenceOf`: **positive minutes means EARLY.** `null` is `'unknown'`. On time
is `-LATE_MINUTES < m < EARLY_MINUTES`, both named constants. Nothing bounds the
input.

Ring: `palette.late` (amber) / `palette.early` (blue) / `palette.background`
for `onTime` and `unknown`. Two tokens added to both themes.

Label follows `placement` — always mounted, hidden with `opacity`, exactly as
`StopMarker` does it. The `memo` comparator and the `tracksViewChanges` deps
both gain `placement` and the ring colour.

**Tests:** "a positive adherence is early, not late", "an unreported adherence
gets no coloured ring", "a 90 minute value still resolves", "the label is
mounted but transparent when unplaced".

## Task 4 — the bus layer's voice in the route band

**Files:** `features/map/useVehicles.ts`, `features/map/StopSheet.tsx`,
`features/map/MapScreen.tsx`, `features/map/__tests__/StopSheet.test.tsx`

```ts
// useVehicles.ts — a fourth field on VehiclesView
readonly lateCount: number;

// StopSheet.tsx
export type BusLayerState =
  | { kind: 'loading' }
  | { kind: 'running'; count: number; late: number }
  | { kind: 'none' }
  | { kind: 'unreachable' };
export function busLayerWords(state: BusLayerState): string;
export type RouteView = { /* …existing… */ busLayer: BusLayerState };
```

`loading` is "no fleet yet and no failure yet". `MapScreen` stops discarding
`failure`; `unreachable` covers every `ApiFailure` kind, since none of them is
actionable from the map.

The band's second line becomes a row: direction `flex: 1` with
`numberOfLines={1}`, bus state fixed beside it. **The band keeps `height:
PEEK_BAND` and gains no third line.**

**Tests:** "says it is looking before the first fleet arrives", "counts the
buses and the late ones", "says no buses rather than staying silent", "says it
cannot reach TheBus when the fleet fails", "the route band is still PEEK_BAND
tall with the longest state showing".

## Task 5 — the stale age clock

**Files:** `features/map/useVehicles.ts`,
`features/map/__tests__/useVehicles.test.ts`

Reset `now` when the layer becomes active, in the same effect that clears the
fleet on deactivation. Everything else about the tick is unchanged.

**Test:** "ages a fleet against a current clock after a long idle" — mount
inactive, advance well past `AGE_TICK_MS`, activate, and assert a stale vehicle
is filtered out rather than reading `here now`.

## Task 6 — no long press in route mode

**Files:** `features/map/MapScreen.tsx`,
`features/map/__tests__/MapScreen.test.tsx`

`onMapLongPress` returns early when `routeMode !== null`. The comment points at
the `offering` guard rather than restating its reasoning.

**Test:** "a long press in route mode drops no pending marker".

## Task 7 — verify and write down

`npm test`, `npm run test:scripts`, `npm run typecheck`. Fold the three resolved
entries out of `docs/backlog.md`, note what replaced them, and update
`docs/handoff.md`. One push at the end, not per task.

**The one device reading owed:** open a route, do not touch the map, watch the
band's second line. It settles the bus bug either way. See the spec.
