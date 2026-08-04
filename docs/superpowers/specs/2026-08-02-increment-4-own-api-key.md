# Spec — Increment 4: each user brings their own API key

**Date:** 2026-08-02, **amended 2026-08-03** — see *Settled on 2026-08-03* at
the end, which closes both of the open questions below and kills one of this
spec's premises. **Amended again later on 2026-08-03** — see *Revision: the
floor comes back* at the very end, which revives one of those killed premises
and simplifies the onboarding gate.
**Status:** decided, not started. Increment 3 is finished and merged. **This is
the increment being built next.**

**This is now the first of two increments**, not one. Increment 5
(`2026-08-03-increment-5-self-refreshing-data.md`) teaches the app to fetch a
freshly built GTFS asset for itself — ~~and removes the bundled one~~ **keeping
the bundled one as a floor**, revised later on 2026-08-03. **The order is
load-bearing and one step of it is manual** — see that spec's *Why this order*
section before starting either.

## The decision

**The bundled AppID goes away. Every install registers its own key and pastes it
into Settings, and the app does nothing useful until it has one.**

Truman's call, made on 2026-08-02 after being shown both options. His reasoning,
in his words: virtually every app has a registration wall, needing an API key
registration is fine, and he is going to be close to the only user for a long
time anyway.

The alternative was an **optional override** — bundled key stays as the default,
a pasted key takes precedence. It was recommended here on the grounds that it is
a fraction of the work and keeps the first run frictionless. It was rejected on
the grounds above, and that rejection is the decision. Do not reopen it by
rediscovering that mandatory is more work; that was known when it was chosen.

## What this buys

Three things, and they are the reason it is worth the onboarding cost:

- **The quota stops being a shared resource.** The limit is 250,000 requests per
  day *per AppID*. One key across every install means roughly 170 concurrent
  open arrival boards at a 60-second poll before saturation — see
  `2026-08-02-thebuslive-comparison.md`, which is where the number comes from
  and where the same design is documented in a shipped app.
- **The extractable-key tradeoff disappears.** `EXPO_PUBLIC_` inlines the AppID
  into the bundle, where anyone with the `.ipa` can read it. That has been an
  accepted, documented tradeoff. With no bundled key there is nothing to
  extract.
- **Revocability stops being fatal.** `CLAUDE.md` records that the licence is
  revocable and that nothing guarantees the API keeps answering. A key the user
  owns and can replace is the difference between a broken app and one that needs
  a new key pasted in.

## What it costs, and where the work actually is

**It is not a text field in Settings.** Three things carry the weight:

### 1. `theBus` cannot stay a module-level singleton

Today:

```ts
export const theBus = withCache(createTheBusClient({ appId: appIdFromEnv() }));
```

Built at import time from an environment variable that cannot change while the
app runs. A key the user can edit means the client has to be reconstructible —
either a provider the screens read, or a client that resolves the key per
request rather than at construction.

This is why the work waits for Increment 3 rather than being slipped into it:
tasks 9 and 10 build the map's inline arrivals on top of this exact object.
Doing the key first would mean restructuring it, building on it, and restructuring
it again.

`withCache` has a related question that must not be missed: **its cache is keyed
by stop code alone.** Changing the key must clear it, or the first thirty seconds
after a fix still serve results fetched with the broken key.

### 2. A fourth state, everywhere data appears

`CLAUDE.md` is explicit that arrival views distinguish loading, data-with-age,
and error-with-last-known. **"No key yet" is a fourth, and it is not an error.**
"You have not set up a key" and "couldn't reach the service" must not render
alike — that ambiguity is precisely what the §4 rules exist to prevent, and it
is worse here because the two have completely different fixes.

There is a fifth, and the live API makes it cheap to get wrong: **a key that is
present but rejected.** `docs/api/README.md` records that this endpoint returns
failures as HTTP 200, so "your key is wrong" has to be recognised from the body,
not from a status code. TheBusLive maps 401/403 to "API key is invalid or
expired. Update it in Settings." — good wording, but reached through a status
code path that this API may not take.

