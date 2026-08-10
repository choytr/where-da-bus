# Increment 8 — device round 2

Build: `gh run 31338851094`, off `dev` at `c61d131`. Sideload per
`docs/sideloading.md`.

**This is the first `.ipa` the project has ever properly checked.** Increment 7's
round was recorded as passed and never run — see the retraction at the foot of
`2026-08-09-increment-7-device-round.md` — so everything that file still owes is
folded in here rather than left to rot in a file marked done.

**Mark each line `observed` or `inferred`, and say which.** Anything not written
down here dies with the context window.

---

# CLOSED 2026-08-09 — sections 1 and 2 ran, 3 to 8 were dropped by Truman

**Sections 1 and 2 are done and both found something.** Section 1's number found
the scroll bug; section 2 confirmed live buses work and turned up a readability
finding, now in `docs/backlog.md`.

**Sections 3 to 8 were dropped on Truman's instruction**, not skipped and not
forgotten: *"As for all the other things reflagged in inc 8 device round 2…
drop them/mark them as fine, honestly. We'll fix bugs as I come across them."*

That is a deliberate change of policy and it is his to make. **Do not silently
resurrect these as owed work**, and do not write another checklist of this
shape — the appetite is for fixing what is hit in use, not for auditing. What
survives from it is the one thing that earned its keep: the *instrumented*
check in section 1, which answered in one glance what four rounds of reasoning
could not.

The sections below are kept verbatim as the record of what was and was not
looked at. **Every unticked box below is unverified and is expected to stay
that way.**

---

## 1. The one number — why the sheet will not scroll

Above the route's stop list there is a temporary muted line reading
`frame N · content M · …`. Open any route with more stops than fit on screen.

- [ ] **Read the two numbers out.** That is the whole task.

What they settle, so it is worth getting right:

- **`content` bigger than `frame`** → the list has room to scroll and the
  gesture is being swallowed between the sheet's pan and the list's scroll.
- **`content` equal to `frame`** → the list was handed an unbounded height, laid
  every row out inside its own frame, and genuinely has nothing to scroll.

Four causes are already eliminated with evidence — version mismatch, the New
Architecture, the worklets babel plugin, and `flex: 1`. See round 1's log. **Do
not add a fifth guess; this number picks the branch.**

### A prediction, written down before the number arrives

**This is read from library source, which is the move that has produced six
wrong claims on this project. It is therefore a prediction to be killed or
confirmed by the measurement, and not a finding.**

`createBottomSheetScrollableComponent.tsx:77` drives the scrollable's
`scrollEnabled` through reanimated's `useAnimatedProps`, and passes it at line
135. All three of the library's scrollables — `BottomSheetScrollView`,
`BottomSheetFlatList`, `BottomSheetSectionList` — come out of that one factory,
differing only by a `SCROLLABLE_TYPE` tag and which Animated primitive they
wrap. **Swapping `BottomSheetFlatList` for `BottomSheetScrollView` therefore
changes nothing about the integration**, and would cost virtualization on a
hundred-stop route.

So scrolling is switched on by a **worklet-driven native prop update**, on a
different path from the sheet's own pan gesture — which works. Worklets are
compiled in the release bundle (verified). What is unverified is whether that
animated prop reaches the scroll view's shadow node in a prebuilt binary.

**If that is the cause, this section's number will read `content > frame`:** the
list is sized correctly and is simply sitting there with `scrollEnabled` false.
**If it reads `content == frame`, this prediction is wrong** and the problem is
layout, not props. Either way the number decides it, which is why it is worth
one glance before anything is changed.

- [ ] Does the **nearby** list scroll? (Not instrumented — just try it.)
- [ ] Does the **arrivals card** scroll on a busy stop?

**There is no control for the live buses.** They appear on their own once a
route is showing, as green dots labelled `<fleet number> · here <n> s ago`. If a
route is up during service hours and no dot ever appears, that is itself the
finding. Pick a frequent route — 1, 2, A, E — rather than a half-hourly one.

## 2. Live buses — the churn this increment was most afraid of

Markers are added and removed every 60 seconds, which is far more tree change
across the `react-native-maps` seam than stops have ever produced. The SIGABRT
at `docs/backlog.md:165` is fixed and has never been proven gone.

Pick a **frequent** route in service — 1, 2, A, or E — so there are buses.

- [ ] Buses appear on the route at all
- [ ] Each is labelled `<fleet number> · here <n> s ago`
- [ ] **Leave it open for five minutes.** Buses move, appear and disappear. No
      crash, no marker jumping to the screen's top-left corner
- [ ] Switch route, flip direction, leave and re-enter route mode a dozen times
      in a row, fast. This is the churn path
- [ ] No bus sitting still in the middle of nowhere (a ghost that beat the
      five-minute filter)
- [ ] Tap an arrival in a stop's card — its bus draws larger, **when there is
      one**. Most arrivals have no bus reporting; that is normal, not a bug
- [ ] Tapping an arrival redraws the line as that bus's own variant

## 3. Scrolling everywhere else — owed since Increment 7, never checked

`08e189d` fixed one list's `flex: 1` on 2026-08-08 and left six without it; all
six were changed together on 2026-08-09 and confirmed by nothing.

- [ ] `/stop/[code]` — tap a stop from the Stops tab, scroll the board
- [ ] `/route/[id]` — open a long route from the **Stops** tab and scroll to the end
- [ ] Stops tab, stop results — search `king`, scroll
- [ ] Stops tab, Routes filter — search `4`, scroll
- [ ] Map search overlay — Routes filter, search `4`, scroll

## 4. The route line and its colour

- [ ] The line is **red**, not blue
- [ ] It follows real roads (observed in round 1 — confirm it still does)
- [ ] A direction with no shape draws no line rather than a wrong one
- [ ] Flipping direction redraws the line

## 5. Dead space and the legend — owed since Increment 7

- [ ] No band of empty space between the last row and the legend on any list above
- [ ] `/stop/[code]`: legend clear of the display's bottom curve, not touching
- [ ] `/route/[id]`: same
- [ ] Legend present on every screen showing stop or route data
- [ ] Legend **absent** at the sheet's resting peek, present at medium and full
- [ ] Legend present under the route's stop list

## 6. The map's chrome — owed since Increment 7

- [ ] **Compass**: rotate two-fingered. Directly under ⌖, same gap as ⌖ has under
      the search bar, right edges aligned, not under the bar
- [ ] **Launch flash**: force-quit and relaunch three or four times. *"Showing
      downtown Honolulu"* must never appear, even for one frame
- [ ] ⌖ recenters and the map travels to you
- [ ] *Search this area* appears after panning away — and **does not** appear
      while a route is showing
- [ ] Long press drops a pin, *Search here* takes it up and pans there
- [ ] Peek shows the heading and one row, clear of the tab bar
- [ ] Tapping a **row** pans the map; tapping a **pin** does not

## 7. Route mode's own behaviour

- [ ] The X leaves route mode; **panning does not**
- [ ] Switch to the Stops tab and back — the route is **still showing**
- [ ] A route that runs one way offers no flip control
- [ ] The card's back control reads `‹ Route <n>`, not `‹ Nearby`

## 8. Stop data — the schema bump

The riskiest thing that cannot be seen. This build is the first schema v2 binary,
and the pointer on the phone names a v1 generation.

- [ ] Settings → the stop-data line still reports a date rather than an error
- [ ] Stops and routes still resolve at all (they come from the bundled floor if
      the pointer was rejected, which is the intended outcome)
