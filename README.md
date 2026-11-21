# Reva

<img src="docs/screenshots/app-icon.png" width="96" align="right">

A private, end-to-end encrypted chat for two people. On the phone it looks like an ordinary utility app
(Calculator, Notes and more). Reva's name never appears on the phone. Everything it uses is free:
Oracle's Always Free server, DuckDNS, Let's Encrypt, Firebase's free push, and your own Google Drive.

## Screenshots

![Setup, chat in Aurora, scientific calculator, theme gallery](docs/screenshots/overview.png)

These are the real screens rendered in a browser at phone size with made-up sample messages. They are not photos
from a phone, so fonts and shadows can differ slightly on a device.

### First run
| Start | Choose your codes |
|---|---|
| <img src="docs/screenshots/setup-role.png" width="260"> | <img src="docs/screenshots/setup-codes.png" width="260"> |

### Chat
Voice notes with a waveform, photos with the time on the picture, a typing bubble, an online dot, quote-jumping,
a jump-to-latest button, and one round button that turns from a microphone into a send arrow as you type.

| Nocturne | Aurora (typing, disappearing on) | Glacier | Lemonade | A new chat |
|---|---|---|---|---|
| <img src="docs/screenshots/chat-nocturne.png" width="170"> | <img src="docs/screenshots/chat-aurora.png" width="170"> | <img src="docs/screenshots/chat-glacier.png" width="170"> | <img src="docs/screenshots/chat-lemonade.png" width="170"> | <img src="docs/screenshots/chat-empty.png" width="170"> |

### Days together, photo albums and stickers
| Our days (shared with your partner) | Photos and albums | Stickers | A sticker in the chat |
|---|---|---|---|
| <img src="docs/screenshots/days.png" width="170"> | <img src="docs/screenshots/photos.png" width="170"> | <img src="docs/screenshots/stickers.png" width="170"> | <img src="docs/screenshots/chat-sticker.png" width="170"> |

### Voice calls (dressed up as a clock)
| Someone calls: a ringing alarm | In a call: a timer |
|---|---|
| <img src="docs/screenshots/call-alarm.png" width="220"> | <img src="docs/screenshots/call-timer.png" width="220"> |

### 33 themes
The same chat in twelve of them:

![The same chat in twelve themes](docs/screenshots/theme-wall.png)

| Theme gallery | The whole gallery |
|---|---|
| <img src="docs/screenshots/themes-top.png" width="260"> | <img src="docs/screenshots/theme-gallery-full.png" width="260"> |

Dark: Nocturne, Midnight, Ember, Pine Night, Plum, Abyss, Graphite, Neon, Aurora, Cherry Night, Cobalt, Moss, Dusk, Galaxy.
Light: Monstera, Swell, Rosewater, Matcha, Lilac, Sand, Candy, Paper, Sky, Citrus, Peach, Mint, Butter, Periwinkle,
Coral Reef, Blossom, Glacier, Lemonade, Dawn. Plus **Auto**, which follows your phone, and an accent colour you can
lay over any of them.

### The calculator disguise
| Everyday | Scientific (sin, cos, tan, ln, log, powers, brackets, memory, history) |
|---|---|
| <img src="docs/screenshots/calc.png" width="260"> | <img src="docs/screenshots/calc-sci.png" width="260"> |

### Settings and tools
| Settings (grouped cards, profile at the top) | Backup and restore | Import a WhatsApp chat |
|---|---|---|
| <img src="docs/screenshots/settings-full.png" width="220"> | <img src="docs/screenshots/backup.png" width="220"> | <img src="docs/screenshots/import.png" width="220"> |

| Shared notes | Starred messages | The Notes disguise |
|---|---|---|
| <img src="docs/screenshots/shared-notes.png" width="220"> | <img src="docs/screenshots/starred.png" width="220"> | <img src="docs/screenshots/notes.png" width="220"> |

To make them again: `cd app && EXPO_PUBLIC_PREVIEW=1 npx expo export --platform web`, serve the output folder, and open
`?screen=chat&theme=aurora` (other screens: `settings`, `themes`, `calc` with `&sci=1&expr=...`, `notes`, `setup`,
`setupcodes`, `starred`, `sharednotes`, `import`, `backup`).

## Features

**Chat**
- Real-time text, sent / delivered / read ticks, typing indicator, instant reconnect after a network change
- Offline queue: messages written without signal go out by themselves, in order, even after the app restarts
- Swipe to reply, reactions, edit and delete for both, search
- Pinned messages (shown at the top), starred messages (private to your phone, with their own list)
- Disappearing messages: off, 1 hour, 1 day or 1 week
- **Days together**: set the day you started once and both phones count the same days. A ring shows progress to the next
  milestone (50, 100, 200 ... 1000 and on), the years-months-days, and the next anniversary. "Day N" shows in the chat header.
