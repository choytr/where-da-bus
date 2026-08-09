# Increment 6 — UI log

**Running record of the UI half.** Appended per surface: what was observed, what
changed, and what was considered and rejected. It exists because the UI half has
no plan — you cannot plan a pass over screens nobody has looked at — and because
the record has to survive the screenshots themselves, which do not persist in a
session's context.

**Read the distinction on every line: *observed* means it is visible in a
screenshot on a real device. *Inferred* means it was reasoned from source.** This
project has been wrong about appearance three times, every time from inference.

---

## Round 1 — 2026-08-04, 15 screenshots, dark theme, iPhone with Dynamic Island

`~/wheredabus-screenshots/8-4-2026/IMG_4378…4392.png` — **outside the repo, on
purpose.** This repository is public and the map shots carry Truman's position;
they are deliberately not committed and not gitignored-in-place, they simply do
not live here. Drop future rounds in the same place. All dark theme. Light theme
has not been seen at all. Surfaces covered: map + sheet, stops search, arrivals,
route detail, settings, and two failure states under airplane mode.

### Global — things true on every screen

**G1. The tab bar has no icons.** Map, Stops and Settings each render a grey
downward triangle. *Observed* in every screenshot showing the tab bar, and
*confirmed in source*: `app/(tabs)/_layout.tsx` sets `title` on each
`Tabs.Screen` and never sets `tabBarIcon`, so React Navigation draws its
placeholder. This is the single most conspicuous defect in the app and it is
three lines to fix.

**G2. The attribution line is the first thing on every data screen**, rendered
above the content it attributes, wrapping onto two lines with "Inc" alone on the
second. *Observed* on the map sheet (both detents), stops search, arrivals,
route detail and settings. Worst case is the collapsed map sheet, where the
legal text plus a clipped stop name **is the entire visible sheet** — see M11.

The obligation is real and non-negotiable (`lib/legal.ts`, and the terms require
prominent display wherever the data appears). "Prominent" and "first, above the
content, two-line wrap, on five screens" are not the same requirement. Worth
redesigning, not removing.

**G3. Lists have no bottom inset for the tab bar,** so the last row is sliced
mid-glyph rather than scrolling clear. *Observed* four times: `IMG_4378`/`4379`
(collapsed sheet, "Stop 3920 89 m" cut), `IMG_4384` ("LILIHA ST + 1657" cut
through the middle of the letters), `IMG_4383` (last arrival row), `IMG_4389`
("Using the copy published 4 August 2026." cut).

**G4. Type sizes drift between screens.** *Inferred*, but with hard evidence: 10
distinct `fontSize` literals across 71 usages (11, 12, 13, 14, 15, 16, 17, 20,
22, 28) and no scale in `lib/theme.tsx`, which has colour tokens only.

### Map

**M5. The recentre button is too high and collides with map labels.** *Observed*
in `IMG_4378`/`4379`: it overlaps the "Kamehameha Schools – Kapālama High School"
label. When the compass appears (`IMG_4381` on) the two stack at different sizes
and different horizontal offsets, which reads as two unrelated controls rather
than a group.

**M6. Two different callout styles on one map.** *Observed*: the *Search here*
callout is our own themed dark tooltip (`IMG_4380`), while a selected stop uses
**MapKit's native white bubble with black text** (`IMG_4382`, `IMG_4384`) — a
white rectangle on a dark map. `MapScreen.tsx` passes `tooltip` for the former
and not the latter.

**M7. The selected pin's colour is inconsistent.** *Observed* green in
`IMG_4382` and red in `IMG_4384`, both carrying the same white callout. The
semantics are unclear from the outside and need checking against source before
anything is changed.

**M8. Every pin is an identical generic MapKit teardrop.** *Observed*. Twelve
identical red pins carry no information — not which stop is nearest, not which
has a bus soon, not which is favorited.

**M9. The *Search this area* pill sits directly beneath the recentre button** at
the top centre-right. *Observed* `IMG_4378`. Not overlapping, but crowded.

**M10. The *Search here* callout text IS centred on its pin.** *Observed*
`IMG_4380`. This confirms Truman's report and **the backlog entry claiming
otherwise is dead** — deleted rather than struck through.

### Map sheet and stop card

**M11. The collapsed detent shows no arrival rows at all** — attribution (2
lines), stop name, then "Stop 3920 89 m" clipped by the tab bar. *Observed*
`IMG_4378`/`4379`. This matters because the backlog records the 45% detent as
deliberately showing "one and a half arrival rows", and instructs future
sessions not to raise it. What is actually visible is legal text. **The
attribution block is what ate the arrival rows.** The recorded decision is not
wrong; its premise no longer holds.

