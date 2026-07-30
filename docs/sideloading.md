# Sideloading onto the iPhone

How a build gets from GitHub Actions onto the phone without a Mac and without a
paid Apple Developer account.

CI produces an **unsigned** `.ipa`. Signing happens on-device at install time
using a free Apple ID, which is what makes the no-Mac path possible.

## One-time setup

You only do this once. Budget 30–45 minutes; most of it is waiting.

### 1. Generate a pairing file (Windows)

SideStore needs a pairing file to talk to the phone.

1. Install [iTunes from Apple's site](https://www.apple.com/itunes/download/win32) —
   **not** the Microsoft Store version. The Store version does not expose the
   drivers the pairing tool needs.
2. Download `jitterbugpair.exe` from the
   [JitterbugPair releases](https://github.com/osy/Jitterbug/releases).
3. Connect the iPhone by USB, unlock it, and tap **Trust**.
4. Run `jitterbugpair.exe`. It writes a `.mobiledevicepairing` file next to itself.

### 2. Install SideStore

Follow the [official SideStore install guide](https://docs.sidestore.io/docs/installation/).
In outline:

1. Install SideStore's `.ipa` onto the phone using
   [idevicerestore/AltServer](https://docs.sidestore.io/docs/installation/) as
   the guide directs.
2. Open SideStore, import the pairing file from step 1.
3. Sign in with your Apple ID. Use an
   [app-specific password](https://support.apple.com/en-us/HT204397) if you have
   two-factor auth on.
4. Enable **StosVPN** when prompted. SideStore needs it to refresh apps on-device
   over WiFi, with no computer involved.

## Installing a build

Repeat this whenever you want the latest code on the phone.

1. Open the [Actions tab](https://github.com/choytr/new-the-bus/actions).
2. Click the most recent green **Build unsigned iOS IPA** run.
3. Download the **TheBusOahu-ipa** artifact. GitHub serves it as a `.zip`
   containing `TheBusOahu.ipa`.
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

StosVPN makes the weekly refresh a background on-device operation, so in practice
it is a notification you dismiss rather than a chore requiring a computer.

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
