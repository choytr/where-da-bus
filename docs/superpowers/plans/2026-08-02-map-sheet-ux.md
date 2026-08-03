# Plan — the map sheet's UX

Contracts, not code. Spec:
`../specs/2026-08-02-increment-3-map.md`, the **Revision** section.

Executed **inline**, in order, on `dev`. Review once at the end, on the whole
diff. Device-verify before asking to merge.

Every `render`/`renderHook`/`rerender`/`unmount` is awaited — see `CLAUDE.md`.
No type assertions; where a seam here would need one, the seam is drawn
differently instead (task 1 is the case in point).

**No new dependencies.** The callout, the backdrop and the settled-index
callback all exist in `react-native-maps@1.20.1` and
`@gorhom/bottom-sheet@5.2.14` as installed. Verified 2026-08-02:
`BackdropPressBehavior` accepts a snap index as a number, and `onChange` reports
the settled index.

---

## 1. Extract the arrival board from its screen

- `features/arrivals/board.ts` (new), `features/arrivals/BoardHeader.tsx` (new),
  `features/arrivals/ArrivalsScreen.tsx` (host), existing tests unchanged
- `useArrivalBoard(stopCode: string, client?: TheBusClient)` returns
  `{ sections, board, failure, fetchedAt, loading, refreshing, refresh, now }` —
  the §4 state model and `sectionsByDirection`, lifted verbatim
- `<BoardHeader stopName={…} stopCode={…} fetchedAt={…} failure={…} now={…} />`
  — attribution, name, code, age line, stale-times banner
- **Two hosts render their own list; neither is passed one.** A shared
  component taking `List: ComponentType<SectionListProps<…>>` cannot accept
  `BottomSheetSectionList` without an assertion, and this project forbids those.
  Composition sidesteps it rather than fighting it.
- `client` stays optional-with-default, matching `ArrivalsScreen` — which also
  closes the backlog's *"`ExpandedStopRow` takes no client argument"*
- Pure refactor: `ArrivalsScreen.test.tsx` passes **unmodified**, and that is the
  task's own verification

## 2. The sheet's detail card

- `features/map/StopCard.tsx` (new), `features/map/__tests__/StopCard.test.tsx`
- `<StopCard stop={} meters={} routes={} isFavorite={} onBack={} onToggleFavorite={} onPressRoute={} />`
- Renders `BoardHeader` + `BottomSheetSectionList` over `useArrivalBoard`'s
  sections, with a `‹ Nearby` back control and the star in its header
- **No `refreshControl`.** Spec's Revision says why; the 60-second poll stands
- Tests: `shows the stop name and code`; `renders arrivals grouped by
  direction`; `distinguishes no buses from unreachable`; `calls onBack from the
  back control`; `keeps stale times visible when a refresh fails`

## 3. `StopSheet` becomes two modes

- `features/map/StopSheet.tsx`, `features/map/ExpandedStopRow.tsx` (**deleted**)
- `selectedStop: StopWithDistance | null` replaces `selectedId`; `onBack: () => void` added
- Renders `StopCard` when a stop is selected, the `BottomSheetFlatList` when not
- Rewrite the header comment — *"one list in two states, not two modes"* is now
  exactly backwards
- Tests: `shows the nearby list when nothing is selected`; `replaces the list
  with the card when a stop is selected`; `returns to the list from the card`

## 4. Detents, and locking the map at full height

- `features/map/MapScreen.tsx`, `features/map/StopSheet.tsx`
- `select` snaps to `MEDIUM_DETENT` **only when the settled index is below it** —
  never lowers. Fixes the device finding directly.
- `select` also stops toggling. It sets; it never clears. A pin tap means
  *select this*, so a mis-aimed tap on the already-selected pin cannot close the
  card being read — dismissal is the back control and the map tap, both of which
  say what they do.
- Track the settled index through `BottomSheet`'s `onChange`; at index 2 wrap
  `MapView` in a `View` with `pointerEvents="none"`
- `BottomSheetBackdrop` with `appearsOnIndex={2} disappearsOnIndex={1}
  pressBehavior={1}` — dims only at full height, and a press drops to medium
- Tests: `does not lower the sheet when a stop is selected at full height`;
  `raises the sheet to medium when a stop is selected from peek`; `stops the map
  receiving touches at full height`

## 5. Anchor gestures: long-press and *Search this area*

- `features/map/MapScreen.tsx`, `features/map/useAnchoredStops.ts`
- `onPress` no longer calls `setAnchor`. It clears the selection, and the
  pending long-press marker, and does nothing else.
- `onLongPress` stores a pending coordinate; a `Marker` at it shows a `Callout`
  reading **Search here** via the marker ref's `showCallout()`. Only the
  callout's press calls `setAnchor`.
- Track the camera through `onRegionChangeComplete`; show a *Search this area*
  control once the centre is further from the anchor than **25% of the visible
  width**. Re-anchors to screen centre and hides itself.
- The threshold is a guess to be tuned on a device, and is a named constant so
  that is a one-line change
- Tests: `a tap on the map does not move the anchor`; `a tap on the map clears
  the selection`; `a long press does not query until the callout is pressed`;
  `offers to search this area once the camera has moved away`

## 6. The camera rule, stated rather than emergent