### 3. Onboarding, and honesty about what it demands

Registration is at `https://api.thebus.org/NewAccount/`, needs an email address,
and — per the vendor page — **the AppID is deleted after six months of
inactivity.** That last part means a returning user can find a working install
has stopped working, which the "no key" state has to be able to explain.

Settings needs the field, a link out to registration, and a way to clear the
key. TheBusLive uses a `SecureField` with a reveal toggle; worth copying.

## Sequencing note

> **Resolved 2026-08-03.** This goes first, feed refresh becomes Increment 5,
> and they are no longer "unrelated" — the ordering constraint in *Settled on
> 2026-08-03* above is real and one step of it is manual.
>
> The "dated forcing function" below was also overstated and Truman said so.
> `feed_end_date` passing means a banner appears, for an audience of one who
> knows why. It is not a deadline. The real fix is Increment 5, and if that
> lands the manual rebuild never happens again.

The design spec has Increment 4 as **feed refresh**. This does not replace that;
it is a second candidate for the slot and they are unrelated. Which goes first is
open. Feed refresh has a dated forcing function — `feed_end_date` is `20260822`,
after which the app starts calling itself stale — and this one does not.

## Not settled

> **Both settled on 2026-08-03.** Kept here with their answers rather than
> deleted, because the second one was answered by *destroying its premise* and
> that is worth seeing.

- ~~Whether the key lives in `AsyncStorage` alongside the other preferences or
  in the keychain.~~ **`expo-secure-store`.** The argument for not caring —
  "it is currently shipped in a bundle anyone can read" — was an argument about
  the world *before* this increment. Storing a credential in plaintext
  immediately after removing it from the binary undoes part of what the
  increment buys. The usual objection, a new dependency, does not apply:
  `expo-secure-store` is in the SDK 54 bundled set, so the Expo Go fast loop is
  untouched. Default accessibility is "unlocked device" and prompts for
  nothing; `requireAuthentication` stays off.

- ~~What the app does on first launch … **search and favorites could keep
  working without a key** while only arrivals are gated. That is a genuinely
  nice property and worth designing around.~~ **That property no longer
  exists.** It rested on the bundled GTFS asset, and Increment 5 deletes it. A
  first launch after that has no key *and* no database, so there is nothing for
  search to search.

  **Onboarding is therefore a hard gate, designed for the end state:** paste
  key → confirm → (Increment 5 adds: download the database) → the app works. No
  key, no app. Truman's call, 2026-08-03.

  > **Superseded later on 2026-08-03.** Increment 5 keeps the bundled asset as
  > a floor, so the list never grows past one item. **Build a key gate, not a
  > general prerequisite list** — the abstraction below is now paying for a
  > second item that will not arrive.

  It is built as *a list of unmet prerequisites*, not as a key-shaped screen.
  In Increment 4 the list is `[key]`; in Increment 5 it becomes
  `[key, database]`. That is an item added to a list rather than a rebuild,
  which is what makes designing for the end state cheap now rather than
  expensive later.

  **Do not rebuild the soft gate.** A future reader will notice that search and
  favorites *could* work without a key and that this would be nicer. It was
  noticed, and it is only true while an asset ships in the binary. Building it
  in Increment 4 would mean deleting it in Increment 5.

## Settled on 2026-08-03

From a grilling session with Truman that also produced Increment 5. The
decisions there that reach back into this one:

- **This increment goes first**, before the repo is made public and before any
  of the data work. The reason is not preference. Every `.ipa` this project
  builds contains the AppID, because `EXPO_PUBLIC_` inlines it — so a public
  repo with CI attached republishes the key on every build. Removing the key
  from the bundle is what makes the repo safe to open. **Sixteen `.ipa`
  artifacts carrying the key were deleted on 2026-08-03**, and the git history
  was checked and is clean: `.env` was never committed and the key appears in
  no commit.