- **Photo albums**: every photo in one grid, plus albums you and your partner make together ("Trips", "Us"). Press and
  hold a photo to choose its albums.
- **Stickers**: 40 stickers in four packs (Love, Daily, Moods, Fun). They take the colours of your theme, and only a tiny
  id is sent, so they cost no data.
- **Photos and Camera buttons right in the message box** (like WhatsApp; they step aside while you type)
- Quick "thinking of you" heart
- **Voice calls** (the phone button in the chat header). An incoming call shows as a ringing **alarm**: **Snooze** answers,
  **Off** declines. A call in progress looks like a **timer** with Mute, Speaker and Stop. The sound goes phone to phone
  (WebRTC, encrypted); when the networks do not allow that, it goes through your own free relay (coturn) on the server.
  Calls end up as a line in the chat ("Voice call 2:31", "Missed voice call"). A call keeps going when you leave the app or lock
  the screen (a plain "Timer · Running" notification shows while it lasts), and a call offer wakes the other phone with a
  plain "Alarm: Tap to open" notification when push is set up.
- Voice notes (up to 2 minutes), encrypted like everything else
- Pictures from the gallery or camera: shrunk, location removed, encrypted on the phone, pinch-to-zoom viewer,
  an explicit **Save to gallery** button (default off, switchable), and **view once**
- Shared notes you both see and edit (newest edit wins)
- Day separators, grouped bubbles, animated typing dots
- WhatsApp-style ticks on every message you send: one grey tick = sent, two grey = delivered, two **blue** = read
- Easy replies: swipe a message to the right (a reply arrow appears, the phone buzzes at the right spot) or press and hold,
  and the keyboard opens at once with a clear "Replying to ..." bar above the box

**Bring your old chat**
- **Import a WhatsApp chat** from "Export chat" (text, or zip with photos). Handles Android and iPhone layouts,
  12 and 24 hour clocks, day-first and month-first dates. Importing twice makes no duplicates.
- The import is **synced to your partner's phone** (encrypted, in small batches). If both of you import the same
  chat, it lines up and nothing doubles.
- **Export** your chat back to a text file.

**Disguise**
- The calculator is a real one: brackets, powers, roots, factorial, sin/cos/tan in degrees or radians, ln and log, π and e,
  memory keys and a history list.
- Two fully working disguises (Calculator, Notes) and six more icons and names: Clock, Weather, Files, Compass,
  Calendar, Music. Switch any time in Settings. Add more in `app/config/disguises.js`.
- Your own home-screen shortcut with any name and picture.
- Open with a code: Calculator, code then `=`. Notes, code in the search box (or as a note title).
- **Fingerprint unlock** as an extra way in (Settings, Security): hold the `=` key on the calculator, or the "Notes" title in
  the Notes disguise, and touch the sensor. Fingerprint only (no phone PIN fallback), and the prompt just says "Confirm".
  Anyone whose fingerprint is saved on the phone can use it, so turn it on only if that suits you.
- A decoy code opens a fake empty chat. An optional wipe code erases the phone.
- Locks itself when you leave. The recent-apps picture is hidden (Android 13 and newer; older phones shield the window
  while the app is not in front). **Screenshots are allowed** (so you can share your pairing code), except while a **view-once**
  picture is open: those cannot be captured.

**Look**
- Soft "clay" style, smooth fades with no bounce, big headline type.
- **Theme gallery**: 33 themes (dark and light) with live previews, an Auto mode, and an accent colour you can
  lay over any of them. Every theme is built from a few base colours and checked by an automatic contrast test.
- The design is checked in a real browser: `EXPO_PUBLIC_PREVIEW=1 npx expo export --platform web` builds a preview
  of the real screens with sample data (not part of the phone app).

**First install, wipe and setup**
- On first install the icon and name are **"Reva"** and the app opens straight into setup. Once setup is done
  the launcher switches to your chosen disguise (Calculator by default).
- After a **wipe** the app is a plain Calculator again and shows nothing about itself. To set up again, hold the `=`
  key for about 1.5 seconds (Notes disguise: type `::setup` in the search box and press search).
- Android's back button goes back one screen. Opening the photo picker, camera or file picker does not lock the app.
- Five wrong codes in a row make the app ignore codes for a while (30 seconds, then longer).

