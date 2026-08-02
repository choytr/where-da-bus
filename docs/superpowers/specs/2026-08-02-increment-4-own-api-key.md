# Spec — Increment 4: each user brings their own API key

**Date:** 2026-08-02
**Status:** decided, not started. Increment 3 finishes first.

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

The design spec has Increment 4 as **feed refresh**. This does not replace that;
it is a second candidate for the slot and they are unrelated. Which goes first is
open. Feed refresh has a dated forcing function — `feed_end_date` is `20260822`,
after which the app starts calling itself stale — and this one does not.

## Not settled

- Whether the key lives in `AsyncStorage` alongside the other preferences or in
  the keychain. It is a personal API credential, not a secret protecting anyone
  else, and it is currently shipped in a bundle anyone can read — so this is a
  smaller question than it looks, but it should be asked once rather than
  defaulted into.
- What the app does on first launch. A blocking setup screen and a Settings
  deep-link from an empty state are both defensible; the Stops tab already
  works entirely offline against the bundled GTFS asset, which means **search
  and favorites could keep working without a key** while only arrivals are
  gated. That is a genuinely nice property and worth designing around rather
  than blocking the whole app on launch.
