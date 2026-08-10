# Spec — Increment 5: the data refreshes itself

**Date:** 2026-08-03, **revised the same day** — see *Revision: keep the floor*
at the end, which reverses one decision, closes two of the open questions, and
records what was deferred on purpose.
**Status:** decided, not started. Increment 4 finishes first, and **a manual
step sits between them** — see *Why this order*.

Decided with Truman on 2026-08-03 in a grilling session that also settled the
two open questions in `2026-08-02-increment-4-own-api-key.md`. Read that spec's
*Settled on 2026-08-03* section alongside this one; they were decided together.

## The goal, in his words

> "The shipped asset goes stale and the app must be able to fix that itself."

Plus: he does not want to run `npm run build:gtfs` and push, ever again.

**What this is not.** A third framing was offered and *rejected*: "I want zero
of my stuff in the binary." That is a purity argument, and rejecting it is what
makes the rest of this spec possible — it is why depending on a GitHub Release
is acceptable, and why an on-device build was not chosen. Do not reintroduce
purity as a requirement; it was considered and set aside deliberately.

## The decision

**A scheduled GitHub Action builds the SQLite asset and publishes it. The app
downloads it. Nothing is bundled in the binary.**

- The repo becomes **public**, so the asset can be fetched without credentials.
- The Action runs **weekly**, and **builds only when the upstream feed has
  actually changed**.
- It publishes `gtfs-v<schema>.db`, then `manifest.json`, to a **fixed release
  tag** — a permanently stable URL, not `latest`.
- The app checks the manifest **on launch, in the background, never blocking**,
  downloads only when the published build is genuinely newer, and verifies
  `sha256` before replacing the database it is using.
- **Settings gets a manual refresh** and a visible "last checked".
- ~~**No `assets/db/gtfs.db` in the repo or the bundle.** First launch downloads
  it, as part of onboarding.~~ **Reversed — the bundled asset stays, as a
  floor.** See *Revision: keep the floor*. Almost every hard problem below was
  a consequence of having no fallback, and the goal never required deleting it.

## Why not the other two options

Three were weighed. The rejected two are recorded because they are the obvious
ideas and will be had again.

**A — the app builds the database itself**, from the raw feed. Download the
12 MB zip, inflate it in JS, parse `stop_times.txt`, write SQLite. No server,
no GitHub, works in ten years if this repo is gone. **Rejected as the wrong
first step, not as a bad idea.**

The cost is not "port the build script" — it is *reimplement* it in a runtime
that fights you. `scripts/build-gtfs` reads whole files into memory and shells
out to `unzip`; on a device you get neither. It needs streaming inflate and a
streaming CSV pass that never holds 73.8 MB as a string, because that is
~150 MB as UTF-16 and iOS will kill the app for it. Feasible — the derivation
needs only three columns and the accumulators are small — but it is the largest
single piece of work available here, and it duplicates logic that already
exists and passes 70 tests.

**It remains the intended endgame.** Truman: "Once we've proven that the app
can work entirely without my constant maintenance, then we can look into
removing the GitHub dependency." And the work here is not thrown away when that
happens: the download, the atomic swap, the schema handshake, the refresh UI
and all its failure states are reused. Only the *source of the bytes* changes.

**B — the app downloads a database Truman publishes by hand.** Cheap on the
device and rejected immediately: it makes him the bottleneck again, which is
half the goal.

**C — a cron publishes it.** Chosen. It gets the actual goal — the asset stops
going stale, and he is not the one who fixes it — for roughly a tenth of A's
work, and keeps the parse in Node where it is already tested.

What C costs, stated plainly: a second network dependency, and if the repo is
deleted the refresh stops. Against an app that already depends on
`api.thebus.org` for every arrival it renders, that was judged acceptable.

## Why this order, and the manual step in the middle

**Increment 4 (the key) → make the repo public, by hand → Increment 5.**

This is not a preference. `EXPO_PUBLIC_` inlines the AppID into every `.ipa`
this project builds. A public repo with CI attached therefore republishes the
key on every build, in extractable form. **Removing the key from the bundle is
what makes the repo safe to open**, and the repo being open is what makes an
unauthenticated download possible.

Checked on 2026-08-03, before any of this:

- Git history is **clean**. `.env` was never committed; `.env.example` ships
  empty; the key appears in no commit.
- **Sixteen live `.ipa` artifacts contained the key. They were deleted.**
- Actions *logs* are safe — the AppID is a repository secret and is masked.

The manual step is a genuine increment boundary: it is not code, no test will
catch it being skipped, and it cannot meaningfully be undone once the repo has
been indexed.

## The schema handshake, and the dead end it avoids

