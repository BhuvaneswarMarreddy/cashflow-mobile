# Cashflow — mobile

A React Native (Expo) client for [Cashflow](https://github.com/BhuvaneswarMarreddy/cashflow-forecast),
a personal finance app. It reads real balances, imports statements, connects
banks through Plaid and reviews unexplained credits.

**It computes no money itself.** Firestore stores no balances — an account's
current balance is derived in memory from its opening anchor plus its
transactions — so this client asks the server for finished figures rather than
re-deriving them. A second implementation of that maths would be a second
opinion about someone's money. Every number arrives as integer cents from a
callable that runs the *same* `src/lib/**` functions the web app runs.

The mock data layer is still here, behind `ENABLE_MOCK_API` in the developer
panel: eleven scenarios (empty account, failed refresh, negative balance,
offline) that real data will not reproduce on demand.

The seam where data comes from is a single file: `src/data/index.ts`.

## Run it

```bash
cp .env.example .env      # fill in the Firebase values
npm install
npx expo prebuild -p ios  # native project; Plaid, Google sign-in and Face ID are native modules
npm run ios               # build onto a simulator or a connected device
```

**A development build, not Expo Go.** Plaid Link, Google sign-in,
`expo-local-authentication` and `expo-document-picker` are native modules, so
Expo Go cannot load them. `expo-dev-client` is installed, which matters more
than it sounds: without it the only way the app can find Metro is the LAN
address frozen into the binary at build time, so a DHCP lease change means a
rebuild. With it you can type the URL.

On iOS you also need `NSLocalNetworkUsageDescription` (already in `app.json`) —
without it iOS silently denies the local network and the app never reaches
Metro at all.

|                                   |                                                       |
| --------------------------------- | ----------------------------------------------------- |
| `npm start`                       | Metro + QR code for Expo Go                           |
| `npm run ios` / `npm run android` | open in a simulator/emulator                          |
| `npm run verify`                  | typecheck → lint → tests (run this before committing) |
| `npm test`                        | jest (175 tests)                                      |
| `npm run typecheck`               | `tsc --noEmit`, strict                                |
| `npm run lint`                    | eslint                                                |
| `npm run gen:icons`               | regenerate the brand assets from the web app's mark   |

## On the phone

1. `npm start`
2. Open **Expo Go** and scan the QR code (same Wi-Fi; use `npm start --tunnel` if
   the network blocks it).
3. Pull down on Home to refresh. **More → Developer** is the control panel:
   switch scenario, break the network, fire a notification, open Diagnostics.

## Where things are

```
src/
  App.tsx          root providers, in order: error boundary → safe area → theme
  navigation/      bottom tabs + two nested stacks, and screen telemetry
  screens/         one file per screen; no business logic lives here
  features/        screen-specific composites (ChangeList, TransactionRow, …)
  components/      the design system — everything reusable and generic
  theme/           tokens, typography, light/dark, the ThemeProvider
  store/           zustand stores, split by lifetime (see below)
  data/            repository interfaces + mock and HTTP implementations
  api/             HTTP client, interceptors, retry, auth seam
  services/        refresh, change detection, summaries, notifications, storage
  logging/         structured logging + the redaction layer
  analytics/       interaction telemetry ("how is the app used?")
  audit/           system audit ("how was this number produced?")
  errors/          AppError, normalisation, boundaries
  config/          environment + feature flags
  mocks/           the development dataset and its scenarios
  types/           domain models
  utils/           formatting, money, clock, ids
```

Nothing in `screens/` or `components/` may import from `mocks/` — eslint enforces
it. Screens go through `repositories`, which is what makes the mock layer
replaceable without touching a component.

## The rules worth knowing

**Money is integer cents.** No float ever holds a balance. Formatting happens
once, in `src/utils/format.ts`.

**A number that cannot be backed is `null`, not `0`.** `safeToSpendCents: null`
renders as "Not available" plus the reason. A zero reads as a measurement, and
presenting a guess as a measurement is the most expensive bug a money app can
ship.

**Nothing financial is persisted.** Preferences, flags and notification text
persist to AsyncStorage; balances and transactions live in memory only and are
re-fetched. Tokens go to the Keychain/Keystore via `secretStore`.

**Logs are redacted before they leave the logger.** By field name _and_ by value
shape — see `src/logging/redact.ts` and its tests. This is what would make
production logging safe to switch on.

## State, in four kinds

| Kind                | Where                | Persisted                       |
| ------------------- | -------------------- | ------------------------------- |
| Server state        | `financeStore`       | no — re-fetchable and sensitive |
| Preferences         | `preferencesStore`   | yes                             |
| App/feature flags   | `featureFlags`       | overrides only                  |
| Notification centre | `notificationsStore` | yes, capped at 50               |
| Developer switches  | `devStore`           | yes (development only)          |

zustand, not Redux or Context: stores are readable outside React
(`useFinanceStore.getState()`), which is how services participate without the
component tree, and selector subscriptions avoid the re-render-everything
problem a single Context would create.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — the decisions and why
- [`docs/development.md`](docs/development.md) — scenarios, diagnostics, flags

## Deferred until a development build

Everything below has an interface and a development implementation today; none
of it blocks the Expo Go loop.

- **Real notifications.** `NotificationService` delivers to the in-app centre.
  Local notifications would work in Expo Go; remote push needs a development
  build. Swap the implementation in `src/services/notifications.ts`.
- **Real authentication.** `AuthService` returns an obviously synthetic
  development token. No fake production auth was written on purpose.
- **Biometric unlock, screenshot protection, certificate pinning.** Extension
  points are documented in `docs/architecture.md`; all need native config.
- **A backend.** `createHttpRepositories()` is written out in full; flipping
  `ENABLE_MOCK_API` off routes to it.
