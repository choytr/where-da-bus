# Sideloading onto the iPhone

How a build gets from GitHub Actions onto the phone without a Mac and without a
paid Apple Developer account.

CI produces an **unsigned** `.ipa`. Signing happens on-device at install time
using a free Apple ID, which is what makes the no-Mac path possible.

## One-time setup

You only do this once. Follow the
[official SideStore install guide](https://docs.sidestore.io/docs/installation/install)
and its [prerequisites](https://docs.sidestore.io/docs/installation/prerequisites) —
that guide is the authority, and this process changes often enough that anything
written down here goes stale. In outline, on Windows:

1. Install iTunes (Microsoft Store or Apple's site — either works).
2. Install [iloader](https://github.com/nab138/iloader) (MSI recommended).
3. Connect the iPhone by USB, unlock it, and tap **Trust**.
4. In iloader: sign in with your Apple ID, select the device, choose
   **Install SideStore (Stable)**. Use an
   [app-specific password](https://support.apple.com/en-us/HT204397) if you have
   two-factor auth on.
5. On the phone: trust the developer certificate under **VPN & Device
   Management**, enable Developer Mode, and connect **LocalDevVPN** — it must be
   active whenever you install, update, or refresh an app.

iloader handles the pairing file itself; you do not generate one by hand.
Older guides describe doing this with **JitterbugPair**, which SideStore now
lists under
[alternative/outdated instructions](https://docs.sidestore.io/docs/advanced/alternative) —
skip it. A pairing file can expire if the phone is updated or reset, in which
case [replace it with iloader](https://docs.sidestore.io/docs/advanced/pairing-file).

## Installing a build

Repeat this whenever you want the latest code on the phone.

1. Open the [Actions tab](https://github.com/choytr/where-da-bus/actions).
2. Click the most recent green **Build unsigned iOS IPA** run.
3. Download the **app-ipa** artifact. GitHub serves it as a `.zip` containing
   `WhereDaBus.ipa` — about 10 MB for the zip.
4. **Unzip it.** GitHub always wraps an artifact in a zip, even when it holds a
   single file, and SideStore will not accept the zip. Everything below assumes
   the bare `.ipa`.
5. Get the `.ipa` onto the phone — see the next section.
6. Check that **LocalDevVPN is connected** and **Developer Mode is on**. Both,
   every time. See *Before every install* below.
7. In SideStore: **My Apps** → **+** → pick the `.ipa`.

First install takes a couple of minutes while SideStore signs it.

### Getting the file onto the phone, from Windows

Any route that ends with the `.ipa` visible to the iOS Files app works — iCloud
Drive, AirDrop from another device, or downloading it in Safari on the phone.

**The route that has actually held up in practice is iTunes File Sharing**, and
it is the one the README describes:

> iTunes → **File Sharing** → **SideStore** → drag the `.ipa` in → **Sync**.

It is worth knowing why this is the recommended one rather than merely another
option. It needs no cloud round trip for a 10 MB file, it works with no internet
at all, and the file lands *inside SideStore's own documents directory* — which
is the first place its file picker looks, so there is no hunting through Files
afterwards. The alternatives all put the `.ipa` somewhere SideStore has to be
pointed at.

The phone must be connected by USB, unlocked, and already trusted for iTunes to
show File Sharing at all. If **SideStore** does not appear in the app list there,
it is not installed on the phone yet — go back to the one-time setup.

### Before every install

Two things have to be true, and neither announces itself clearly when it is not:

- **LocalDevVPN connected.** SideStore signs and installs through it. Without it
  the install fails rather than degrading.
- **Developer Mode on**, under **Settings → Privacy & Security**.

**Developer Mode is not a checkbox you can tick in advance on a clean phone** —
the toggle only appears once a development-signed app has been installed or the
device has been connected to a development machine, so in practice it shows up
during SideStore's own installation rather than before it. The
[official guide](https://docs.sidestore.io/docs/installation/install) is the
authority on the current sequence; this note exists only so that "the toggle
isn't there yet" reads as expected rather than as a broken step.

## Refreshing versus reinstalling

These are different operations and the difference is a week of nuisance.

- **Refreshing** re-signs the apps already on the phone. It needs LocalDevVPN and
  nothing else — no `.ipa`, no computer, no cable. This is what the 7-day expiry
  actually demands.
- **Reinstalling** is for putting *new code* on the phone, and is the whole
  procedure above.

So the weekly obligation is a refresh, not a reinstall: the README's *"repeat
this every 7 days"* is about keeping the app launchable, and only the refresh
step is required for that. Reinstalling also resets the clock, which is why a
week of active development never runs into the expiry at all.

**What an expired signature looks like:** the app launches and closes
immediately, with no error and no crash log. It is not a bug in the app, and it
is the single most likely explanation for "it worked yesterday".

## After the first install: the app asks for a key

A freshly installed build shows a key screen before any other screen, and no
part of the app works until it is answered. That is by design, not a failure of
the install — **the build carries no API key of its own**, and CI injects none,
so there is nothing extractable from the `.ipa`.

Register an AppID at `api.thebus.org` and paste it in. It is stored in the
keychain, so it survives reinstalling a newer `.ipa` over the top and does not
need re-entering every week. Settings can replace it later.

A key that is rejected says so specifically and sends you to Settings; that is a
different screen from "couldn't reach the service", deliberately, because only
one of the two is worth acting on.

## Free Apple ID limits

These are Apple's constraints on free provisioning, not choices this project made:

| Limit | Consequence |
|---|---|
| 7-day signing expiry | Refresh weekly in SideStore, or the app stops launching |
| 3 sideloaded apps max | SideStore itself counts as one of the three |
| No push notifications | Ruled out for this project regardless |
| 10 app IDs per 7 days | Only relevant if the bundle identifier changes often |

With LocalDevVPN connected, the weekly refresh happens on-device over WiFi, so in
practice it is a notification you dismiss rather than a chore requiring a
computer — see *Refreshing versus reinstalling* above for why that is not the
same as putting the build on again.

## Day-to-day development does not need any of this

Sideloading is only for real installs. Normal iteration runs through **Expo Go**:

```
npm start
```

Scan the QR code with the phone's camera. JavaScript changes reload instantly
over WiFi with no CI, no signing, and no `.ipa`.

The project deliberately restricts itself to modules Expo Go already bundles for
as long as possible, specifically to keep this fast loop available.

## When the pipeline is genuinely needed

- Verifying behaviour Expo Go cannot reproduce
- Any change requiring native modules outside Expo Go's bundled set
- Using the app for real, away from a development machine
