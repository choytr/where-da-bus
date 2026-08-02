# Handoff

**A living document.** It says where the project is right now and what the next
session picks up. Update it at the end of a session rather than writing fresh
instructions each time — that is the whole point of it existing.

Last updated: **2026-08-02**, end of the Increment 2 build session.
Everything below was true on branch `dev`, with all three suites green:
**179 Jest, 70 `node --test`, clean typecheck, expo-doctor 18/18.**

**Work happens on `dev` now.** Truman created it so changes can reach GitHub
without triggering the macOS `.ipa` build. Commit and push there freely;
**merging to `main` needs his explicit permission.** `tests.yml` was extended
to run on `dev` too — "no build" must not mean "no tests", and that trigger
caught a real break within one commit of being added.

---

## Read these first, in this order

1. **`CLAUDE.md`** — the traps, written down so they are not re-derived from
   source every session. The safe-area provider, timer handles, the two test
   runners, the legal constants, the SDK ceiling, and — new in Increment 2 —
   that **React Native Testing Library 14 is async and fails silently** when a
   `render`/`renderHook` is not awaited.
2. **`docs/superpowers/specs/2026-07-29-wheredabus-design.md`** — scope and
   sequencing, the source of truth for what belongs in which increment.
3. **`docs/api/README.md`** — the live API, verified against the vendor PDFs.
   It marks which claims are vendor quotes and which are readings of a single
   example. **Re-confirm the readings against the live API, not the PDFs.**
4. **`docs/backlog.md`** — known defects, triaged and deliberately deferred.

Do not re-read the API PDFs to re-derive what the README already records. That
was done once, deliberately, and the README exists so it is not done again.

## Where the project is

Increment 1 shipped nearby stops, search, favorites and the routes serving each
stop, all offline. **Increment 2 is built and its code is on `dev`**: live
arrivals per stop with the §4 state model, and route detail with an ordered
stop list. What remains is device verification — see the top of the next
section.

Run all three — `npm test`, `npm run test:scripts`, `npm run typecheck` —
before claiming anything works. A change to the database layer needs both test
commands, for the reason CLAUDE.md gives. **Also run `npm ci` after touching
dependencies**: `npm install` tolerates a peer conflict that `npm ci` refuses,
so the tree can be entirely green while every clean install fails.

**The SDK is pinned to 54 and this is not negotiable.** Expo Go on iOS 18 tops
out there, and the fast loop is the whole development model. Install with
`npx expo install`, never bare `npm install <pkg>`. Never run
`npm audit fix --force`. The 12 outstanding audit advisories are all in the web
build and prebuild toolchains, none reach the device, and they have been
triaged — do not "fix" them.

## What to pick up first

**Verify Increment 2 on the phone.** This is the one thing not done, and it is
the thing this project does not cut. `gh workflow run ios-ipa.yml --ref dev`
builds without merging. What to look at, in rough order of risk:

1. **The safe area on the two new screens.** They are the first screens with
   the stack's native header, and the header is what handles the top inset now
   — `index` keeps `headerShown: false` because HomeScreen draws its own. This
   is exactly the class of bug that nine review rounds and 90 tests missed last
   time, and it cannot be seen anywhere but on a device.
2. **Tapping a stop, then a route, then back.** The back swipe comes from the
   native stack; nothing under Jest exercises it.
3. **An arrival board at a real stop.** Whether "Scheduled — no bus tracking
   yet" reads right when it is 23 of 25 rows, which is the normal case.
4. **Backgrounding and returning.** The poll stops and refetches immediately;
   the age line should jump.

Then review the whole diff at the increment boundary, per CLAUDE.md, and put
what is not worth fixing into `docs/backlog.md` — Increment 2's deferrals are
already there under "Increment 2 — deferred".

## What Increment 2 built

- **`data/thebus/`** — `TheBusClient` and its network implementation, with
  `parse.ts` and `time.ts` as pure, separately tested pieces. Fixtures are real
  captured responses, not hand-written; the vendor documentation is wrong in
  two places that matter.
- **`features/arrivals/`** — the board: one chronological list sectioned by
  direction, matching the discontinued DaBus app. `useArrivals` owns the §4
  state model; `format.ts` is pure and takes `now` as an argument.
- **`features/routes/`** — route detail, entirely offline from `route_stops`.
- **expo-router** — Truman's call over React Navigation. `AppShell.tsx` keeps
  the old `App.tsx` body and takes children, so `app/_layout.tsx` is ten lines
  and the safe-area provider did not have to be re-derived.

The AppID lives in `.env` as `EXPO_PUBLIC_THEBUS_APP_ID` (see `.env.example`).
`EXPO_PUBLIC_` means it ships inside the bundle and is extractable from the
`.ipa` — an accepted, documented tradeoff, not an oversight to fix.

