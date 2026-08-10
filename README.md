# Cashflow — mobile

A React Native (Expo) client for Cashflow. This is the **foundation**: navigation,
theme, design system, logging, telemetry, audit, error handling, refresh
orchestration and eight working screens, all running on a mock data layer.

There is no backend connection yet, and that is deliberate — the seam where the
real API attaches is a single file (`src/data/index.ts`).

## Run it

```bash
npm install
npm start          # then scan the QR code with Expo Go
```

Expo Go on a physical phone is the primary loop: edit a file, the bundle
reloads, look at the phone. No dependency in this project breaks that — see
[Deferred](#deferred-until-a-development-build) for the two things that would.

|                                   |                                                       |
| --------------------------------- | ----------------------------------------------------- |
| `npm start`                       | Metro + QR code for Expo Go                           |
| `npm run ios` / `npm run android` | open in a simulator/emulator                          |
| `npm run verify`                  | typecheck → lint → tests (run this before committing) |
| `npm test`                        | jest (155 tests)                                      |
| `npm run typecheck`               | `tsc --noEmit`, strict                                |
| `npm run lint`                    | eslint                                                |
| `npm run gen:icons`               | regenerate the placeholder brand assets               |

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