**M12. The expanded card's header is five stacked rows** for four short facts:
name / `Stop 4760` / `Updated just now` / `503 m` / `[151]`. *Observed*
`IMG_4382`, `IMG_4383`. Roughly 40% of the sheet before a single arrival.

**M13. The back control reads `‹ Nearby`.** *Observed* `IMG_4383`. Accurate —
it returns to the nearby list — but "Nearby" is an odd word to meet after
tapping a pin on a map.

### Stops

**S14. No screen title.** *Observed* `IMG_4385`: the search field is the first
element under the status bar. Every other screen has a title or a nav bar.

**S15. Both the attribution and the non-affiliation disclaimer render**, two
grey paragraphs and four lines, between the search field and the first result.
*Observed* `IMG_4385`/`4386`.

**S16. The keyboard covers the last result with no inset.** *Observed*
`IMG_4385`: "UNIVERSITY AVE + DOLE ST" is cut in half by the keyboard's top
edge.

**S17. Favoriting a search result reorders the list under your finger.**
*Observed* across `IMG_4385` → `IMG_4386`: starring stop 413 moves it from
fourth to first. Favorites-above is right for the nearby list; in *search
results* the row you just touched jumping to the top is disorienting.

**S18. Route chips vary in width by content** — `A LINE` is a wide chip beside
narrow `4` `6` `13`. *Observed* `IMG_4385`. Cosmetic; noted, not necessarily a
defect.

### Arrivals (full screen)

**A19. The stack header reads "Arrivals", not the stop name.** *Observed*
`IMG_4387`. Confirms the existing backlog entry.

**A20. The header carries no distance and no route chips**, where the map's stop
card carries both. *Observed*, comparing `IMG_4387` against `IMG_4382`. Confirms
the existing backlog entry; Truman prefers the card's version.

**A21. The last row runs under the home indicator.** *Observed* `IMG_4387` — the
white indicator bar is drawn across "3h 50m / PAUOA VALLEY". **Unresolved**:
whether the list scrolls clear of it at the true end. Needs one screenshot
scrolled to the bottom. Do not reason about this from source — see the
scroll-indicator history in `docs/backlog.md`.

**A22. The arrival row itself reads well and should not be disturbed.**
*Observed*: large countdown left, clock time beneath, route chip, headsign, and
a status line (`● Live · Bus 546` / `○ Scheduled · no GPS`). This is the best
component in the app.

**A23. The rows are highly repetitive** — seven consecutive rows reading `151`
and `CHINATOWN - HALEWAIOLU`. *Observed* `IMG_4383`. When a section is entirely
one route and one headsign, repeating both on every row spends the width that
makes the countdown legible.

### Route detail

**R24. The stack header reads "Route", not "Route 2".** *Observed* `IMG_4388`.
Same defect as A19.

**R25. The numbered stop list reads well.** *Observed*: muted ordinals in a left
gutter, stop name, stop code beneath. No change proposed.

**R26. Nothing indicates where the rider is along the route** — no distance, no
"you are near here" marker. *Observed*. A gap, not a defect.

### Settings

**T27. The attribution renders above the "Settings" title.** *Observed*
`IMG_4389` — legal text is the first thing on screen, and it displaces the
screen's own title. Settings displays no route or arrival data, so whether the
obligation even applies here is worth checking against `docs/api/README.md`'s
verified Terms of Use reading.

**T28. The API-key group's three rows look alike and behave differently.**
*Observed* `IMG_4389`: a masked value with a `Show` action, then
`Paste a new key to replace it` — which is a *placeholder in a text field*, not
a row — then a disabled `Save key`, then a destructive `Remove key`. Four rows
in one card, three different kinds of thing.

**T29. The registration URL is raw unstyled text**, not a link or a button.
*Observed* `IMG_4389`: `https://api.thebus.org/NewAccount/`.

**T30. The stop-data copy is good and should be kept.** *Observed* `IMG_4390`:
"New stop data downloaded. It will be used the next time you open the app." and
"Arrival times always come from the live service and are never read from this
copy."

### Failure states — airplane mode

**F31. The sheet's failure state is the right shape.** *Observed* `IMG_4391`:
the stop name, code, distance and route chips are all retained, with
"Could not reach the bus service." and a `Try again` button beneath. The rider
still knows which stop they are looking at. Below the button is a large empty
expanse, which is the only complaint.

**F32. The full-screen arrivals failure state loses the stop entirely.**
*Observed* `IMG_4392`: header "Arrivals", then a centred
"Could not reach the bus service." and `Try again` on an otherwise empty screen.
**No stop name, no stop code, no attribution.** You cannot tell which stop
failed. The same application state renders two different ways depending on which
surface you reached it from, and the worse one is the full screen.

