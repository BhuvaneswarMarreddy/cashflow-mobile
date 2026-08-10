# Development

Everything below lives behind **More → Developer**, which only renders outside
production (`developerToolsAvailable`).

## Scenarios

Switching a scenario resets the store and re-fetches, so the whole app changes
at once. Choices persist across a Metro reload — losing "Low cash" on every
bundle refresh is exactly the friction this removes.

| Scenario                | What it exercises                                        |
| ----------------------- | -------------------------------------------------------- |
| Healthy finances        | the default; positive cash, small card balance           |
| Credit-card heavy       | a squeezed safe-to-spend                                 |
| Low cash                | **negative** safe-to-spend — the UI must say it out loud |
| Upcoming bill           | rent due tomorrow, not on autopay → warning styling      |
| Paycheck arriving       | a _confirmed_ paycheck vs. the usual estimate            |
| Refresh failed          | every request fails; existing figures stay visible       |
| Partial synchronisation | balances refresh, activity does not (`partialSuccess`)   |
| No accounts             | every empty state                                        |
| Offline                 | the connectivity banner and the offline error category   |
| Large account change    | a $2,300 payoff — the change list and summary            |
| Savings milestone       | a completed goal                                         |

Independent of the scenario, three switches force conditions on top: **simulate
request failure**, **simulate offline**, **simulate slow network** (+2.6s).

The base dataset is internally consistent — the $300 card payment, the $250
transfer to savings and the day's spending are exactly the difference between
the current and previous snapshots. Keep it that way when editing
`src/mocks/dataset.ts`; a demo that does not reconcile teaches the wrong thing.

## Diagnostics

**More → Diagnostics.** Five streams, newest first, each clearable:

| Tab    | Source                 | Answers                                   |
| ------ | ---------------------- | ----------------------------------------- |
| Logs   | `useLogStream`         | what happened, in order                   |
| Events | `useAnalyticsStream`   | what the user did                         |
| Audit  | `useAuditStream`       | which processing stages ran, and how long |
| API    | `useApiStream`         | requests, status, duration, attempt       |
| Errors | logs at error/critical | what broke                                |

Every entry that belongs to one refresh carries the same `#correlationId`, so a
single action can be followed across all five.

Reproduce the whole loop on the phone: Settings → simulate failure → pull to
refresh on Home → Diagnostics → Audit shows `refresh.financial.refresh` failing,
Errors shows the normalised category, and the Home screen shows the calm message
rather than the technical one.

## Feature flags

Defaults are per environment in `src/config/featureFlags.ts`; the developer
panel overrides them at runtime and the overrides persist.

| Flag                     | Effect                                                |
| ------------------------ | ----------------------------------------------------- |
| `ENABLE_DEBUG_LOGGING`   | debug/info entries; warn and above always log         |
| `ENABLE_USER_ANALYTICS`  | interaction telemetry (also needs the privacy toggle) |
| `ENABLE_SYSTEM_AUDIT`    | the audit stream                                      |
| `ENABLE_NOTIFICATIONS`   | whether summaries are delivered at all                |
| `ENABLE_MOCK_API`        | **the switch**: mock repositories vs. the HTTP client |
| `ENABLE_EXPERIMENTAL_UI` | reserved                                              |
| `ENABLE_DIAGNOSTICS`     | the Diagnostics route                                 |

Read them outside React with `isEnabled('FLAG')`, inside with `useFlag('FLAG')`.

## Attaching a real backend

1. Set `EXPO_PUBLIC_API_BASE_URL` (see `.env.example`), restart with `-c`.
2. Turn **Mock API** off in the developer panel, or flip the environment default.
3. `createHttpRepositories()` already implements every repository method against
   these endpoints:

```
GET /snapshot        → { snapshot, previous }
GET /accounts        → Account[]
GET /accounts/:id    → Account | null
GET /transactions    → Transaction[]      ?accountId= &limit=
GET /plan/upcoming   → UpcomingPayment[]
GET /plan/goals      → SavingsGoal[]
GET /plan/paycheck   → Paycheck | null
```

If the backend disagrees with those shapes, `httpRepositories.ts` is where the
translation goes — not the screens.

4. Replace the development token in `src/api/auth.ts` with the real provider.
   The auth interceptor already attaches whatever `getAccessToken()` returns.

## Adding a screen

1. Component in `src/screens/`, wrapped in `<AppScreen>`, with a `testID`.
2. Register it in `TabNavigator.tsx` or `RootNavigator.tsx`.
3. Add its route name to `SOURCE_BY_ROUTE` in `navigation/screenTracking.ts`,
   or its telemetry lands under `system`.
4. Read data from a store selector; if new data is needed, add a repository
   method, not a `fetch`.
5. Cover the states that exist: loading, loaded, empty, error.

## Regenerating brand assets

`npm run gen:icons` redraws every icon from `scripts/gen-icons.mjs` (no
dependencies — zlib and pixel maths). Two constraints are encoded there and must
survive any replacement:

- `icon.png` has **no alpha channel**; App Store Connect rejects a transparent
  icon at upload, before review.
- The Android adaptive foreground stays inside the 66% safe zone.
