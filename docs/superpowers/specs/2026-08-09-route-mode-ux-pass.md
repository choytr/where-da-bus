# Route mode — the UX pass

**Status:** specced 2026-08-09, after Increment 8 was built and device-verified.
Not a new increment. A pass over what Increment 8 shipped, plus the three items
it deferred into `docs/backlog.md`.

**Why now.** Truman ran route mode on an `.ipa` and sent three screenshots:
*"Overall the UX is not that great. See what you can do to improve it but it's
also fine if you conclude that the clutter is just a consequence of the
requested feature."* Plus a bug: *"on first render of the route view, the bus
icons don't show automatically. If I zoom in and then out they show and persist
when I zoom out."*

The shots are transcribed in `docs/superpowers/logs/2026-08-09-route-mode-ux.md`
and that log is their permanent home. **Do not re-derive its observations** —
there is no device on this side, and every claim in it is a reading of a picture
that no longer exists in context.

---

## The finding that reframes the whole thing

**The clutter is a function of zoom, not of the feature.**

Screenshot 3 — Waikīkī, about eight blocks across — is fine. The red route line
is clearly visible, the stop pins are spaced and individually readable, six of
them carry names. That is the view route mode was designed against and it works.

Screenshots 1 and 2 are the same code at route scale, and there about forty
34-pt tiles fuse into an unbroken chain: the route line cannot be seen at any
point, and in shot 2 twelve bus labels overprint each other and the pins.

So the two deferred backlog items — *stop pins cover the route line* and *bus
labels are unreadable* — **are not two defects.** They are one, which is that
route mode draws the street-scale view at every scale. Neither reproduces at the
zoom Truman was happy with. That is why this pass is a zoom tier rather than
five independent tweaks.

The corollary matters as much: at route scale a rider's question is *where are
the buses on this route*, and the buses are the one thing that is either missing
(shot 1) or drowned (shot 2). The stops, which the pins spend the entire screen
on, answer the street-scale question instead.

## Decisions Truman made

Put to him with the mechanism described first, per the working agreement. All
four are settled and are not to be re-argued.

1. **At route scale, stop pins shrink to plain dots.** Chosen over dropping
   stops entirely and over thinning them out. Every stop stays present and stays
   tappable; nothing is arbitrarily missing.
2. **Bus labels tier the same way**, and go through the stop labeller's
   collision map at street scale. Stated as the consequence of (1) rather than
   asked; not objected to.
3. **Adherence is a ring colour on the dot, plus a count in the route band.**
   No per-bus words anywhere. Arrived at in two steps: Truman first asked for
   rings *as well as* words on the arrival rows, and the rows were then found
   unable to carry them — see below.
4. **The bus layer speaks in the sheet header**, over a banner on the map and
   over speaking only on failure.
5. **The long press is disabled in route mode.** Truman, mid-session:
   *"hold-search-here needs to be disabled in route view."*

## What gets built

### 1. One map scale, decided once per settled camera

A pure function beside `labelledStopIds`:

```ts
export type MapScale = 'route' | 'street';
export function scaleOf(region: Region | null): MapScale;
```

**It reuses `MAX_SPAN_FOR_LABELS` rather than introducing a second threshold.**
That constant is ~0.022° of longitude, about 2.4 km across on Oahu, and it was
chosen as the span past which stop tiles are already touching and no amount of
culling produces a readable map. The span past which *tiles fuse* and the span
past which *labels are hopeless* are the same fact about the same 34-pt boxes.
Giving them one constant is what stops them drifting apart when one is tuned.

`null` — before the map has reported a camera — is `'route'`. The first frame of
a fresh map is zoomed to the query radius, and being briefly too calm is a
better failure than being briefly fused.

Recomputed only when the camera **settles**, never during a pan, for the reason
`labels.ts` already gives: a marker whose view changes is re-snapshotted by iOS,
and doing that to forty markers per frame is how a map becomes unusable.
Crossing the threshold costs one re-snapshot of the set, once.

### 2. Stop pins tier on it

`StopMarker` takes `scale`. At `'route'` it draws an 8-pt plain dot in
`palette.pin` — no bus glyph, no label, no border change.

**The wrapper view stays 34 pt at both scales, and that is not cosmetic.**
`AIRMapMarker.reactSetFrame:` sizes the annotation view from the React layout,
MapKit hit-tests annotation views by frame, and that same method shifts the
marker's center whenever the view's height changes in order to keep its bottom
edge over the same spot. A wrapper that shrank with the dot would make forty
stops untappable *and* move every one of them. Both facts are already recorded
in `StopMarker`'s own header; this design depends on them and changes neither.