### Not yet seen

Light theme (none of the fifteen), the arrivals **empty** state, the
**unauthorized** state, **location denied**, search with no results, `KeyGate`
onboarding, and the database-unavailable screen — which is reachable in Expo Go
by flipping `AppShell.tsx:249` to `state = { failed: true }`, Truman's
suggestion, and it removes the last state that would have shipped as inference.

---

## Round 2 — 2026-08-08, 13 screenshots, dark theme, same device

`~/wheredabus-screenshots/8-8-2026/IMG_4462…4474.png`, outside the repo for the
reason above. Truman's own notes came with them, in the order he took the shots;
they are reproduced here per finding rather than quoted as a block, and his
words are marked as his. Surfaces: `KeyGate`, map + sheet + pins, the geocoder
probe, Settings' API-key group, route detail.

**`KeyGate` is now seen** (`IMG_4462`) — it was on Round 1's *not yet seen*
list. Still unseen: light theme, arrivals empty, unauthorized, location denied,
no search results, database-unavailable, and arrivals scrolled to the true
bottom (A21 is still open, and still must not be reasoned about from source).

### Onboarding

**K33. `KeyGate` looks right.** *Observed* `IMG_4462`. Truman: "Api screen looks
good." No change proposed. It is also the only screen in the app whose key field
is masked — see T39.

**K34. Nothing checks the key before letting the rider in.** *Confirmed in
source*: `KeyGate.tsx:62` `save()` calls `onSave(trimmed)` and stores whatever
was typed; the only requirement is non-empty. A wrong key therefore surfaces
much later, as an arrivals failure on some other screen. Truman: "maybe it
should somehow probe the api for an 'ok' response before letting the user in to
prevent them from inputting a bad key. Idk, might be overkill though."

The machinery exists. `ArrivalsFailure`'s `unauthorized` is already recognised
from the response body (the API reports every error as HTTP 200), so a single
arrivals request against a known-good stop code separates *rejected* from
*could not reach*. **The design question is what happens on `unreachable`** —
refusing to save a key because the phone is offline would lock a rider out of
an app that works offline for stops and routes. Undecided; put to Truman.

### Map — controls

**M35. The two top controls sit ~123 pt below the top of the screen.**
*Observed* `IMG_4463`/`4465`/`4469`/`4472`; Truman: "buttons at the top are too
far down (search here and use my location buttons)." *Confirmed in source*:
both are `top: insets.top + 64` (`MapScreen.tsx:528` and `:551`), and this
device's top inset is ~59 pt. The `+ 64` exists to clear the fallback location
banner, which is only mounted when `source === 'fallback'` — so the offset is
paid on every launch to reserve room for a view that is usually absent.
Supersedes M5 and M9, which described the same offset from one screenshot.

**M36. The Apple Maps legal label jumps rather than tracks, and sits too high
at the medium detent.** *Observed*: at peek it is just above the sheet
(`IMG_4463`), at 45% there is a visible gap between it and the sheet's top edge
(`IMG_4464`, `IMG_4469`). Truman: "The apple maps attribution snaps into place
when the sheet moves and is also too far above the sheet at halfway."
*Confirmed in source*: `mapPadding` is derived from `detent`
(`MapScreen.tsx:179-187`), and `detent` is set from the sheet's `onChange`
(`:569`), which fires when the sheet **settles**. So the label is stationary
through the whole drag and then jumps. Tracking it would mean driving
`mapPadding` from the sheet's animated position instead of its settled index.
The gap size is a separate arithmetic question from the jump.

### Map — pins, callouts and selection

Three symptoms, all *observed*, and the mechanisms below are **inferred from
source and unconfirmed**. This is the area where this project has been wrong
three times; treat the causes as candidates to measure.

**M37. Selection in our state and selection in MapKit can disagree**, and every
symptom Truman reported on the pins is a shape of that one disagreement.

Truman: "Interactions with the pins are awkward. Sometimes it's possible to have
a stop selected but have it not show up on the map at all. And sometimes it's
possible to 'deselect' a stop by tapping the pin instead of just on the map,
which makes it deselect and turn back red, but the label is still there and the
pin is still enlarged."

- *Observed* `IMG_4472`: MapKit's white callout reading `ALEWA DR + 1440` is up,
  its pin enlarged, **while the sheet shows the plain nearby list** — nothing is
  selected in our state.
- *Observed* `IMG_4470` and `IMG_4471`: the sheet shows a selected stop
  (`HOUGHTAILING ST + KONIA ST`, and `NUUANU AVE + OPP ILIAHI ST`) with **no
  green pin anywhere on the map**. `IMG_4469`, a minute earlier, shows the green
  pin working — so this is intermittent, not broken outright.

