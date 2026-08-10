# 🛠️ Contributing & Operations

How work moves through this repo — issues, branches, labels, PRs — lives in
[CONTRIBUTING-PROCESS.md](CONTRIBUTING-PROCESS.md). This file is how to *run* it.

The design of the thing you are changing is in [ARCHITECTURE.md](ARCHITECTURE.md).
Read the first section before writing anything that renders a number.

---

## Prerequisites

| | |
|---|---|
| Node | 20+ |
| Xcode | 16+ with an iOS simulator, or a device and an Apple ID |
| CocoaPods | `sudo gem install cocoapods` |
| A Firebase project | the same one the web app uses |

Expo Go is **not** enough. Plaid Link, Google sign-in, `expo-local-authentication`
and `expo-document-picker` are native modules.

---

## Installation

```bash
git clone https://github.com/BhuvaneswarMarreddy/cashflow-mobile.git
cd cashflow-mobile
npm install
cp .env.example .env          # then fill it in — see below
```

You also need `GoogleService-Info.plist` in the repo root. Both it and `.env` are
gitignored:

```bash
npx firebase apps:sdkconfig IOS <appId> --out GoogleService-Info.plist
```

---

## Environment variables

Every value in `.env.example` is `EXPO_PUBLIC_*`, which means Metro **inlines it into
the bundle** at build time. None of them are secrets: Firebase client config and an
iOS OAuth client id ship inside every copy of the binary and are public by design.
Access is controlled by `firestore.rules` and the callables' own auth guards, never
by hiding these values.

The real secrets — Plaid, OpenAI — live in Secret Manager and are only ever read
server-side, in `cashflow-forecast`.

A change to `.env` needs a restart: `npx expo start -c`.

---

## Development

```bash
npx expo prebuild -p ios      # generates ios/ — required after any native change
npm run ios                   # build + install + launch
npm start                     # Metro on its own, for a JS-only reload loop
```

**JS changes reload. Native changes do not.** Adding a native module, a config plugin
or an `app.json` key means `prebuild` and a full rebuild. A reload after a native
change shows you the old binary and tells you nothing — this has cost real debugging
time here more than once.

Two device gotchas that are not obvious:

- **`ip.txt` is baked in at build time.** The app finds Metro at the LAN address your
  Mac had when you built it. A DHCP lease change breaks it. `expo-dev-client` is
  installed so you can type the URL instead of rebuilding.
- **Open `ios/Cashflow.xcworkspace`, never `ios/Cashflow.xcodeproj`.** With CocoaPods
  the project alone cannot see the Pods, and the failure surfaces as
  `SwiftGeneratePch emitted errors` — which names neither the cause nor the fix.

---

## Testing

```bash
npm run verify        # typecheck → lint → tests. Run this before every commit.
npm test              # jest
npm run typecheck     # tsc --noEmit, strict
npm run lint          # eslint
```

`npm run verify` is the gate. It is not the whole gate — see
[§7 of the process doc](CONTRIBUTING-PROCESS.md): tests run in jsdom and cannot see
layout, gestures or native modules. Anything visual gets opened on a device.

Tests keep `ENABLE_MOCK_API` on so no suite can reach the network, and so the eleven
scenarios stay exercisable. Flip it in **More → Settings → Developer** to reproduce an
empty account, a failed refresh or a negative balance on demand.

---

## Reading logs from a running app

Metro's terminal receives every `console` line from the device, and this app's logger
writes structured, redacted entries there:

```
INF data ▸ snapshot.fetched  {"accounts": 9, "activity": 200, "durationMs": 991}
WRN data ▸ banks.sync_failed {"code": "ITEM_LOGIN_REQUIRED"}
```

Counts, codes and durations — never an amount, a title or a merchant. Paste them into
an issue freely.

`xcrun devicectl device process launch --console` gives you native stdout only; React
Native sends JS logs to Metro over a websocket, so the JS lines are not there.

---

## Coding conventions

- **Money is integer cents.** No float ever holds a balance. Formatting to dollars
  happens once, in `src/utils/format.ts`.
- **A number that cannot be backed is `null`, never `0`.** Screens must render the
  absent case as absent.
- **No hex literals outside `src/theme/palette.ts`.** Lint enforces the boundary.
- **Every string goes through `AppText`**, every amount through `AmountText`.
- **No `console.*`** — `no-console` is an error. Use `loggerFor(scope)`.
- Screens and components may not import from `src/mocks/*`; lint enforces that too.
- Comments explain *why*, especially where the obvious thing is wrong. The codebase
  is full of them because most of these decisions cost something to learn.

---

## Pull requests

Use the template. It asks for evidence, and on this repo evidence includes the screen
you looked at, not only a green suite.

Branch names, labels and the closing keyword are in
[CONTRIBUTING-PROCESS.md](CONTRIBUTING-PROCESS.md).

---

## License

See [LICENSE](LICENSE) if present; otherwise all rights reserved by the owner.