Today the asset ships *with* the binary, so the schema `emit.mjs` writes and
the schema `sql.ts` queries are always in step. After this increment they are
independent — and **there is no bundled asset to fall back to**. An old binary
that downloads a database it cannot read has nothing at all. Not stale data:
nothing. And there is no App Store to push a fix through.

**The version goes in the filename.** The app requests exactly the schema it was
compiled against — `gtfs-v1.db` — so an old binary keeps getting v1 forever and
is never handed a database it cannot read. Changing the schema means bumping to
`gtfs-v2.db` and publishing both for as long as an old binary might be running.
The dead end stops existing rather than being handled.

> **Corrected 2026-08-09, in Increment 9.** The publish-both-forever half of
> that rule is retired. It was reasoning from a premise this project never had:
> there is no App Store, so *nobody* has an old binary except Truman, and he
> installs each `.ipa` himself. Prune the `data` release freely; revisit if
> anyone else ever installs the app.
>
> Two things survive it. The version number itself stays — it is one line, and
> the risk it covers is the opposite of the one described above: **a new binary
> handed old published data**, which passes the hash and the floor and then
> fails at runtime on the table it lacks. And the real requirement is now
> checked rather than proxied — `route_directions` joined `FLOOR_COUNTS` in
> schema v3, so `files.ts` refuses a database of the wrong shape outright
> instead of trusting what its filename claims.

A `schema_version` row goes in the existing `meta` table as a second assertion
after download, and **a test asserts that the version the app expects matches
the version the build emits**. `sql.ts` and `emit.mjs` already have
`node --test` coverage against the real asset, so that has a natural home. The
discipline this requires — bump the constant in two places, leave the old asset
up — is exactly the kind of thing that gets forgotten, which is why it gets a
test rather than a note.

The alternative, versioning *inside* the file, was rejected: the app has already
spent the download to discover the problem, and when it rejects the file there
is still nothing to fall back to. It converts a crash into a clear message, and
the app is still dead.

## The manifest

Published **after** the database, always. A manifest that exists therefore
always describes a database that exists, which makes a half-failed run safe.

```json
{ "schemaVersion": 1, "feedEndDate": "20260822", "builtAt": "…",
  "bytes": 1224704, "sha256": "…" }
```

A `HEAD` on the asset was considered and rejected: it can only ever say *bytes
changed*, never what changed or whether it matters. The manifest lets
`feedValidity.ts` say something **true about data not yet downloaded** — "your
stop data is good through 22 August, and there is a fresher build waiting" —
rather than something inferred. The GitHub Releases API was also rejected: 60
requests/hour unauthenticated, spent to learn what a static file can say.

`sha256` earns its place separately. With no bundled fallback, a truncated
download would replace the only database the app has. Verify, then swap.

## Expiry and republication are different things, and were conflated

Worth keeping, because the confusion is natural and it changes the design.

**Expiry is declared inside the file.** `feed_info.txt` says
`feed_start_date=20260701`, `feed_end_date=20260822` — a **7 week, 3 day**
window, not a month. Fixed, knowable offline, already drives `feedValidity.ts`.

**Republication is an act by the agency** — a new zip at the URL. The current
one was published (HTTP `Last-Modified`) on **2026-06-29**, two days *before*
its own validity window opened. **One observation is not a cadence**, and none
is claimed here. Truman believes it is roughly monthly; the `feed_version`
string `(2605_MidSignup_v10_BusRail_MERGED_Landlines)` supports something
frequent — agencies run three or four "signups" a year and this is at least the
tenth revision within one.

The two are independent. A feed can be replaced long before it expires, and can
expire with nothing to replace it — which is the failure that actually hurts.

**So the cron does not use either number.** It watches whether the published
file has changed, which is a fact rather than an inference, and is therefore
robust to nobody knowing the cadence. `feedEndDate` is carried in the manifest
**for display only** and must never gate a download.

## Measured, so nobody re-derives it

Against the live feed, 2026-08-03:

| | |
|---|---|
| `google_transit.zip` | **11,982,564 bytes** (12.0 MB) |
| `stop_times.txt` | **73,753,231 bytes, 1,419,279 rows** |
| `shapes.txt` | 9,776,110 bytes (not currently used) |
| `trips.txt` | 3,679,349 bytes, 37,678 rows |
| `stops.txt` | 418,491 bytes, 3,847 rows |
| Emitted asset | **1,224,704 bytes** (1.2 MB) |
| Feed URL | `https://www.thebus.org/transitdata/production/google_transit.zip` |