The two selections are genuinely separate objects. Ours is `selectedStop`
(`MapScreen.tsx:121`), which drives `pinColor` (`:476`). MapKit's is the
annotation's own selected state, which it manages itself and which draws the
native callout, because every stop `Marker` passes `title` (`:475`) and, unlike
the pending-anchor marker, no `tooltip`. Nothing synchronises them.

Candidate mechanisms, none confirmed:

1. **The deselect-by-tapping-the-pin case**: tapping an annotation MapKit has
   already selected may not re-fire the marker's `onPress`, so the
   `event.stopPropagation()` at `:366` never runs and the tap reaches
   `MapView`'s `onPress` → `onMapPress` → `setSelectedStop(null)`. That would
   produce exactly the reported triple: our state clears, `pinColor` reverts to
   red, and MapKit's callout and enlargement stay because MapKit was never told
   anything.
2. **The no-green-pin case**: either the `pinColor` change is not applied to an
   annotation view iOS has already created, or the selected stop is not in
   `stops` at that moment and so has no marker at all. These are different bugs
   with different fixes and the screenshots do not separate them.

**What would settle it**: a screen recording of the gesture, or `IMG_4470`'s
situation reproduced with the stop's own pin known to be on screen. Do not fix
from this description.

**M38. The callout design is wrong on both kinds of marker.** Truman: "Sometimes,
it is possible for the hold interaction to show the pin but not the label. Either
way, the label on top of the pin thing looks stupid. We need to change how it
looks."

Two separate things in one note.

- **The missing label** is *observed* and is **new evidence for the map-crash
  backlog entry**, whose first candidate is exactly this line:
  `pendingMarker.current?.showCallout()` (`MapScreen.tsx:319-322`). The entry
  records that the ref is null for the entire Jest suite so the call is a no-op
  under test; Truman has now seen the device case where the marker appears
  bearing an invisible offer. That is the effect running before the ref
  attaches. It does not prove the crash has the same cause, and must not be
  written up as if it does.
- **The look** is a design change covering both callouts: our themed dark
  tooltip for *Search here* (`IMG_4465`) and MapKit's white bubble for a
  selected stop (`IMG_4472`, a white rectangle on a dark map). Round 1 logged
  the inconsistency as M6; Truman is now rejecting the bubble-above-the-pin
  form itself, which is a larger change than making the two match. **No
  direction chosen yet.**

### The geocoder probe

**P40. `geocodeAsync` has no regional bias and returned exactly one result every
time.** *Observed*, three queries, `IMG_4466`/`4467`/`4468`. Truman: "Idk what
I'm supposed to see in the probe, but here's some test runs. I only ever get 1
result, idk if that's intentional."

| Query | Result | Where that is |
|---|---|---|
| `u` | 38.5696, −121.5041 | Sacramento, California |
| `university` | 40.8119, −77.8518 | State College, Pennsylvania |
| `2500 campus road` | 21.2983, −157.8188 | UH Mānoa, Honolulu — correct |

**This is the finding that matters for address search**, and it is worse than
the result count: a bare word resolves to the mainland with no signal that it
did. Increment 6's spec settled that search would be address-only via
`Location.geocodeAsync`; it did not settle that the results would need
constraining to Oahu. **Open question**: whether Expo SDK 54's `geocodeAsync`
exposes anything like `CLGeocoder`'s `geocodeAddressString:inRegion:`, and if
not, whether filtering returned coordinates to an Oahu bounding box is enough.
Check the v54 docs before proposing either.

The three untried probe queries — a mall, a restaurant, a beach — are the ones
that test the places-are-not-addresses boundary the spec already recorded, and
are still worth running.

### Settings

**T39. The replacement-key field is not masked.** *Observed* `IMG_4473`: the row
above shows `•••••••••••fff` with `Show`, and directly beneath it the field
being typed into renders `abcdefg` in the clear. *Confirmed in source*:
`SettingsScreen.tsx:154` has no `secureTextEntry`, while `KeyGate.tsx:125` has
`secureTextEntry={!revealed}` — and `KeyGate`'s comment says "Same pair as
Settings", which is not true. Truman: "The api key needs to be hidden on the
paste field." Unambiguous, small, and the comment needs correcting with it.

### Route detail

**R41. The route screen does not answer a rider's question.** *Observed*
`IMG_4474`, Route 4: title, subtitle, a direction section header, then 40-odd
numbered stops. Truman: "The route page is not very informative. I can't really
figure out anything from just looking at a list of all the stops of a route.
Again, this goes back to the seeing a bus on the map thing, which I think is
deferred (could be wrong)."

