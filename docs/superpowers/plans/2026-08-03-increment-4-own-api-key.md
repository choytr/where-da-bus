# Plan — Increment 4: each user brings their own API key

Contracts, not code. Spec: `../specs/2026-08-02-increment-4-own-api-key.md`,
**including both revision sections at the end** — the second one shrinks the
onboarding gate and revives a premise the first one killed.

Executed **inline**, in order, on `dev`. Review once at the end, on the whole
diff. Device-verify before asking to merge.

Every `render`/`renderHook`/`rerender`/`unmount` is awaited — see `CLAUDE.md`.
No type assertions.

**One new dependency:** `npx expo install expo-secure-store` (SDK 54 bundled
set, so the Expo Go loop is untouched). Run `npm ci` after, not just
`npm install` — see `CLAUDE.md`.

**The simplification that shapes this plan.** The spec worries about "no key"
being a fourth state *everywhere data appears*. It is not: a hard gate above the
navigator means no screen ever mounts without a key. So —

- **"No key" is a gate**, handled once, in `AppShell`.
- **"Key rejected" is a failure kind**, handled in the §4 state model that
  already exists.

Nothing threads a fourth state through the screens.

---

## 0. What the API says when the AppID is wrong

> **Done, 2026-08-03.** Written up in `docs/api/README.md` under *What a
> rejected AppID looks like*. The answer, and the two things it changed:
>
> - `arrivalsJSON` → HTTP 200, `application/json`,
>   `{"errorMessage": "Invalid or unspecified API key"}` with a trailing
>   `\r\n`. **Never a 401 or 403** — TheBusLive's status-code mapping confirmed
>   inapplicable, as the plan suspected.
> - **A well-formed-but-unregistered GUID, a garbage string, an empty `key=`
>   and an absent `key` are byte-identical.** So the wording in task 4 cannot
>   distinguish "mistyped" from "deleted after six months", which is exactly
>   the case the spec says the wording must reach. One message, no branching.
> - **The message is per-endpoint**: `routeJSON` says
>   `"Application key was not found"`. Nothing in the app calls `routeJSON`
>   today, but a matcher written against the arrivals string alone is a trap
>   the moment something does — task 4 matches both.
> - **Parameters are validated before the key.** A bad `stop` masks a bad key
>   entirely. Harmless here (stop codes come from GTFS), and one more reason
>   the gate does not validate at onboarding.
>
> Unrelated correction found while probing: the `headsign=` form of `routeJSON`
> 500s for every non-empty value, with a valid key too. Unused by the app.

- Investigation, no code. `docs/api/README.md` gets the finding.
- Call `arrivals` against the live API with a deliberately invalid AppID and
  **record the verbatim response** — status, `content-type`, body.
- The README states this endpoint reports failures as **HTTP 200**, so the
  status code is not expected to carry it. TheBusLive's 401/403 mapping is a
  *different API's* behaviour and must not be assumed here.
- **Task 4 cannot be written until this is known.** Do not guess the body and
  do not infer it from the PDFs — this is exactly the "reading laundered into a
  claim" failure this project has recorded twice.
- Mark the finding in the README as *observed against the live API on
  2026-08-03*, matching how that file already distinguishes its claims.

## 1. Key storage

- `data/storage/apiKey.ts` (new), `data/storage/__tests__/apiKey.test.ts` (new)
- `loadApiKey(): Promise<string | null>`, `saveApiKey(key: string): Promise<void>`,
  `clearApiKey(): Promise<void>`, and `apiKeyStorage: ApiKeyStorage` — the same
  shape as `themeStorage`, for the same reason
- Over `expo-secure-store`, key `thebus.appId.v1`. Default accessibility;
  `requireAuthentication` stays **off** (it would prompt).
- `loadApiKey` **never throws** — an unreadable keychain reads as `null`, the
  same forgiving shape as `loadThemePreference` and `loadFavorites`
- A blank or whitespace-only key is stored as nothing: `saveApiKey('  ')`
  clears. "Set to empty" and "not set" must not be two states.
- Tests: `returns null when nothing is stored`; `round-trips a key`;
  `returns null when the keychain throws`; `clears on a blank key`

## 2. The client becomes reconstructible

- `data/thebus/provider.tsx` (new), `data/thebus/__tests__/provider.test.tsx` (new)
- `<TheBusProvider storage={apiKeyStorage}>` and
  `useTheBus(): { client: TheBusClient | null; key: string | null; loading: boolean; setKey; clearKey }`
- **`useTheBus` throws without a provider**, deliberately — same call as
  `useTheme`, guarded by an assertion in `App.test.tsx` rather than by hope
- **Storage arrives as a prop.** Importing `data/storage/apiKey.ts` from this
  module would put a native module in the graph of every screen that asks for
  arrivals — the coupling `lib/legal.ts` and `ThemeProvider` both exist to
  break. The edge runs storage → provider, never back.
- The client is `useMemo(() => withCache(createTheBusClient({ appId: key })), [key])`.
  **This is what clears the cache on a key change** — the spec flags
  `withCache` being keyed by stop code alone as a trap, and a new client per key
  means a new cache per key, so the trap closes for free rather than needing a
  `clear()` method. Say so in the comment; it will look accidental otherwise.
- `client` is `null` exactly when there is no key. Nothing downstream sees that,
  because of task 5.
- Tests: `builds no client before a key is loaded`; `builds a client once a key
  is stored`; `builds a new client when the key changes`; `throws without a
  provider`

## 3. Retire the module-level singleton

