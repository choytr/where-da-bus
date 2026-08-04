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