**He is right that it is deferred.** Live vehicles are a later increment and
route polylines were cut from that work entirely — recorded in `docs/handoff.md`
and settled at the 2026-08-04 grilling. Round 1's R25 called the list "reads
well", which was about its typography; R26 already recorded that nothing says
where the rider is. This entry supersedes both: the complaint is not the layout,
it is that an ordered list of names is not what anyone opens a route for.

What can be done inside Increment 6, without live vehicles: where the rider is
along the list, which stops are near them, and the arrival times for the stop
they care about. What cannot: the bus's position. **No direction chosen yet.**

### Sheet detents

**M42. The 14% peek shows nothing worth peeking at.** *Observed* `IMG_4471`:
the peek's entire visible content is the two-line attribution, the stop name,
and `Stop 386  133 m` clipped by the tab bar. Truman: "the bottom sheet's 14% is
kind of awkward. It peeks but doesn't show any meaningful information. Needs to
be revisited."

Round 1 reached the same conclusion from the other end (M11) and named the
cause: **the attribution block is what eats the peek**, not the detent height.
`docs/backlog.md` says the 45% detent must not be raised and gives the reason;
that entry is about 45% and does not cover 14%. Raising the peek and moving the
attribution are two different fixes and only one of them is constrained.

### What Truman decided, 2026-08-08

Four questions were put to him after the findings above were written up. His
answers, so they are not re-asked:

- **K34, checking the key before entry — no.** "Leave it — not worth the
  complexity." His own instinct in the note ("might be overkill") stood.
- **R41, the route page — leave it until live vehicles.** Not a scope
  expansion, not a partial one. The screen stays as it is this increment.
- **M38, the callouts** — "I actually like a label corresponding to an icon.
  But how it's implemented right now, with the big bubble and the rectangle of
  text on the top half of it, looks stupid." He sent `IMG_4475` (Apple Maps)
  and `IMG_4477` (Google Maps), both showing bus stops. "Take some inspiration
  from those. If you still can't get it to look good, don't worry, I'll step in
  for that."
- **G2/M42, the attribution** — "Is it possible to not show the attribution in
  every goddamn screen? It's literally everywhere and it's excessive."

### The two reference screenshots, described so they survive

*Observed*, both from his phone, dark theme, the same neighbourhood.

**`IMG_4475`, Apple Maps.** Each stop is a small blue rounded-square tile with a
white bus glyph. The stop's name is written **beneath** the tile in white with a
dark halo, centred, wrapping to three lines, always visible — no tap, no bubble.
Tiles carrying more than one stop show a number in place of the glyph and a
`+1 more` line under the name. Nothing on that map is a teardrop.

**`IMG_4477`, Google Maps.** Each stop is a red circle with a dark bus glyph and
the name written **beside** it, white, one or two lines, always visible. The
*selected* stop is different in kind: a large plain teardrop with no glyph, its
name larger, and a bottom sheet with the stop's name and actions. Selection is
shown by changing the marker, never by floating a bubble over it.

The common lesson, and the one taken: **the name belongs on the map, and
selection belongs in the marker.** Neither app uses a callout for either job.

---

## Round 2 — what was built

Six commits, `66c3755` through `c8f39b5`, one per surface. Everything below is
*inference until Truman confirms it on a device* — none of it has been seen.

**T39, the key field — done.** `secureTextEntry` on the replacement field,
sharing the reveal toggle the stored key already had. Two tests.

**G2/M42, the attribution — moved, not removed.** The clause is "You must
present the Data with the following legend, prominently displayed", which
attaches to *presenting the Data*: not the top of a screen, not repetition
within one, and not a screen presenting no Data. So `KeyGate` loses it outright
and Settings keeps it in About; the four data surfaces keep it at the foot of
their content. `lib/Attribution.tsx` now owns placement and records the
argument against. **Two documented claims were wrong and are corrected**: the
terms require no non-affiliation disclaimer at all — the document runs four
obligations and contains no form of *affiliate* or *endorse* — so the
disclaimer is ours by choice, which `legal.ts` had flagged as pending and
`CLAUDE.md` had asserted as fact.

**M35, the top controls — done.** `insets.top + 12`, with the banner's
allowance added only while the banner is up.

**M36, the jumping label — half done.** The sheet now reports its live top edge
and `mapPadding` follows it, so the label travels with the drag instead of
snapping when it lands. **The gap at the half detent is untouched** and
deliberately so: closing it means picking a constant against MapKit's own inset
above `layoutMargins`, and this repo has three wrong claims on record from
reasoning about native layout rather than looking at it.