- `data/thebus/index.ts`, `data/thebus/client.ts`, `features/arrivals/board.ts`,
  `features/arrivals/ArrivalsScreen.tsx`, `features/map/StopCard.tsx`, and every
  existing test that passes a client
- Delete `export const theBus` and `appIdFromEnv`. Export `TheBusProvider` /
  `useTheBus` from the barrel.
- `useArrivalBoard(stopCode, client)` — the parameter stops being optional and
  stops defaulting. Hosts read it from `useTheBus()`.
- Existing tests already pass their own client, so most change by deleting a
  default rather than by gaining a mock. **Any test that relied on the default
  was silently using the environment**; make it explicit.
- No behaviour change is intended here. A green suite is the verification.

## 4. `unauthorized` is a failure kind

- `data/thebus/types.ts`, `data/thebus/parse.ts`,
  `data/thebus/__tests__/parse.test.ts`, `features/arrivals/BoardHeader.tsx`
- Add `| { readonly kind: 'unauthorized' }` to `ArrivalsFailure`
- `parseArrivals` recognises it **from the body observed in task 0**, not from a
  status code
- **Match both vendor strings**, not just the arrivals one — task 0 found the
  message is per-endpoint (`"Invalid or unspecified API key"` on `arrivalsJSON`,
  `"Application key was not found"` on `routeJSON`). Recognise on a normalised
  substring test over both, so the check does not depend on casing or framing;
  the error body is serialised differently from the success body and the README
  says not to rely on that framing.
- Everything else with an `errorMessage` stays `kind: 'api'`. `"Invalid or
  unspecified stop ID"` and `"Unspecified API error"` are *not* key problems,
  and task 0 found they are what a bad key returns when a parameter is also
  wrong — so a looser match would mislabel a parameter bug as a rejected key.
- The wording cannot distinguish a mistyped key from one deleted after six
  months of inactivity; task 0 proved those are byte-identical. One message.
- Wording, following TheBusLive: *"Your API key was rejected. Check it in
  Settings."* — and it must not render like `unreachable`. Different cause,
  different fix, different text.
- The six-month inactivity deletion means this is also what a *returning* user
  sees, so the wording cannot assume the key was never right.
- Tests: `reports unauthorized for a rejected key`; `does not report
  unauthorized for a service outage`

## 5. The gate

- `features/onboarding/KeyGate.tsx` (new), `features/onboarding/__tests__/` (new),
  `AppShell.tsx`
- `<KeyGate>{children}</KeyGate>` sits **inside** `TheBusProvider` and outside
  the router, beside `DatabaseGate`. No key → onboarding. Key → `children`.
- **A key gate, not a prerequisite list.** The spec's list abstraction was
  written for a second item that Increment 5's revision removed. One item, no
  generalisation.
- Onboarding content: what the app needs and why, a link to
  `https://api.thebus.org/NewAccount/`, a paste field, a save control. It says
  the key is stored on the device and never sent anywhere but the transit API.
- **It does not validate the key.** Validation is a network round-trip that can
  fail for reasons that are not the key's fault; the arrival board already
  distinguishes those, and task 4 gives it the wording. Save, proceed, let the
  first real request tell the truth.
- `loading` renders nothing — the keychain read is fast, and a flash of
  onboarding for a user who has a key is worse than a blank frame.
- Tests: `shows onboarding when no key is stored`; `renders the app once a key
  is stored`; `stores a pasted key`; `trims whitespace from a pasted key`

## 6. Settings

- `features/settings/SettingsScreen.tsx`, its existing test file
- A new `API KEY` section above `STOP DATA`, matching the existing section shape
- Shows the key **masked**, with a reveal toggle; a control to replace it and
  one to clear it. Clearing returns the app to the gate — that is the confirm
  path, so it needs a confirmation.
- A line stating the six-month inactivity deletion, and the registration link
- Tests: `masks the stored key`; `reveals the key on request`; `clearing the key
  returns to onboarding`

## 7. The key leaves the build

- `.env.example`, `README.md`, `.github/workflows/ios-ipa.yml`, `CLAUDE.md`,
  `docs/handoff.md`
- Delete `EXPO_PUBLIC_THEBUS_APP_ID` from all of them, including the
  workflow-level `env:` block and the guard at `ios-ipa.yml:55` that fails the
  build when it is absent
- **The repository secret stays until the build is verified**, then is deleted
  by hand. Deleting it first turns a rollback into a re-registration.
- `CLAUDE.md`'s environment notes and the handoff's "one lesson worth carrying
  forward" both describe the `EXPO_PUBLIC_` tradeoff as live. Rewrite them to
  say it *was* live and what replaced it — the lesson about values reaching the
  app through the environment is still true and must not be deleted with the
  variable.
- **This is the task that makes the repo safe to make public.** Nothing here
  ships until `.ipa` verification passes.

---

## Verification

`npm test`, `npm run test:scripts`, `npm run typecheck`, then `npm ci`
because task 0 adds a dependency.

Then the part that is not optional: **build an `.ipa` off `dev`
(`gh workflow run ios-ipa.yml --ref dev`), sideload it, and check that a fresh
install with no key reaches onboarding rather than a broken arrival board.**
This increment changes what happens on first launch, and Expo Go carries a
`.env` that a real install will not. That is precisely the disagreement between
the two loops this project has already been bitten by once.

## After this, before Increment 5

Make `choytr/where-da-bus` public, by hand. Not code, no test will catch it
being skipped, and it cannot be undone once indexed. See Increment 5's spec.