- **The onboarding download in Increment 5 does not need the key.** GitHub does
  not care about an AppID. The two setup steps therefore fail for entirely
  unrelated reasons and must not render alike — "your key was rejected" and
  "could not fetch the stop data" have different fixes. This is the same §4
  discipline the arrival board already carries, on a new surface.
- **The six-month inactivity deletion has a consequence for the fourth state.**
  The vendor deletes an AppID after six months of inactivity, so "no key" must
  be able to explain a key that *used to work*, not only one that was never
  set. A returning user meets a working install that has stopped working, and
  the wording has to reach them.

## Revision: the floor comes back

**2026-08-03, later the same day.** Increment 5 was revised to **keep the
bundled `assets/db/gtfs.db` as a floor** rather than deleting it — see that
spec's *Revision: keep the floor*. Two consequences reach back into this one.

### The onboarding gate is a key gate, and stays one

The *Not settled* section above designed onboarding as a **list of unmet
prerequisites** so that Increment 5 could add `database` to it. With the floor
kept, there is no download to gate on and the list never gets a second item.

**Build a key gate.** No list abstraction, no generalisation for an item that
is not coming. This is smaller than what was specced, not larger.

### A dead premise is alive again, and it is now purely Truman's call

The second *Not settled* question was answered by destroying its premise:
search and favorites could not work without a key, because Increment 5 would
leave a first launch with no database to search. **That is no longer true.** The
floor means the GTFS database is present from the first launch, forever.

So the **soft gate is technically possible again** — arrivals gated on a key,
search and favorites working without one. It is flagged here rather than
quietly decided, because the argument that killed it is gone.

**The recommendation is to keep the hard gate anyway**, and it has nothing to
do with the old reasoning:

- Truman chose "no key, no app" on 2026-08-03 as a product call, before the
  database argument was ever raised. That call stands on its own.
- A soft gate is **more** work, not less — two coherent app states instead of
  one, and every data surface has to decide which it is in. His instruction for
  these increments was to keep them as simple as possible.

What changed is only *why*: the hard gate now rests on his preference and on
simplicity, not on a technical impossibility. If he ever wants the soft gate,
nothing in the architecture prevents it.

## The realtime feed question, answered so it is not re-searched

Asked on 2026-08-03: does OTS publish a GTFS-Realtime feed that would make the
HEA AppID unnecessary? **One exists, and it does not help.**

Per Transitland (`f-thebus~hi~rt`), TheBus realtime is served by **Swiftly**, a
commercial vendor:

- `https://api.goswift.ly/real-time/thebus/gtfs-rt-vehicle-positions`
- `https://api.goswift.ly/real-time/thebus/gtfs-rt-trip-updates`

It requires an `Authorization` header with a Swiftly-issued key, requested
through a form, free for public feeds. Three reasons it was set aside:

1. **It trades one key for another.** The registration wall does not go away,
   so this increment is needed either way.
2. **It is a whole-system feed.** Every trip's predictions in one protobuf,
   filtered client-side. That suits a server ingesting once and serving many;
   HEA's per-stop query is the better shape for a phone with no backend. The
   proprietary API is, ironically, the more appropriate one here.
3. **Trip updates are typically delays against the scheduled timetable**, so
   turning them into "next bus in 4 minutes" needs the scheduled stop times —
   the 73.8 MB `stop_times.txt` this project deliberately never ships.
   Adopting it would force the full timetable into the asset.

**Unverified:** the Swiftly licence was read via a summarising fetch of
`goswift.ly/api-license`, not line by line. It appears to permit distributing
an integration to end users while forbidding exposure of the standalone API.
Read it directly before relying on it. Flagged as a reading, per this project's
rule about not laundering inference into fact.

Worth knowing for later: if a backend is ever built, Swiftly + GTFS-RT is the
more standard and more durable source than HEA.