**M37/M38, the pins — rebuilt.** `StopMarker` draws a tinted tile with a bus
mark and the stop's name beneath it, in two lines with a halo; selection grows
the tile rather than recolouring it. `PendingMarker` replaces the *Search here*
callout with a pill drawn in the marker's own view.

**No stop marker passes `title` any more, and that is the substantive fix.** A
`title` is what gave MapKit a callout and an annotation selection of its own —
the second selection behind every pin symptom in M37. A test asserts its
absence.

**This deletes one of the backlog's two crash candidates without testing it,
and that is not a fix.** `showCallout()` is gone because the offer no longer
needs raising imperatively, which is a design reason that stands alone. The
second candidate — unmounting the marker from inside its own press handler — is
untouched: taking up the offer still does exactly that.

### What round 3 should look at

The four changed surfaces, unseen: the map's new markers and labels at a couple
of zoom levels, the *Search here* pill, the peek detent now that the legend has
left it, and the foot of the stops list, arrivals and route detail.

**The peek's height was deliberately not changed.** Its *contents* changed, and
changing the number in the same round would make it impossible to tell which of
the two fixed it. M42 stays open pending one look.

**Label collision is the known risk and has not been seen.** Apple and Google
both cull and reposition labels when pins crowd; this does not. Twelve stops
within a block, as in `IMG_4470`, is the case to photograph.

Still unseen from Round 1: light theme, arrivals empty, unauthorized, location
denied, no search results, database-unavailable, and arrivals scrolled to the
true bottom (A21, which must not be reasoned about from source).

---

## Round 3 — 2026-08-08 evening, 3 screenshots plus the two references

`~/wheredabus-screenshots/8-8-2026/IMG_4478…4480.png`. `IMG_4479` is **ours**;
`4478` is Apple Maps and `4480` is Google Maps, both of the same neighbourhood,
sent as references and described in the Round 2 section above.

**M43. Labelling every stop does not work.** *Observed* `IMG_4479`: roughly
twenty stop names overlapping in a heap across Kalihi, most unreadable, several
tiles buried under their neighbours' text. Truman: "The new pins look awful
because the text is showing constantly. Other than the labels at a far zoom, it
functions fine."

The reference apps both label a *minority* of what they draw. Apple clusters —
one tile carries `4`, another `+3 more` — and Google simply drops the labels
that would collide while keeping the pin. **Fixed by doing the Google thing**
(`features/map/labels.ts`): nothing but the selection past the zoom where tiles
start touching, and below that a greedy pass in priority order — selection
first, then nearest — keeping a label only where its box clears every box
already placed. Pure function, eight tests, recomputed only on a settled camera.

**M44. The peek detent is mostly underneath the tab bar.** *Inferred, but it is
arithmetic rather than a reading*: the sheet's `14%` is 14% of the container,
which is the full-screen view — about 119 pt on his device. The tab bar occupies
roughly 83 pt of that (49 pt of bar over a 34 pt bottom inset), and the grab
handle another 20. **That leaves on the order of 16 pt for content.**

This is the single number behind three separate complaints: Round 1's M11,
Round 2's M42, and Truman's 2026-08-08 "when a stop is selected, the stop code's
spacing to the bottom bar is really tight and awkward, and the stop list showing
only the top entry isn't the best either." *Observed* in `IMG_4479`, where
`Stop 3984` sits directly on the tab bar.

**His proposal — headings, "Nearby Stops" and "Selected Stop" — is right and
cannot be built first.** There is no room to put a heading in 16 pt. The peek
has to clear the tab bar before anything can be designed into it, which means
`DETENTS[PEEK]` becoming a computed pixel value rather than `'14%'`. That
touches `visibleAbove`, which the camera framing depends on and which is well
covered by `region.test.ts` — worth doing carefully rather than alongside a
crash fix. **Not started.**

**M45. `mapPadding` has now been all three things, and is fixed.** *Observed*
that tracking the sheet's animated position works and is unpleasant — Truman:
"The Apple Maps label is indeed tracking. But it's very jittery, and it's still
too far above the bottom sheet." It was never going to be smooth: `mapPadding`
is an ordinary prop on a native view, so every frame was a JavaScript state
update and a round trip.

It is now a constant, pinned just above the collapsed sheet. He asked whether it
could sit in the bottom-left and be covered by the sheet at every detent;
**almost** — MapKit's usage terms ask that the label not be obscured, and one
detent up keeps it visible in the state the map is nearly always in, for no cost.

### The crash, which now has a reproduction