### Settled, and now implemented

- **Poll interval is 60s**, paused when backgrounded, refetching immediately on
  return. Timer handles go through `lib/schedule.ts`, which hands back a
  canceller so the `NodeJS.Timeout` trap cannot be expressed.
- **`vehicle:driver` is an employee number.** Never display, log, or persist it.
  Nothing reads the vehicle endpoint today, and it is XML-only if anything ever
  does.
- **Loading, data-with-age, and error-with-last-known-values are three distinct
  states**, and `useArrivals` is where that is enforced.

### Was blocking — all settled 2026-08-01

Probed live against the API, ~200 requests against a 250,000/day quota. Full
detail with sample sizes is in `docs/api/README.md`; do not re-probe.

1. **HTTPS works.** `https://api.thebus.org` serves every endpoint, valid
   GoDaddy wildcard cert. **No `NSExceptionDomains` entry, no native config
   change, no CI loop.** The cert expires 2026-10-25 — if it lapses un-renewed,
   this reopens with no code change on our side.
2. **Errors are HTTP 200 with `{"errorMessage": "…"}`** and no `stop`/`timestamp`
   key. An empty stop is `arrivals: []` *with* both keys. Cleanly separable,
   which is what the §4 state model needed. Never branch on `res.ok`.
3. **`adherence` is in minutes.** 30 live values, all integers, −19…+4.

Two things the probe turned up that nobody had thought to ask, and both change
the implementation:

- **`estimated` emits an undocumented `"2"` — 96% of all arrivals.** The vendor
  sheets document only `0` and `1`. Real-time is `estimated === "1"`;
  everything else is schedule-only. Testing `=== "0"` would render 1,225 of
  1,269 sampled schedule guesses as live GPS estimates.
- **`vehicleJSON` does not exist** — 404s with an HTML page, in every form. The
  vehicle endpoint is XML-only. Increment 2 does not need it: `arrivalsJSON`
  already carries route, headsign, direction, time and position. `adherence` is
  the only field unique to it, and it is not worth an XML parser yet.

Also: one request in ~63 timed out with no error. The client needs an explicit
timeout and a retry — this host drops requests.

## How to work here

`CLAUDE.md` has the full version under "How work gets done here". The short
form, learned from Increment 1 costing more in process than in implementation:

- **Plans specify contracts, not code.** Files touched, exported signature, test
  names, decisions already settled. Ten lines per task, not two hundred.
- **Execute inline.** Do not dispatch subagents for the sequential tasks of one
  increment — they share a data model and each cold spawn re-derives it.
  Subagents earn their cost when the deliverable is a conclusion, not a file.
- **Review once, at the increment boundary, on the whole diff.** Everything not
  worth fixing goes to `docs/backlog.md`; that triage is the point.
- **Verify on the device before merging.** This is what does not get cut. Nine
  review rounds, 90 tests and a clean typecheck all missed that `SafeAreaView`
  had no provider and the search field rendered under the Dynamic Island.
  `gh workflow run ios-ipa.yml --ref <branch>` builds without merging.

## Environment notes that are not obvious

- Development is Windows/WSL2, no Mac, no paid Apple Developer account. iOS
  builds run only on GitHub Actions; `/ios` and `/android` are prebuild output
  and must never be committed or hand-edited.
- **WSL is in mirrored networking mode** (`%UserProfile%\.wslconfig`) so Expo Go
  on a physical iPhone can reach Metro. A Hyper-V firewall rule named
  `ExpoGo8081` allows inbound TCP 8081. Without both, Metro binds an address the
  phone cannot route to. If Expo Go stops connecting, check those before
  suspecting the app.
- The API PDFs need `node scripts/pdf-text.mjs <file>` to read; `Read` cannot.
  It breaks lines mid-word, so pipe through `tr -d '\n'` to grep for a phrase.

## Truman writes code here too

He is learning Expo on this project, and `ffc7190` / `037c7c0` are his — the
keyboard handling on the stops list. Do not silently rewrite his work or hand
him finished code for something he has said he wants to do himself. Review it
like anyone's, say what you find, and leave the fix to him unless he asks.

That review's two findings are fixed in `ecc84ed`. A third — the scroll
indicator's top offset — is **parked deliberately** in `docs/backlog.md` with a
full record of what was eliminated. It is cosmetic, it predates the keyboard
work, and it may not exist outside Expo Go. Do not reopen it unasked.

**A caution that generalises.** That review also produced a finding that was
simply wrong — that the scroll indicator ran under the home indicator. It had
been reasoned from the code, never observed, and one look at the device
disproved it. There is no simulator here and no device; anything about how the
app *looks* is inference until Truman confirms it. Say which of the two you are
doing, and do not launder a reading of the source into a claim about the screen.
