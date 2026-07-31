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
   `WhereDaBus.ipa`.
4. Get the `.ipa` onto the phone — iCloud Drive, AirDrop from another device, or
   a direct download in Safari on the phone all work.
5. In SideStore: **My Apps** → **+** → pick the `.ipa`.

First install takes a couple of minutes while SideStore signs it.

## Free Apple ID limits

These are Apple's constraints on free provisioning, not choices this project made:

| Limit | Consequence |
|---|---|
| 7-day signing expiry | Refresh weekly in SideStore, or the app stops launching |
| 3 sideloaded apps max | SideStore itself counts as one of the three |
| No push notifications | Ruled out for this project regardless |
| 10 app IDs per 7 days | Only relevant if the bundle identifier changes often |

With LocalDevVPN connected, the weekly refresh happens on-device over WiFi, so in
practice it is a notification you dismiss rather than a chore requiring a computer.

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
