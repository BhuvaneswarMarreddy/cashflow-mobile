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

| Command | |
| --- | --- |
| `npm run ios` | build, install and launch on a simulator or device |
| `npm start` | Metro on its own, for a JS-only reload loop |
| `npm run verify` | typecheck → lint → tests. Run before every commit |
| `npm test` | jest (175 tests) |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | eslint |
| `npm run gen:icons` | regenerate the brand assets from the web app's mark |

## Screenshots

<!-- Tracked in #1. -->

_Coming — see [issue #1](../../issues/1)._

## What it does

| | |
| --- | --- |
| **Home** | Runway — how long the money lasts at the measured burn — plus cash, locked monthly bills, cards and what is committed |
| **Accounts** | Every account with a derived balance. Add one by hand, connect a bank through Plaid, or import a statement |
| **Activity** | The ledger, and a **Flow** view of where money came from and went. Tap a lane to see the transactions behind it |
| **Plan** | What is due next, and progress toward savings goals |
| **More** | The review queue, security, the pending-transactions policy, diagnostics |

Two things this app does that the web app cannot:

- **Face ID**, as a lock over the figures. Not a login — the session persists on its
  own; a failed scan keeps the balances covered rather than signing you out.
- **The review queue**, one card at a time. Hundreds of unexplained credits, each a
  two-second decision — the sort of work that piles up when the only workspace is a
  laptop.

## Architecture, in one paragraph

This client computes no money. Firestore stores no balances — an account's balance is
derived from its opening anchor plus its transactions — so the phone asks Cloud
Functions that run the *web app's own* `src/lib` and returns finished figures in
integer cents. Screens render, sort and format; they never sum.

[**ARCHITECTURE.md**](ARCHITECTURE.md) has the full path from bank to pixel, how the
four UI layers stack, and the choices that had a real alternative.

## Where things are

```
src/
  App.tsx          root providers, in order: error boundary → safe area → theme
  navigation/      bottom tabs + two nested stacks, and screen telemetry
  screens/         one file per screen; no business logic lives here
  features/        screen-specific composites (RunwayHero, FlowView, …)
  components/      the design system — everything reusable and generic
  theme/           tokens, typography, light/dark, the ThemeProvider
  store/           zustand stores, split by lifetime
  data/            one typed wrapper per callable, behind repository interfaces
  services/        refresh, biometrics, change detection, summaries, notifications
  logging/         structured logging + the redaction layer
  analytics/       interaction telemetry ("how is the app used?")
  audit/           system audit ("how was this number produced?")
  errors/          AppError, normalisation, boundaries
  config/          environment + feature flags
  mocks/           the development dataset and its eleven scenarios
  types/           domain models
  utils/           formatting, money, clock, ids
```

Nothing in `screens/` or `components/` may import from `mocks/` — eslint enforces it.
Screens go through `repositories`, which is what makes the data source swappable
without touching a component.

## The rules worth knowing

**Money is integer cents.** No float ever holds a balance. Formatting happens once, in
`src/utils/format.ts`.

**A number that cannot be backed is `null`, not `0`.** `MetricCard` renders `null` as
"Not available" plus the reason. A zero reads as a measurement, and presenting a guess
as a measurement is the most expensive bug a money app can ship.

**Nothing financial is persisted.** Preferences and notification text go to
AsyncStorage; balances and transactions live in memory only and are re-fetched. The
Firebase session persists through AsyncStorage — the tradeoff is written out in
`src/api/auth.ts`.

**Logs are redacted before they leave the logger**, by field name *and* by value
shape — see `src/logging/redact.ts` and its tests.

## State, by lifetime

| Kind | Where | Persisted |
| --- | --- | --- |
| Server state | `financeStore` | no — re-fetchable and sensitive |
| Preferences | `preferencesStore` | yes |
| Biometric lock | `lockStore` | no — a cold start arms it anyway |
| Feature flags | `featureFlags` | overrides only |
| Notification centre | `notificationsStore` | yes, capped at 50 |
| Developer switches | `devStore` | yes (development only) |

zustand, not Redux or Context: stores are readable outside React
(`useFinanceStore.getState()`), which is how services participate without the
component tree, and selector subscriptions avoid the re-render-everything problem a
single Context would create.

## Docs

| | |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | how a figure reaches a pixel, and the UI layers |
| [CONTRIBUTING.md](CONTRIBUTING.md) | setup, running on a device, conventions |
| [CONTRIBUTING-PROCESS.md](CONTRIBUTING-PROCESS.md) | issues, labels, branches, PRs |
| [docs/development.md](docs/development.md) | scenarios, diagnostics, flags |

## The other half

The engine, the web app and every Cloud Function live in
[**cashflow-forecast**](https://github.com/BhuvaneswarMarreddy/cashflow-forecast).
A change here often starts there — anything needing a figure this app does not
already receive is a server change first.