**`routeJSON` cannot substitute for `stop_times.txt`.** It returns
`routeName`, `routeID`, and an array of `{routeNum, shapeID, firstStop,
headsign}` — no ordered stop list, and `firstStop` is prose
(`"KALIHI TRANSIT CENTER (Stop: 4523)"`). There is no API route around the 1.4
million rows. This was checked so it is not checked again.

**A number that does not apply here.** ~200 KB for route geometry is a real
finding, and it is about `shapes.txt` polyline-encoded for a *later* increment.
It says nothing about the cost of rebuilding the feed, and it has already been
misremembered once as evidence that a rebuild is cheap.

## Expo Go survives this

Every module needed is in the SDK 54 **bundled** set, so none of this forces
the slow CI loop — which `CLAUDE.md` treats as a real architectural constraint:

- `expo-file-system` `~19.0.23` — the download
- `expo-crypto` `~15.0.9` — the `sha256`
- `expo-secure-store` `~15.0.8` — Increment 4's key
- `expo-sqlite` `16.0` — already a dependency

If the endgame (option A) is ever built, `fflate` is pure JS and also costs
nothing here.

## Onboarding

Designed for **this** end state, not the intermediate — see Increment 4's spec
for why the softer version was rejected.

> **Superseded by *Revision: keep the floor*.** With the bundled asset kept,
> there is no download step to gate on. Onboarding is `[key]` and stays `[key]`;
> the prerequisite *list* never grows past one, so Increment 4 should build a
> key gate rather than a general list. The paragraph below is preserved because
> its §4 point still applies to the refresh, just not to onboarding.

**Paste key → confirm → download the database → the app works. No key, no app.**

The gate is *a list of unmet prerequisites*, so Increment 4 ships it answering
`[key]` and this increment adds `database` to the list.

The two steps fail for unrelated reasons and **must not render alike**. "Your
key was rejected" is fixed in Settings; "could not fetch the stop data" is
fixed by waiting or retrying. Same §4 rule the arrival board already carries.

## Deliberately open

Not decided, and flagged rather than defaulted into:

- ~~**How the file is swapped while `expo-sqlite` holds it open.**~~ **Closed.**
  It never is. Each build lands at its own filename and a stored pointer moves;
  see *Revision: keep the floor*.
- ~~**What the app does if the versioned asset it asks for has been deleted**~~
  **Closed by the floor.** It keeps using the database it already has and says
  when it was last refreshed.
- **Whether "manifest exists but the asset 404s" needs its own state**, given
  the publish-after ordering is supposed to make it impossible. Still open, and
  now *cheap* to get wrong in only one direction: with a floor underneath, the
  wrong answer is a stale database rather than none.
- **The republication cadence.** Unknown, and the design does not depend on it.

## Not in scope

- Route polylines, live vehicle positions. Unchanged, still later.
- A backend proxy. Truman's stated future direction if this ever goes public —
  his own key behind a server, with a quota increase — which would make the
  per-user key optional again. **Not a reason to soften Increment 4**; that is
  a different app with different economics, and it does not exist.

## Revision: keep the floor

**2026-08-03, later the same day**, from an architecture conversation Truman
asked for before any of this was built. He approved the original plan
"tentatively" and wanted it stress-tested first. It did not survive intact.

### The reversal: `assets/db/gtfs.db` stays in the bundle

The decision above deleted it. That was wrong, and it was wrong in an
instructive way: **almost every hard problem in this spec is a consequence of
having no fallback, not of adding refresh.**

- No fallback → a truncated download destroys the only database → `sha256`
  becomes load-bearing rather than hygiene.
- No fallback → an old binary handed an unreadable schema has *nothing* →
  hence the publish-both-forever discipline. (Retired 2026-08-09; see the
  correction above.)
- No fallback → first launch is dead until a download succeeds → hence the
  download step in onboarding.
- No fallback → "the versioned asset was deleted" needed an answer.

Keep a bundled asset as a **floor** and every one of those degrades to "keep
using what you have". The stated goal is untouched: the cron still builds, the
app still refreshes itself, and **Truman still never runs `npm run build:gtfs`
by hand again**. What changes is that every failure becomes stale data instead
of no data.

The floor does not need refreshing. Its only job is to render a first screen
while a current build downloads, and GTFS stop names and coordinates move
slowly. `feedValidity.ts` already says when it has expired — that mechanism was
built for exactly this and is the reason a stale floor is honest rather than a
lie.

**This is the "purity" argument arriving through a side door.** The spec above
records rejecting *"I want zero of my stuff in the binary"* as a purity
argument — and then deleted the bundled asset anyway. The rejection was aimed
at on-device building; the no-bundle part rode in behind it unexamined.

