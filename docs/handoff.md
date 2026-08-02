# Handoff

**A living document.** It says where the project is right now and what the next
session picks up. Update it at the end of a session rather than writing a fresh
dated file each time — that is the whole point of it existing.

Last updated: **2026-08-02**, at the close of Increment 2.

**Everything durable is already in the repo.** This document exists only to
carry what a transcript would otherwise lose. Read the repo docs first; they are
the source of truth.

## Read these, in this order

1. `CLAUDE.md` — the traps. Updated this session.
2. `docs/superpowers/specs/2026-07-29-wheredabus-design.md` — scope and sequencing.
3. `docs/api/README.md` — the live API, verified against the vendor PDFs *and*
   against the live API on 2026-08-01. It marks which claims are vendor quotes
   and which are readings of a single example. Do not re-read the PDFs to
   re-derive what the README already records; that was done once, deliberately.
4. `docs/backlog.md` — triaged defects, including an "Increment 2 — deferred"
   section written at this increment's boundary.

## Where things stand

**Increment 2 is complete, verified on a physical iPhone, and merged.**
`origin/main` and `dev` are both at `67dd266`. Live arrivals per stop with the
§4 state model, and route detail with an ordered stop list.

Green: 179 Jest, 70 `node --test`, clean typecheck, expo-doctor 18/18.

The twelve commits from `ffa69e9` to `67dd266` carry full reasoning in their
messages. Read those rather than asking for a summary of what changed.

## Decisions made this session that are NOT obvious from the diff

- **expo-router over React Navigation** — Truman's call, after being shown that
  expo-router is a file-based layer *over* React Navigation rather than a
  separate engine. He chose the restructure knowing it cost an entry-point
  change.
- **Arrival board layout** — Truman supplied a screenshot of the discontinued
  DaBus app and asked for its shape: one chronological list, sectioned by
  direction. Live sampling backed it (79% of stops serve one direction).
- **`Scheduled · no GPS`** — his wording preference, shortened from a longer
  phrase because it appears on ~23 of 25 rows.
- **The scroll-indicator inset is deliberately parked.** He was reminded of it,
  reconsidered, and said explicitly: keep ignoring it. **Do not reopen it.**
  It has now misled three separate investigations; `docs/backlog.md` records
  what was ruled out and a correction made this session.

## Working agreement with Truman

- Work on `dev`, push freely. **Merging to `main` needs his explicit
  permission every time** — a push to `main` triggers the macOS `.ipa` build.
- He drives largely from his phone and prefers autonomous execution — do the
  work, report honestly, ask only when an answer changes what you would build.

### Truman writes code here too

He is learning Expo on this project, and `ffc7190` / `037c7c0` are his — the
keyboard handling on the stops list. Do not silently rewrite his work or hand
him finished code for something he has said he wants to do himself. Review it
like anyone's, say what you find, and leave the fix to him unless he asks.

**A caution that generalises.** That review produced a finding that was simply
wrong — that the scroll indicator ran under the home indicator. It had been
reasoned from the code, never observed, and one look at the device disproved it.
There is no simulator here and no device on this side; anything about how the
app *looks* is inference until Truman confirms it. Say which of the two you are
doing, and do not launder a reading of the source into a claim about the screen.

## The one lesson worth carrying forward

**Expo Go and the `.ipa` can disagree, and Expo Go is the more forgiving of
the two.** `.env` is gitignored; CI had no AppID; every `.ipa` shipped an empty
`EXPO_PUBLIC_THEBUS_APP_ID` and failed every arrivals request on device. 179
tests, a clean typecheck, expo-doctor, a successful build and Expo Go all said
fine. Any value reaching the app through the environment has this shape.
`ios-ipa.yml` now reads it from a repository secret and guards against absence.

A second, smaller one: `dev` was added to `tests.yml` this session and caught a
`react-dom` peer conflict within one commit — three pushes had already gone up
red, invisible locally because `npm install` tolerates what `npm ci` refuses.
**Run `npm ci` after touching dependencies.**

## What to pick up next

1. **Palette cleanup** — six files (`AppShell`, `HomeScreen`, `StopRow`,
   `ArrivalRow`, `ArrivalsScreen`, `RouteScreen`) each carry their own
   `useColorScheme` and their own copy of the same hex. Increment 2 doubled it.
   The top structural item in the backlog, and cheaper before a seventh screen
   exists — the map will want those colours too.
2. **Increment 3, the map.** Two things need settling before code:
   `shapes.txt` is not in the bundled asset and the build never reads it (it is
   9.8 MB raw against a ~1.2 MB asset, so how much survives is a design fork);
   and the design spec requires a feed-refresh path before shapes are used,
   because shapes go stale in a way stop names do not. Today a rebuild is
   `npm run build:gtfs` plus a commit of the regenerated asset.
   `react-native-maps@1.20.1` **is** bundled in Expo Go SDK 54 — confirmed in
   `node_modules/expo/bundledNativeModules.json`, no longer an open question.

Truman also raised running `/grill-me` to flesh out the project's remaining
unknown specs. If that has happened, its output supersedes the sequencing above.

## Suggested skills

- **`superpowers:brainstorming`** — before any Increment 3 design work. The
  `shapes.txt` budget question is a genuine design fork, not an implementation
  detail.
- **`superpowers:writing-plans`** — after brainstorming, and note `CLAUDE.md`'s
  rule: plans specify contracts, not code. Ten lines per task.
- **`superpowers:test-driven-development`** — the parsing and geometry work in
  Increment 3 is exactly the pure logic this project TDDs.
- **`superpowers:systematic-debugging`** — if anything about the *appearance*
  of the app comes up. This project has repeatedly produced confident wrong
  claims by reasoning from source instead of observing a device.
- **`simplify`** — a good fit for the palette cleanup specifically.
- **Not `superpowers:dispatching-parallel-agents` or
  `subagent-driven-development`.** `CLAUDE.md` is explicit: execute inline, and
  review once at the increment boundary. Increment 1 cost more in process than
  in implementation and the project corrected for it.

## Environment notes

- Windows/WSL2, no Mac, no paid Apple Developer account. iOS builds run only on
  GitHub Actions. `/ios` and `/android` are prebuild output and must never be
  committed or hand-edited.
- The AppID lives in `.env` locally and in a GitHub repository secret for CI.
  **Not reproduced here.** `EXPO_PUBLIC_` means it ships inside the bundle and
  is extractable from the `.ipa` — a documented, accepted tradeoff.
- SDK pinned to 54 by the Expo Go ceiling. Install with `npx expo install`,
  never bare `npm install <pkg>`, never `npm audit fix --force`. The 12
  outstanding audit advisories are all in the web build and prebuild toolchains,
  none reach the device, and they have been triaged — do not "fix" them.
- **WSL is in mirrored networking mode** (`%UserProfile%\.wslconfig`) so Expo Go
  on a physical iPhone can reach Metro, and a Hyper-V firewall rule named
  `ExpoGo8081` allows inbound TCP 8081. Without both, Metro binds an address the
  phone cannot route to. If Expo Go stops connecting, check those before
  suspecting the app.
- The API PDFs need `node scripts/pdf-text.mjs <file>` to read; `Read` cannot.
  It breaks lines mid-word, so pipe through `tr -d '\n'` to grep for a phrase.
