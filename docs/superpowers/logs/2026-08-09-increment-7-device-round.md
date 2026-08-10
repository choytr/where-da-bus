# Increment 7 — device round checklist

Built from `dev` at `4e50f0c`. Run with
`gh workflow run ios-ipa.yml --ref dev`, then sideload per `docs/sideloading.md`.

**Mark each line `observed` or `inferred`, and say which.** That distinction is
the whole value of this file — see `docs/superpowers/logs/2026-08-04-increment-6-ui.md`
for the shape. Anything not written down here dies with the context window.

Ordered by risk, not by feature. **Section 1 is the part most likely to be
broken**, because six of its seven lines were changed on the strength of one
report and confirmed on none.

---

## 1. Scrolling — every list in the app

`08e189d` fixed one list's `flex: 1` on 2026-08-08 and left six others without
it. All six were changed together on 2026-08-09 with no device confirmation, so
this section is the one to do first. A broken list announces itself as
scrollable and then will not move.

- [ ] Map sheet, **nearby list** — raise to full, scroll to the last stop
- [ ] Map sheet, **arrivals card** — select a busy stop, scroll to the last bus
- [ ] **`/stop/[code]`** — tap a stop from the Stops tab, scroll the board
- [ ] **`/route/[id]`** — open a long route (Route 2, or A) and scroll to the end
- [ ] **Stops tab**, stop results — search `king`, scroll the results
- [ ] **Stops tab**, Routes filter — search `4`, scroll the results
- [ ] **Map search overlay** — Routes filter, search `4`, scroll the results

## 2. Dead space and the legend

Both changed on 2026-08-09; the gap fix is unconfirmed.

- [ ] No band of empty space between the last row and the legend, on any list
      above — scroll to the bottom and look
- [ ] `/stop/[code]`: legend clear of the display's bottom curve, not touching
- [ ] `/route/[id]`: same
- [ ] Legend present on every screen that shows stop or route data
- [ ] Legend **absent** at the sheet's resting peek, present at medium and full

## 3. The map's chrome

- [ ] **Compass**: rotate the map two-fingered to bring it up. Directly under ⌖,
      same gap as ⌖ has under the search bar, right edges aligned, not under the
      bar
- [ ] **Launch flash**: force-quit and relaunch three or four times. *"Showing
      downtown Honolulu"* must never appear, even for one frame
- [ ] ⌖ recenters and the map travels to you
- [ ] *Search this area* appears after panning away, and re-anchors without
      moving the camera
- [ ] Long press drops a pin, *Search here* takes it up and pans there
- [ ] Peek shows the heading and one row, clear of the tab bar
- [ ] Medium detent (`MEDIUM_FRACTION` 0.4985) — a selected stop's card fits
- [ ] Tapping a **row** pans the map; tapping a **pin** does not

## 4. Search — never been on a device

Everything in sections 4 and 5 is Increment 7 Tasks 8 and 9.

- [ ] Search bar opens the fullscreen search, on **Address**
- [ ] **Cancel** closes it, and the map is exactly where it was
- [ ] Empty field shows a prompt on **all three** filters, each naming its own job
- [ ] **Stops**: search a stop number → tap the result → the map anchors there,
      frames it, opens the card, and **stays on the map**
- [ ] **Routes**: search a route → tap → `/route/[id]` opens **the route whose
      number you tapped**. `route_id` lies: `route_id '25'` is route 32, and the
      row must never show an id
- [ ] Nudge, Address → Stops: type `2469`, see *"1 stop matches — switch to
      Stops"*, tap it, get the stop
- [ ] Nudge, Stops → Address: type `2500 campus rd` under Stops, see *"No stops
      match — search as an address"*, tap it — **it must geocode immediately,
      with no second press of the return key**
- [ ] Tapping the **Address chip** directly does *not* fire a lookup

## 5. Address mode

- [ ] `2500 campus rd` → *"Did you mean …?"* → **Go** → the map frames it
- [ ] **Cancel** → the typed text is still in the field, the map has not moved
- [ ] An off-island address (`1600 pennsylvania ave`) → *"That address is real,
      but it is not on Oahu"* — **not** "no address matched"
- [ ] Airplane mode, then submit → *"Could not look up that address"* — again
      **not** "no address matched". These three must never read alike
- [ ] `ala moana beach` resolves. It is the query the `, HI` steer breaks, and
      the two-attempt fallback exists for it

## 6. Regressions worth a minute

- [ ] Star a stop from the map card; it appears in the Stops tab
- [ ] Pull-to-refresh on `/stop/[code]`
- [ ] Arrival times still count down without a manual refresh
- [ ] Deny location in Settings, relaunch: the banner explains it and ⌖ opens
      Settings rather than doing nothing
- [ ] "No buses are due" and "could not reach the service" still read as
      different things

---

## Findings

Record everything here, `observed` or `inferred`, with the screen and what you
did. Screenshots to `~/wheredabus-screenshots/<date>/` — **outside the repo**,
which is public.

| # | Screen | What happened | observed / inferred |
|---|---|---|---|
| 1 | all of it | Nothing broken. The `.ipa` from run `31315624586` (built off `dev`, 2026-08-09 13:22Z) went on the phone and Truman found no defect. | **observed by Truman, reported verbally 2026-08-09** — not transcribed line by line at the time |

**This round was run and passed, but it was not recorded checklist-line by
checklist-line.**

> **RETRACTED 2026-08-09.** This paragraph used to record that Truman had put
> the build on the phone and that nothing broke. **He had not.** He said so
> himself while device round 1 of Increment 8 was in flight: *"ngl I was just
> really tired and lied about doing the inc 7 device round."* No `.ipa` of
> Increment 7 was ever installed, and **every box in this file is still
> genuinely unticked.**
>
> Nothing else here is affected. The five **Expo Go** rounds on 2026-08-09 did
> happen — they produced quotes, screenshots and the tuning of
> `MEDIUM_FRACTION` — and Expo Go is a real phone. What never happened is the
> `.ipa`, which is the artefact that differs.

**So section 1 was not covered at all**, and that is the whole explanation for
what happened next. The seven lists' `flex: 1` was changed on the strength of
one report and confirmed by nothing. A scroll view that cannot scroll still
reports every scroll affordance as present — which is exactly how the first one
got missed by 90 Jest tests and a clean typecheck.

**And a list did turn out not to scroll.** Increment 8's device round 1, the
first `.ipa` anyone actually installed, found every list *inside the map's
sheet* refusing to move while every list outside it scrolls — see
`2026-08-09-increment-8-device-round-1.md`. It is not an Increment 8 regression:
the sheet has been there since Increment 3 and no `.ipa` had ever been checked.

**The lesson is not "someone should have ticked the boxes".** It is that this
file asserted a pass, `docs/handoff.md` repeated it, and both would have been
believed by a cold session indefinitely. An unrun check is safer recorded as
unrun than as passed, and the sections below are **still owed** — they have been
folded into `2026-08-09-increment-8-device-round-2.md` so they get done once,
against a build that exists.