- `features/map/MapScreen.tsx`, `features/map/region.ts`,
  `features/map/__tests__/region.test.ts`
- **Delete the `useEffect` on `[region]`.** It is the mechanism that makes every
  anchor change move the camera, which is precisely what must stop.
- Animate imperatively from ⌖ and from the first location fix, and nowhere else
- `regionAround(center, radiusMetres, visibleFraction = 1)` — shifts the centre
  south and widens the span so the radius lands in the strip above the sheet.
  Pure arithmetic, so it is tested rather than inferred.
- `mapPadding` set from the settled detent as well — **not** as the centring
  mechanism. On Apple Maps `AIRMap.m:645` assigns it to `layoutMargins`, which
  positions the compass and the legal label; MapKit's own inset path is
  `setVisibleMapRect:edgePadding:`, which this prop never reaches. Keeping
  Apple's legal label out from under the sheet is the reason it is set at all.
- Tests: `frames the radius above the sheet when part of the screen is covered`;
  `is unchanged when nothing is covered`; `selecting a stop does not move the
  camera`; `re-anchoring does not move the camera`

## 7. Location: ask when the map is ready, and stay recoverable

- `features/stops/useLocation.ts`, `features/map/useAnchoredStops.ts`,
  `features/map/MapScreen.tsx`, and their suites
- `MapView`'s `onMapReady` calls `request()` once, when status is `'idle'`
- `recentre()` **always** takes a fresh fix when permission is granted — the
  cached one is why ⌖ returned a rider to where they boarded
- ⌖ shows a busy state while the fix is in flight
- `'denied'` → ⌖ calls `Linking.openSettings()` (expo-linking, already a
  dependency) and the banner says location is off and can be turned on there.
  `'error'` → ⌖ retries. Closes the backlog's *"`error` is terminal"*.
- Tests: `asks for location once the map is ready`; `does not ask again after a
  denial`; `takes a fresh fix on every recentre`; `opens Settings when location
  was denied`; `retries after a location error`

## 8. Close what this supersedes

- `docs/backlog.md` — close the four *Increment 3 — deferred* entries this
  fixes (sheet drops to half; selection doesn't feel like selection; the
  expanded row's tap target; the map doesn't open on the rider), plus
  *`error` is terminal* and *`ExpandedStopRow` takes no client argument*.
- **Correct the `mapPadding` entry rather than closing it.** It states the prop
  is the mechanism for centring; on Apple Maps it is not. Record the reading of
  `AIRMap.m` and that it is a reading.
- `docs/handoff.md` — what to pick up next
- Not closed: the unexplained crash. Nothing here addresses it.

---

## Verification

`npm test`, `npm run test:scripts`, `npm run typecheck`. Then an `.ipa`:
`gh workflow run ios-ipa.yml --ref dev`.

Three things only a device can answer, and they are the reason for the build:

1. **Does the 45% detent show five or six arrival rows?** The claim is
   arithmetic off an assumed screen height. If it shows two, task 2's card is
   the wrong size and the detent needs raising.
2. **Does a long-press callout appear where the finger was**, or does the map
   pan under it first?
3. **Is 25% of the visible width the right drift threshold** for *Search this
   area* — does it appear too eagerly while reading, or too late to be found?

---

## What was built, and where it departed from the above

All eight tasks landed inline on `dev`, 2026-08-02. 277 Jest, 70 `node --test`,
clean typecheck. **Not device-verified** — that is the three questions above.

Six departures, each because writing it revealed something the contract did not
know:

1. **`useArrivalBoard` returns a ninth field, `tick`.** The contract listed
   `now`, and `now` is the *server-shifted* clock the countdowns need. The age
   line cannot use it: `fetchedAt` is a device timestamp, so `now - fetchedAt`
   counts the clock offset twice and a device four minutes fast reports every
   board as four minutes stale. `BoardHeader`'s `now` prop is therefore passed
   `tick` by both hosts, and says so.
2. **`BoardHeader` renders its stale banner only when `fetchedAt !== null`.**
   Without the guard, the card's "could not reach the service, nothing ever
   arrived" state also claims to be "showing the last times received" — there
   are none. `ArrivalsScreen` never hit this because it early-returns first.
3. **The drift arithmetic went into `region.ts`, not `MapScreen.tsx`.**
   `hasDriftedFrom` and `visibleWidthMetres` are pure and are unit-tested;
   `MapScreen` keeps only `DRIFT_FRACTION`. Same reasoning task 6 gives for
   centring by arithmetic.
4. **`useLocation`'s `request()` now returns the fix**, and `useAnchoredStops`
   gained `requestLocation` alongside `recentre`. ⌖ has to move the camera
   onto *this* fix; watching state for a change and guessing whether it was
   yours is the version that goes wrong when two things ask at once.
5. **`StopCard` has a *Try again* button.** No `refreshControl`, as specified —
   the gesture conflict is real — but a button has no gesture to conflict with,
   and 60 seconds is a long time to look at a failure you cannot retry.
6. **`StopSheet.test.tsx` is new, and `MapScreen.test.tsx`'s two doubles were
   rewritten.** The sheet's height and the camera are now behaviour, and the
   shipped `@gorhom/bottom-sheet/mock` swallows `onChange` and `snapToIndex`
   while `react-native-maps` was doubled as a function component with no ref.
   Both doubles now expose what they are asked to do.