If committing 1.2 MB per rebuild to git is the real objection — and it is a
fair one — the fix is for `ios-ipa.yml` to fetch the currently published asset
at build time and drop it into `assets/db/`. Bundled in the binary, absent from
git history. **Not in scope now**; noted so it is not rediscovered as a reason
to delete the floor again.

### The separate data repo: raised, and withdrawn

It was argued here that publishing to a **separate public data repo** would let
this repo stay private, severing the whole chain — key removal, the manual
step, the ordering constraint. Truman rejected the premise rather than the
idea: **he wants this repo public.** It was never reluctance about publishing;
the only friction was that publishing requires the key change first.

So *Why this order* above stands unchanged, and the artifacts are published to
a fixed release tag on **this** repo. Recorded because the idea is a natural
one and will be had again — the answer is "he wants it public", not "it does
not work".

### Generation-numbered files and a stored pointer

This closes the swap question, which was the likeliest thing here to fail on a
device and the one no test off a device would catch. **The file is never
swapped, because it is never overwritten.**

- The Action publishes `gtfs-v1-<builtAt>.db`.
- The app downloads to a `.part` file, verifies `sha256`, renames it into place
  under its own generation name.
- It opens that path, moves a stored `currentDbFile` pointer, and releases the
  old handle.
- The previous generation is deleted on the **next** launch, when nothing holds
  it open.

There is no window in which a crash leaves a half-written database, because
nothing writes over a file SQLite has open. This is Capistrano's
`releases/` + `current` symlink, with a stored filename in place of the symlink,
and it rests on `rename(2)` being atomic within a filesystem.

### A floor check the hash cannot give you

`sha256` proves the bytes arrived intact. It says nothing about whether the
build is *correct*. The real failure: the agency publishes a truncated zip, the
cron dutifully builds a forty-stop database, and the checksum matches perfectly.

So a sanity floor — `stops > 3000`, `routes > 100` — runs **in the Action before
publishing**, and again **in the app before the pointer moves**. Cheap in both
places, and it is the only thing standing between a bad upstream feed and a
shipped one.

### Checksum, not signature — as a decision

A `sha256` served from the same place as the artifact protects against
truncation and corruption, **not** against substitution: anyone able to rewrite
the release can rewrite the manifest too. Hash and manifest share one trust
root. HTTPS and GitHub are the provenance; the hash is the integrity check.

That is proportionate here. It is recorded so it reads as a decision rather
than an oversight, and so the next reader knows exactly what was accepted.
`theupdateframework.io` is the canonical writing on what a real update system
defends against; `wiki.debian.org/SecureApt` is the clearest short explanation
of the hash-and-signature chain.

### Deferred on purpose

Truman's instruction: *"Keep the plan as simple as possible. Let's just get it
working with a reasonable architecture. Then we can optimize for and handle
edge cases."* So these are named and **not built**:

- **`ETag` / `If-None-Match` on the manifest.** A ~1 KB weekly fetch is not
  worth optimising yet. MDN's *HTTP conditional requests* and RFC 9110 §13 are
  where to read it up when it is.
- **Signatures.** Above.
- **Backoff, jitter, bad-build blocklists.** Retry once, give up, try next
  launch.
- **Schema v2 migration mechanics.** Ship the constant and the test asserting
  the app's expected version matches what `emit.mjs` writes. Nothing more.
- **Resumable downloads** (1.2 MB) and **staged rollout** (one user). Not
  "later" — never, at this scale.

Two things that *look* deferrable and are not, because they are structural
rather than defensive: **generation + pointer** (retrofitting it means
rewriting the swap) and **`sha256` verification** (about five lines with
`expo-crypto`).

### Further reading on the patterns used here

Asked for by Truman, who had not met most of these before. Kept in the repo so
they survive the session they were found in.

- **Conditional requests / `ETag`** — MDN's *HTTP conditional requests* and
  *ETag* pages; RFC 9110 (*HTTP Semantics*) §8.8.3 and §13 for the authority.
- **Manifests** — no spec, it is a shape. **Sparkle** (`sparkle-project.org`),
  the macOS update framework, is the clearest worked example: its "appcast"
  lists version, URL, length and signature, and the client fetches, compares,
  downloads, verifies, installs. That is this increment, documented.
- **Checksums vs signatures** — `wiki.debian.org/SecureApt` for the clearest
  short explanation of a hash-and-signature chain; `theupdateframework.io` for
  what a real update system defends against.
- **Generation-numbered files + pointer** — Capistrano's `releases/` + `current`
  symlink (`capistranorb.com`) is the canonical instance; `rename(2)`
  (`man7.org/linux/man-pages/man2/rename.2.html`) is the primitive underneath,
  and `sqlite.org/atomiccommit.html` shows how far the idea can be taken.