**No cover mode**
- Turn the disguise off in Settings and the app opens straight into the chat, named **Reva**, with its own icon (two chat
  bubbles and a heart).

**Safety of your data**
- Updates keep your messages: the app only ever adds to its database (there is a test for this), and updates
  are signed with the same key. You must keep that key. Without it Android refuses to install updates over the app.
- **Backup to Google Drive**: one encrypted file (messages, notes, keys, optionally pictures) protected by your
  passphrase, saved to Drive through the phone's Share menu. **Restore** from the first setup screen or Settings.
- The server also makes an encrypted daily copy of its own database.

**Notifications**
- Free push through Firebase. The notification is only a plain "Calculator: Tap to open". No names, no text.
  See `docs/PUSH-SETUP.md`.

**Updates**
- Settings has a **Check for updates** button that downloads a newer app from your own server.

## Security design

- libsodium-compatible crypto. Each phone has one 32-byte secret; signing and encryption keys come from it.
- Messages use `crypto_box`-style encryption (X25519 + XSalsa20-Poly1305). Typing, receipts, edits, deletes,
  reactions, pictures and voice notes are all inside the encrypted envelope. The server sees only sizes and timing.
- Phones log in by signing a fresh challenge with their device key. No passwords.
- Exactly two device keys are ever accepted. Pairing is by QR code on both phones (camera or gallery picture).
- The phone's database is encrypted (SQLCipher); keys live in the Android Keystore-backed secure store.
  Passcodes are stored only as slow salted hashes.
- Failed logins are rate limited and blocked. No analytics. No message content in any log.
- Compare the **safety number** in Settings on both phones. If it differs, the pairing was tampered with.

## Folders

| Folder | What it is |
|---|---|
| `shared/` | Encryption, wire format and the connection engine (offline queue, reconnect). |
| `server/` | Node.js + TypeScript relay: WebSocket, SQLite, rate limiting, push, backups. |
| `app/` | React Native (Expo) Android app. |
| `app/config/disguises.js` | The list of disguises. |
| `app/plugins/withDisguise.js`, `app/modules/disguise/` | Launcher icon and name switching, home-screen shortcut, save to gallery. |
| `deploy/` | Docker, Caddy (HTTPS), the one-command installer, update publishing, backup restore, laptop test. |
| `tools/` | Maven mirror for flaky networks, server bundle maker, Oracle server creation script. |
| `docs/` | `SERVER-SETUP.md` (Oracle, step by step), `PUSH-SETUP.md` (free notifications), `ORACLE-ON-PI.md` (getting the Oracle server using a Raspberry Pi). |

## Tests

```bash
cd server && npm install && npm test        # encryption, two-device delivery, offline queue, reconnect,
                                            # pictures through the server, backups, push, update downloads
cd app && npm install && npx tsx --test test/*.test.ts
                                            # calculator, WhatsApp parser, phone crypto vs real libsodium,
                                            # backup file, database upgrade keeps old messages
```

## Build the Android app

```bash
cd app && npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

If Maven Central answers `429`/`404` at random, start the mirror first:
`NODE_USE_ENV_PROXY=1 node tools/maven-mirror.mjs 8899 &` and add `-I ../../tools/mirror.init.gradle`.

For push, put your Firebase `google-services.json` in `app/` (it is git-ignored) before building.
Release builds are signed with a private key kept **outside** this repository.

## Honest status

Voice calls are new and have **not been tried on two real phones yet** (the background call service and the alarm wake-up are untested too): the call logic is tested with fake connections, and the
relay login is tested, but the real audio, the microphone, the speaker switch and the relay need a real test.
Calls need the Oracle security list to allow **UDP 3478, TCP 3478 and UDP 49160-49200** (see `docs/SERVER-SETUP.md`).

Tested by automated tests: encryption, pairing rules, delivery, receipts, offline queue, reconnect,
large pictures through the server, backup file, push wake-up (against a fake Firebase), the WhatsApp parser,
the database upgrade, the phone crypto against real libsodium.

Written and built, but only checked by hand on a phone as far as you have tried them: the screens, QR scanning,
launcher icon switching, screenshot blocking, the update installer, picture and voice handling, backup
and restore, import of a real WhatsApp export, push on a real phone. Android launchers can take a few seconds
to show a new icon or name after switching.

## Server hosting notes

- Runs in its own Docker container with its own database, secrets and subdomain, sharing nothing with other apps.
- Oracle Always Free servers can be reclaimed when idle. Upgrade the Oracle account to Pay As You Go while staying
  inside the free limits, set a $1 budget alert, and keep copies of anything important off the server.
