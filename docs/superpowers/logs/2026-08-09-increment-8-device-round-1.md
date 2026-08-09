# Increment 8 — device round 1

Build: `gh run 31330482911`, off `dev` at Task 4. **Route mode and the route
line only — no live buses in this build**, deliberately, so the wholesale pin
swap and the polyline mounting are not confounded with the sixty-second bus
churn.

Reported by Truman 2026-08-09 from an `.ipa` on his phone, with one screenshot
(Route 10 in Kapālama, sheet at the resting peek). **Transcribed here
immediately: images do not survive a context compaction and text does.**

Mark each line **observed** or **inferred**.

---

## What the screenshot settles — observed

- **The route line follows real roads.** Route 10 traces Alewa Heights' switchbacks
  up and around, not a straight line between stops. This is the thing the whole
  shapes measurement existed to buy, and it is the first time it has been seen.
- **The pin set swaps to the route's stops**, and the map stayed up — no crash on
  the tree change that has a SIGABRT behind it. Not proof it is gone; one
  sighting.
- **The sheet's route band renders as designed**: `Route 10` over
  *Toward AUIKI ST + OPP MOKAUEA ST*, with ⇄ and ✕ on one line, at the peek.
- **The route's stop list is numbered and in order** — `1 ALEWA DR + NA PUEO MINI
  PARK`, `2 HOOMAIKAI ST + ALEWA DR`.
- **No crash and no marker teleporting** across the pin swap in this session.

## Truman's verdict — observed

> "it's... aight? the ux is fine."

Three findings.

1. **The line should be red, not blue.** Requested directly. It is currently
   `palette.pin`, the same colour as the stops.
2. **Stop pins cover the line.** *"it's also easy for the stop pins to completely
   cover the line but we should just accept that and move on."* Visible in the
   screenshot: on the dense stretch through Alewa Heights the pins are almost
   continuous and the line is only visible between them. **Accepted, not to be
   fixed.** → `docs/backlog.md`.
3. **Scrolling is broken in the sheet, and only there.** *"the scrolling is
   broken only in the sheet, for all lists i could get to."* Every other list in
   the app scrolls.

## The scrolling finding — what is and is not established

**Established, from his report plus the code — not from reading a library:** the
three lists that do not scroll are exactly the three
`@gorhom/bottom-sheet` scrollables, and the four that do scroll are exactly the
four plain React Native ones.

| Does not scroll | Scrolls |
|---|---|
| `StopSheet` nearby — `BottomSheetFlatList` | `RouteScreen` — `SectionList` |
| `RouteList` — `BottomSheetFlatList` | `ArrivalsScreen` — `SectionList` |
| `StopCard` arrivals — `BottomSheetSectionList` | `ResultList` — `FlatList` |
| | `StopsScreen` — `FlatList` |

**This clears `flex: 1` of suspicion.** All seven carry it; four work. Whatever
this is, it lives in the sheet's scrollable integration and not in the fix six
of those lists received on 2026-08-09.

**Not established, and not to be guessed at:** whether the sheet reaches its
tallest detent at all. `@gorhom/bottom-sheet` only lets an inner list scroll once
the sheet is at its **highest** snap point — below that, a drag on the content
raises the sheet instead, by design. So "the list will not scroll" and "the sheet
will not reach full height" produce the same symptom under a thumb, and they are
different bugs with different fixes.

This is exactly the split section 1 of
`docs/superpowers/logs/2026-08-09-increment-7-device-round.md` was written to
catch, and its caveat — that the device round was recorded only collectively —
is what made it survivable. **Six of that section's seven lines were changed on
the strength of one report and confirmed on none.**

**Do not reason about which it is from `@gorhom/bottom-sheet`'s source.** That is
the mistake this project has now made six times, most recently about the tab bar
insetting the map scene. The discriminating question is one gesture on a device
and it has been put to Truman:

- Drag the sheet all the way to the top first, then try to scroll the list.
  - Scrolls → the library behaving as designed, and the fix is about reaching
    full height, not about the list.
  - Still will not scroll → the list itself, and `flex: 1` is not the cause since
    every list outside the sheet has the same treatment and works.

## Truman's answer, and what it eliminated

> "It already is at the top, but it won't scroll, just like before. Interestingly
> it's fine in Expo Go right now, but the build you made is broken."

**Observed.** So the sheet does reach its tallest detent, and the list still will
not move. And the decisive fact: **same JavaScript, different native layer.**

Four causes eliminated on that axis, each with evidence rather than argument:

| Candidate | Evidence | Verdict |
|---|---|---|
| JS/native version mismatch, which Expo Go masks because it ships its own native modules and only runs your JS | `npx expo install --check` → *Dependencies are up to date* | Eliminated |
| New Architecture differing between Expo Go and the prebuild | `npx expo prebuild --clean` writes no `newArchEnabled` to `ios/Podfile.properties.json`, so both take the SDK default | Eliminated |
| The Reanimated/worklets babel plugin not running in a release bundle — plausible, since this project has **no `babel.config.js` at all** | `npx expo export --platform ios` then `strings` the Hermes bundle: `__workletHash` and `__initData` are both present | Eliminated |
| `flex: 1`, the fix six lists received on 2026-08-09 | All seven lists carry it; the four outside the sheet scroll | Eliminated |

**Root cause not yet found, and not guessed at.** Note that `/ios` is prebuild
output and was deleted again after being read; `expo prebuild` also adds `ios`
and `android` scripts to `package.json`, which were reverted.

## The measurement round 2 carries

`docs/backlog.md` on the last scroll bug that misled four investigations:
*"measure — log `contentInset` from the `onScroll` payload against the list's
`onLayout` frame — rather than read."* That is what `features/map/scrollProbe.ts`
does, temporarily, on the route's stop list only.

One muted line above the list reads `frame N · content M · …`. What it settles:

- **`content > frame`** — the frame is right and the gesture is being swallowed
  somewhere between the sheet's pan and the list's scroll.
- **`content == frame`** — the list has been handed an unbounded height, has laid
  every row out inside its own frame, and genuinely has nothing to scroll. That
  is the failure Increment 7's checklist described in advance: *"announces itself
  as scrollable and then will not move."*

**Delete `scrollProbe.ts` and its call site once the number is in.**
`SHOW_SCROLL_PROBE` is the single switch.

## Not in this build, so not tested

- Live buses on the route (Task 6) and the arrival→bus highlight (Task 7).
- Those are device round 2, which needs a fresh build.
