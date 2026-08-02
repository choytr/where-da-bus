# Handoff

**A living document.** It says where the project is right now and what the next
session picks up. Update it at the end of a session rather than writing fresh
instructions each time — that is the whole point of it existing.

Last updated: **2026-08-02**, end of the post-Increment-1 cleanup session.
Everything below was true at commit `b01cf14`, with all three suites green:
90 Jest, 63 `node --test`, clean typecheck, expo-doctor 18/18.

---

## Read these first, in this order

1. **`CLAUDE.md`** — the traps, written down so they are not re-derived from
   source every session. The safe-area provider, the `number`-not-`NodeJS.Timeout`
   rule, the two test runners, the legal constants, and the SDK ceiling.
2. **`docs/superpowers/specs/2026-07-29-wheredabus-design.md`** — scope and
   sequencing, the source of truth for what belongs in which increment.
3. **`docs/api/README.md`** — the live API, verified against the vendor PDFs.
   It marks which claims are vendor quotes and which are readings of a single
   example. **Re-confirm the readings against the live API, not the PDFs.**
4. **`docs/backlog.md`** — known defects, triaged and deliberately deferred.

Do not re-read the API PDFs to re-derive what the README already records. That
was done once, deliberately, and the README exists so it is not done again.

## Where the project is

Increment 1 shipped: nearby stops by distance, search by name and stop number,
favorites, and the routes serving each stop — all on bundled static GTFS data,
no network. Its review is closed; everything not fixed is in `docs/backlog.md`.

Green as of the last commit: **90 Jest tests, 63 `node --test` tests, clean
typecheck, expo-doctor 18/18.** Run all three — `npm test`, `npm run
test:scripts`, `npm run typecheck` — before claiming anything works. A change to
the database layer needs both test commands, for the reason CLAUDE.md gives.

**The SDK is pinned to 54 and this is not negotiable.** Expo Go on iOS 18 tops
out there, and the fast loop is the whole development model. Install with
`npx expo install`, never bare `npm install <pkg>`. Never run
`npm audit fix --force`. The 12 outstanding audit advisories are all in the web
build and prebuild toolchains, none reach the device, and they have been
triaged — do not "fix" them.

## What Increment 2 is

Per the design spec: **live arrivals per stop**, with the §4 state model, and
**route detail with an ordered stop list**. It is the first increment that
touches the network.

Two directories that do not exist yet:

- **`data/thebus/`** — the `TheBusClient` interface and its network
  implementation. UI code never touches a raw API response. The vendor JSON is
  string-typed throughout, disagrees with its own field tables in three places,
  and uses `"0"` and `"???"` as sentinels, so the mapping into app types is real
  work and it belongs here rather than in a screen.
- **`features/arrivals/`** — the arrival board.

The AppID lives in `.env` as `EXPO_PUBLIC_THEBUS_APP_ID` (see `.env.example`).
It is already set locally. `EXPO_PUBLIC_` means it ships inside the bundle and
is extractable from the `.ipa` — an accepted, documented tradeoff, not an
oversight to fix.

### Settled already

- **Poll interval is 60s**, paused when backgrounded. Buses report position
  about once a minute, so a shorter interval doubles request volume for
  identical payloads. The handle is typed `number` — see CLAUDE.md, this one
  typechecks clean and then fails at runtime if you get it wrong.
- **`vehicle:driver` is an employee number.** Never display, log, or persist it.
- **Loading, data-with-age, and error-with-last-known-values are three distinct
  states.** A spinner never replaces cached data; show stale times with an
  explicit age. "No buses coming" and "couldn't reach TheBus" must never render
  alike. `HomeScreen`'s existing notice constants are the pattern to follow.

### Open, and blocking

Both need settling empirically against the live API before the arrival board is
designed. Neither can be answered from the PDFs — they have already been read.

1. **The documented base URL is `http://`, with no HTTPS endpoint anywhere.**
   iOS App Transport Security blocks cleartext, so a plain `fetch` works in Node
   and fails on device. Try `https://` first. If that fails, a host-scoped
   `NSExceptionDomains` entry is a native config change through `app.json`, and
   it rides the slow CI loop.
2. **Error and empty-result shapes are undocumented.** Only the field name
   `errorMessage` is specified — no example, no HTTP status contract, and no
   statement of what a stop with no upcoming buses returns. The app must tell
   those apart, so this is a real blocker rather than a detail.

Also worth confirming while you are there: **`adherence`'s unit is a guess.**
Minutes is the obvious reading of `"-5"` and is nowhere stated. Rendering
seconds as "5 minutes late" is wrong in a way a rider notices.

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