**Truman, 2026-08-08: "Selecting stops fast is very reliably leading to a crash.
I can switch the selected stop a few times before it crashes. If I go slower
it's more stops before it crashes — if I go faster it's less stops. Also when
selecting stops while another was selected, icons often disappear."**

This is a **different reproduction from the one in `docs/backlog.md`**, which
Truman narrowed to the tap-hold *Search here* gesture on 2026-08-05. It is also
far better evidence: reliable, and rate-dependent in a direction that points at
a race rather than at a bad state.

**It appeared in a build carrying `StopMarker`, which this session wrote.** That
is not proof it was introduced here — the old build crashed too — but it is the
honest starting point, and the two symptoms travel together in a way the old
crash's did not.

**Leading candidate, acted on but not confirmed: `zIndex`.** `StopMarker` was
passing `selected ? 2 : 1`, so every change of selection reordered two
annotation views on a live iOS map. Reordering forces MapKit to recycle
annotation views, which would explain the blank icons; doing it repeatedly while
the map is still drawing would explain a rate-dependent crash. The prop is gone.
The cost is that a selected tile can sit behind a neighbour it has grown past.

**This is a candidate, not a diagnosis, and must not be written up as a fix.**
Nothing has been confirmed on a device and the crash log has not been read. The
next step is unchanged and is the one the backlog has asked for since 2026-08-06:
the log off the phone — Settings → Privacy & Security → Analytics & Improvements
→ Analytics Data, entries named `WhereDaBus-…` — which says in one look whether
the process died in JavaScript or inside MapKit.

If it says MapKit, `zIndex` and `tracksViewChanges` are where to keep looking.
If it says JavaScript, note that a throw inside `onPinPress` or `searchHere`
would be caught by nothing: React error boundaries cover render, not event
handlers.

### Geocoding — settled

**P40 is answered and built.** `Location.geocodeAsync(address: string)` takes an
address and nothing else in SDK 54 — checked against the installed type
definitions, not the docs — so `CLGeocoder`'s `inRegion:` is unreachable and the
biasing is ours. `data/geocode/oahu.ts` appends `, HI` unless the text already
names the state or city, then tests whatever comes back against an Oahu bounding
box, keeping *nothing matched* and *matched somewhere off the island* apart. No
UI consumes it yet; the throwaway probe shows its verdict beside the raw reply
so it can be checked on a device before the probe is deleted.

---

## The crash, diagnosed — 2026-08-08

**Settled by evidence, not by reading.** Full write-up in `docs/backlog.md`;
the short version, because it corrected three things at once.

`Expo Go-2026-08-08-011041.ips`: uncaught Objective-C exception,
`-[__NSArrayM insertObject:atIndex:]`, main thread, inside Fabric's mounting
transaction. **Neither JavaScript nor MapKit — React Native's view-mounting
layer.** `zIndex` on Fabric means reordering sibling views, and reordering
`react-native-maps`' marker subviews is what threw.

Three corrections worth carrying:

1. **Both candidates the backlog had named were wrong**, and both were readings
   of native source rather than measurements. That is now four wrong claims in
   this repo produced the same way. The rule in `docs/backlog.md` — trust the
   symptoms, measure the causes — held again.
2. **My own first guess was wrong too.** I removed `zIndex` for the right
   reason by accident: I said it was MapKit recycling annotation views, and the
   log says it was RN's child-view bookkeeping. Same prop, wrong layer. The
   comment in `StopMarker` asserting the wrong mechanism has been rewritten
   against the log.
3. **Expo Go crashes are logged, under `Expo Go-…` rather than the app's name.**
   Earlier advice in this file and in the backlog implied a standalone build was
   needed to get one. It is not, and that cost several days of "no stack yet".

**Not closed.** A race that stops reproducing is not a race proven gone, and
`tracksViewChanges` still toggles a prop on those same components. If it
returns: another `.ips`, then look at anything that makes React insert, remove
or reorder a child view inside a `react-native-maps` component.

---

## Round 4 — 2026-08-08 afternoon, the map settles

`IMG_4525`–`IMG_4529`. Truman: "No interactions are really broken anymore", and
after the label work, "overall the experience really is way better than before.
Good instinct on the label flipping."

**M46. The culler never checked labels against *tiles*.** *Observed*
`IMG_4527`: names running underneath other stops' icons. It only ever compared
label boxes with other label boxes. Every tile is now claimed as an obstacle
before any label is placed, a label may flip above its tile when there is no
room beneath, and at most six names appear at once.

**M47. The projection divided by the wrong height, and it caused both remaining
complaints at once.** *Found by reading, prompted by* "sometimes the labels do
overlap and sometimes it's really hard to get the labels to show up for the
stops I'm looking at."

