# Reva

A private, end-to-end encrypted chat for two people. On the phone it looks like an ordinary
utility app (Calculator, Notes, and more). Reva's name never appears on the phone.



## How it works

- **Two phones, one server.** The phones make their own keys. The server only passes
  encrypted blobs between them and cannot read messages.
- **Pairing once, by QR code.** The first phone registers with a setup code, then shows a QR code.
  The second phone scans it (camera or a picture from the gallery), registers, and shows a reply
  QR code that the first phone scans. After two phones, registration closes for good.
- **Disguise.** The app opens as a Calculator or a Notes app. Typing your secret code
  (Calculator: code, then `=`; Notes: code in the search box) opens the chat.
  A decoy code opens an empty fake chat. An optional wipe code erases the phone.
- **Locks itself** when you leave the app. Screenshots, screen recording and the recent-apps
  picture are blocked while anything private is on screen.
- **Changeable look.** Three colour themes (Nocturne, Monstera, Swell) plus Auto, a soft
  "clay" style, and the launcher name and icon can be switched in Settings.
- **Check for updates** button in Settings: downloads a newer app file from your own server.

## Folders

| Folder | What it is |
|---|---|
| `shared/` | Encryption, wire format and the connection engine (offline queue, reconnect). Used by both the app and the tests. |
| `server/` | Node.js + TypeScript relay: WebSocket, SQLite, rate limiting. No message content is ever logged. |
| `app/` | React Native (Expo) Android app, TypeScript. |
| `app/config/disguises.js` | The list of disguises (name, icon, which app opens). Add one here and rebuild. |
| `app/plugins/withDisguise.js` | Turns that list into Android launcher entries (activity-alias). |
| `app/modules/disguise/` | Small native module that switches the launcher entry and adds home-screen shortcuts. |
| `tools/` | Helpers for building where Maven Central is unreliable (retrying local mirror). |

## Security design

- libsodium everywhere. Each phone has one 32-byte secret seed; signing and encryption keys are derived from it.
- Messages: `crypto_box` (X25519 + XSalsa20-Poly1305), a fresh nonce each time. Typing signals, receipts,
  edits, deletes and reactions are encrypted too, so the server sees only sizes and timing.
- Login to the server: the phone signs a fresh challenge with its device key. No passwords.
- The server accepts exactly two device keys, then refuses everyone else. Failed logins are rate limited and blocked.
- On the phone: chat database encrypted with SQLCipher, key kept in the Android Keystore-backed secure store.
  Passcodes are stored only as salted slow hashes.
- No analytics, no trackers.
- Both people can compare the **safety number** in Settings; if it differs, the pairing was tampered with.

## Run the tests

```bash
cd server && npm install && npm test        # encryption, two-device delivery, offline queue, reconnect
cd app && npm install && npx tsx --test test/calc.test.ts   # calculator engine
```

## Build the Android app

```bash
cd app && npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

If Maven Central answers `429`/`404` at random, start the mirror first:

```bash
NODE_USE_ENV_PROXY=1 node tools/maven-mirror.mjs 8899 &
./gradlew -I ../../tools/mirror.init.gradle assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Release builds are signed with a private key that lives **outside** this repository.
Updates must be signed with the same key, or Android will refuse to install them.

## Honest status (MVP)

Working and tested by automated tests: encryption, pairing rules, two-device delivery,
read receipts, offline queue, reconnect, calculator engine.

Written but **not yet tested on a real phone**: the screens, QR scanning, launcher icon switching,
screenshot blocking, the update installer. Android launchers can take a few seconds to show a new
icon or name after switching.

Not built yet: sending pictures, voice notes, disappearing messages, pinned messages,
push notifications, daily encrypted server backup, the one-command server installer.

## Server hosting notes

- Runs in its own Docker container with its own database, secrets and subdomain, sharing nothing with other apps.
- Oracle Always Free servers can be reclaimed when idle. Upgrade the Oracle account to Pay As You Go
  while staying inside the free limits, set a $1 budget alert, and keep copies of anything important
  off the server.