`scale` joins `selected` and `placement` in the `tracksViewChanges` effect's
dependencies, or the changed bitmap is never captured.

### 3. Bus labels through the same labeller, buses first

`labels.ts` is refactored so its geometry is one core over labelled points
carrying a box size and a priority order, with stops and buses as two thin
callers. The core keeps every rule the current function has — tiles claimed up
front as obstacles, greedy placement in priority order, below-then-above, a cap.

Two things are new:

- **Buses claim their boxes before stops.** A bus label never loses a collision
  to a stop name. The live information is the reason route mode exists, and a
  stop name is available by tapping the pin while a bus's fleet number is not.
- **At `'route'` scale bus labels are suppressed**, exactly as stop names
  already are. Route scale becomes green dots on a red line, which is the
  question that scale is asking.

**One exception:** the bus behind a tapped arrival keeps its label at any scale,
the same way the selected stop already keeps its name unconditionally. A rider
who just tapped an arrival must see which bus it was.

This also fixes shot 3's one real collision — `875 · here now` overprinting
`KUHIO AVE + LILIU…` — which today happens because buses participate in no
collision map at all.

### 4. Adherence: a ring on the dot, a count in the band

**In colour, as the dot's ring:** amber when late, blue when early, and **no
coloured ring when on time or unreported** — the ring stays the background
contrast colour it is today. Absence means fine, which is what keeps the
route-scale view calm rather than turning it into a traffic light.

Two new palette tokens for the pair, in both themes. Not `warning`, which is
red, and not `route`, which is also red: an amber ring next to a red route line
is legible and a red one is not.

**In words, only as a count**, in the route band line built by item 5:
`7 buses running · 2 late`. The count says how many; the rings say which.

#### Why there are no per-bus words

The design first put lateness on the arrival rows, and **the rows cannot carry
it.** `Arrival` has no `adherence` field — the value lives on `Vehicle`, and the
only join between the two is `tripId`. So a row can only show lateness when the
fleet is in hand, which happens in route mode alone, *and* when that arrival's
trip has a bus reporting against it. `ArrivalRow.tsx` records that ~96% of
arrivals are schedule-only, which puts the row's hit rate near **1 in 25**.

A column that is blank twenty-four times out of twenty-five is not a feature. So
the words moved to the aggregate, where the denominator is the ~7 buses actually
drawn rather than the ~25 arrivals listed, and every one of them has the field.

**This costs the redundant-encoding argument, and the count is what replaces
it.** The objection to a colour-only signal is that it is invisible to a
colourblind rider and meaningless without a legend. `2 late` in the band is not
a legend, but it is a text statement of the same fact at the same moment, so the
map never *only* says something in colour. A rider who cannot separate the rings
still learns that two buses are late. Which two is a real loss, and it is
accepted rather than solved; if it turns out to matter on a device, the honest
fix is making buses tappable, which is out of scope here.

**Two traps, both already recorded and both getting a test named for them:**
positive `adherence` means **early**, and nothing bounds it — a 2026-08-02
sample of thirty live values spanned −19…+4 minutes.

Thresholds are named constants: on time is the band around zero, late and early
are outside it. Tunable in one line, because the right band is a judgement Truman
can only make on a device.

### 5. The bus layer gets a voice — and the band cannot grow

Four states, replacing an empty map that means all of them at once:

| State | Line |
|---|---|
| First fetch in flight | `Looking for buses…` |
| Fleet in hand | `7 buses running · 2 late` |
| Fleet in hand, none on this route | `No buses running` |
| Fetch failed | `Can't reach TheBus` |

**`MapScreen:532` currently discards `useVehicles`' `failure` and `fetchedAt`.**
`const { buses } = useVehicles(...)`. So a rejected key or an unreachable API
draws no buses and says nothing, which is indistinguishable from a route with
none running. `CLAUDE.md` is explicit that this is the ambiguity that makes a
transit app untrustworthy, and the bus layer is currently the one place in the
app that has it.

**The constraint that reshaped this.** The route band is pinned at exactly
`PEEK_BAND` — 44 pt — because all three sheet modes must be the same height at
the top or the resting sheet twitches the moment a route is picked. The band
already spends that on a 17-pt heading and a 12-pt meta line. There is no room
for a third line, and `PEEK_BAND` and `MEDIUM_FRACTION` are numbers Truman tuned
by eye on a device.

So the state **shares the second line with the direction**, in a row where the
direction is `flex: 1` and truncates while the bus state is fixed and never
does:

```
Route 2                              ⇄   ✕
Toward KALIHI TRANSIT CE…  ·  7 buses · 2 late
```

Stated as a layout *relationship* rather than as measured character counts, on
purpose. There is no device on this side and no way to measure a string's
rendered width from here; a design that needs that measurement to be correct is
a design that would have to be guessed at. This one degrades correctly whatever
the widths turn out to be.

The direction is what truncates because it is recoverable — it is the last stop
in a list the rider is looking at — while a truncated `Can't reach TheB…` is
not.

### 6. The long press is disabled in route mode

`onMapLongPress` drops a `PendingMarker` offering *Search here*, and taking it
up calls `searchFrom`, which replaces the anchor's stop set. **In route mode the
pins are the route's stops, not the anchor's**, so the offer resolves to a
change the rider cannot see — the map looks identical afterwards.

*Search this area* is **already** guarded for exactly this reason
(`MapScreen:311`, `routeMode === null`), with the reasoning written out beside
it. The long press is the other half of that pair and was missed. It gets the
same guard.

The X remains the only thing that leaves route mode. This adds nothing to that
rule; it removes a gesture that silently did nothing.

### 7. The stale age clock in `useVehicles`

Found by reading, not on a device. `now` is initialised with
`useState(() => new Date())` when **`MapScreen`** mounts, and the tick that
advances it runs only while a route is showing.

Leave the map open ten minutes and then pick a route: `now − fetchedAt` is about
−10 minutes, `ageOf` clamps the sum to zero via its `Math.max(0, …)`, and for up
to `AGE_TICK_MS` — thirty seconds — every bus reads `here now` and no bus can
fail the freshness filter that keeps ~950 ghosts off the map.

**Shot 2 shows twelve bus labels and every one of them says `here now`.** That
is consistent with exactly this, though it is not proof — a genuinely fresh
fleet looks identical.

Fix: reset the clock when the layer becomes active, so the first render after
entering route mode reads ages against a current instant.

## The bug: buses absent on first render

**Not fixed blind, and not asserted.** Two candidate mechanisms survive:

1. **Latency.** Entering route mode runs `routeById` and `routeStops`, *then*
   the first fleet fetch — one request returning every vehicle on Oahu, 1,184 of
   them and 333 KB. Several seconds on a phone, during which nothing on screen
   admits a bus layer is coming. Truman's zoom-in-and-out takes about that long,
   which would make the zoom coincidental.
2. **A genuine native non-render**, markers added to a live `MapView` not
   drawing until something forces a redraw.

Reasoning further from here is what this project has got wrong seven times, most
recently with the *"Expo Go vs `.ipa`"* theory for the scroll bug, which cost
four eliminations. Note also that React cannot be the cause of the *redraw*:
`BusMarker` is memoised on label, highlight and position, and a zoom changes
none of those — so the markers React hands the map across a zoom are identical
elements.

**Item 5 is the instrument**, and it is shipped rather than thrown away. Open a
route, do not touch the map, and watch the header line:

- `Looking for buses…` → `7 buses running`, with dots appearing → **latency.**
  The zoom was a red herring and item 5 is already the fix.
- `7 buses running` over an empty map → **native**, chased separately with
  `superpowers:systematic-debugging`.

One reading, one glance. Per the retired-checklist agreement: instrument one
number, ask for one reading, stop.

## Out of scope

- **Tappable buses.** A natural home for a richer bus detail view, and a
  feature rather than a UX pass. Nothing Truman named needs it.
- **Clustering.** The tier makes it unnecessary at route scale, and Apple's own
  `+3 more` behaviour moves a pin away from the thing it marks, which
  `labels.ts` rejected on day one.
- **`adherence` on the arrival board outside the map** (`ArrivalsScreen`). The
  decision was about the map. Extending it later is a UI change, since the field
  is already parsed and carried.

## Testing

Everything load-bearing here is either pure arithmetic or a component state, and
both are reachable without a device.

- `scaleOf` and the refactored labeller core: Jest, as arithmetic, the way
  `labels.test.ts` already tests placement. Including a case named for buses
  claiming before stops.
- The adherence verdict: a test named for positive meaning early, one for an
  unreported value getting no ring, and one for a value well outside ±60
  minutes, since nothing bounds it.
- The route band's four states and its late count, and that the band stays
  `PEEK_BAND` tall in all of them.
- That a long press in route mode drops no pending marker.
- The `now` reset: `useVehicles` under fake timers, asserting that a fleet
  fetched after a long idle is aged against a current clock.

`npm test`, `npm run test:scripts` and `npm run typecheck`, all three, before
any push. No new device-round checklist — that practice is retired.