`labelledStopIds` was handed the height *above the sheet* as its viewport, but
the map is full-screen and the camera's region spans the whole window. Every
stop separation therefore came out short by the sheet's fraction: boxes
comfortably apart on screen were computed as touching, which over-culled, while
the skewed centre let genuine overlaps through. One mistake, both symptoms.

Fixed by projecting against the full window height and passing `visibleHeight`
separately — which turned out to be worth having anyway: **stops behind the
sheet were spending the six-label budget on names nobody could see.** They still
count as obstacles, because they are still drawn.

**M48. Tapping a pin no longer counts toward the double-tap zoom.** Truman chose
the blunt fix knowing the cost: the map refuses to zoom for 320 ms after a pin
tap. A deliberate pinch inside that window does nothing. The alternative was
native, and leaving the Expo Go loop is a larger decision than this one.

### Still open on the map, and deliberately left

- **Labels still overlap sometimes**, and some stops are hard to get a label
  for. *Observed* after the fixes above; better, not solved. The selected stop
  keeps its label whatever collides, which is a deliberate escape hatch and one
  known source of overlap.
- **`MAX_LABELS = 6` is a guess** that has never been tuned on a device.
- **Truman's idea for later: place labels to the *side* of a pin**, not only
  above and below. Both reference apps do it, it roughly doubles the placements
  available again, and it is a change to one pure function plus one style. His
  words: "that can be later."

---

## The geocoder probe, answered in full — 2026-08-08

Six queries run on the device, `IMG_4530`–`IMG_4534` and earlier. **The probe
has now done its whole job and can be deleted at merge.**

| Typed | Raw reply | Where | With `, HI` | Verdict |
|---|---|---|---|---|
| `u` | 38.5696, −121.5041 | Sacramento, CA | — | off island |
| `university` | 40.8119, −77.8518 | State College, PA | 21.29407, −157.82134 | **on Oahu** |
| `2500 campus road` | 21.2983, −157.8188 | UH Mānoa | same | on Oahu |
| `ala moana` | 21.2990, −157.8527 | Ala Moana | same | on Oahu |
| `beach` | 46.9149, −104.0039 | **Montana** | 21.31977, −158.01043 | **on Oahu** |
| `ala moana beach` | 21.2990, −157.8527 | Ala Moana | **0 results** | ~~nothing matched~~ |
| `da spot` | 0 results | — | 0 results | nothing matched |

Four things settled:

1. **The steer works, and is necessary.** `"university"` and `"beach"` both
   resolve to the mainland raw — Pennsylvania and *Montana* — and both land on
   Oahu once `, HI` is appended. Without this, address search would have
   confidently thrown riders across the Pacific.
2. **The steer can also break a query that worked.** `"ala moana beach"`
   resolves correctly on its own and returns **zero results** as
   `"ala moana beach, HI"`. Caught only because the probe printed both.
   **Fixed**: `findOnOahu` now asks the plain text as a second attempt whenever
   the steered one produced nothing on the island, so a hint can never turn a
   right answer into no answer. One request in the common case, two only on the
   ones that would otherwise have failed.
3. **Place names do partly resolve**, which the spec did not assume — `ala
   moana` and `beach` both return points. `CLGeocoder` is still an address
   geocoder and `"da spot"` gets nothing, so the spec's *places are not
   addresses* caveat stands as a limit rather than as an absolute.
4. **Still one result per query, every time.** Seven queries, never more than
   one. Undocumented, so `findOnOahu` still scans the whole array.

### Truman's question: address autocomplete, 3–5 suggestions?

*Asked 2026-08-08 for a later increment.* **Not feasible on the current
dependency set, and the reason is not effort.**

`geocodeAsync` returns `{ latitude, longitude, altitude, accuracy }` and nothing
else — **no formatted address, no place name**. Even with several results there
would be nothing to *print* in a suggestion list but coordinates. And it has
returned exactly one result every time it has been watched. Both halves of a
suggestion list are missing.

The real API is `MKLocalSearchCompleter`, which is what Apple Maps' own
search-as-you-type uses. Neither `expo-location` nor `react-native-maps` exposes
it, so it means a native module — and that leaves the Expo Go loop, which
`CLAUDE.md` treats as an architectural decision rather than an install. A web
geocoder (Nominatim, Mapbox, Google Places) is the other route and brings a
second network dependency, another key, and another terms-of-use.

**What is feasible today, and is the honest middle:** geocode once on submit,
then `reverseGeocodeAsync` the single result to get a formatted address, and
show *one* confirmation — "Did you mean 2500 Campus Rd, Honolulu?" — rather than
a list. No new dependency, and it fixes the thing autocomplete would really be
for, which is not guessing what the app understood.
