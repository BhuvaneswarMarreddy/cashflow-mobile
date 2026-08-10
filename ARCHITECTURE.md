# Architecture

How a number gets from a bank to a pixel, and which parts of that this app is
allowed to touch.

---

## The one rule

**This client computes no money.**

Firestore stores no balances. `PaymentAccount` has an `openingBalance` and an
`openingDate`; the balance you see is *derived* — that anchor plus every transaction
after it — by `withDerivedBalances` in the web app's `src/lib/forecast.ts`. The
comment on the type says so outright:

```ts
currentBalance?: number; // DERIVED in memory by withDerivedBalances; never stored
```

That leaves exactly two options for a second client: ship those fifteen thousand
lines of money logic to the phone and re-derive, or ask a server that already runs
them. This app asks.

The consequence is the shape of everything below: screens are thin, the data layer is
a set of typed callable wrappers, and the interesting code is all about *not knowing
things* — which figure is missing, which is stale, which is a policy rather than a
fact.

---

## The path of a figure

```
 bank ──► Plaid ──► functions-sync (Python, scheduled 3×/day)
                          │
                          ▼
                    Firestore  ·  transactions, accounts, bills, reviews
                          │         (no balances anywhere)
                          ▼
              ┌───────────────────────────┐
              │  Cloud Functions (Node)   │   runs cashflow-forecast/src/lib
              │  homeSnapshot             │   withDerivedBalances, homeSummary,
              │  flowSnapshot             │   buildFlowGraph, selectInflowReviewQueue
              │  reviewQueue              │
              │  importCsv                │   ← the same parser the web modal uses
              └───────────────────────────┘
                          │  integer cents, finished
                          ▼
        src/data/*.ts     typed wrappers, one per callable
                          ▼
        src/store/financeStore.ts    in memory only, never persisted
                          ▼
        screens                      render; sort; format
```

The web app draws from the same Firestore and the same `src/lib`. That is what makes
the two agree: not discipline, but the absence of a second implementation.

---

## How the UI is put together

Four layers, and the rule is that each may only reach *down*.

### 1. `src/theme` — tokens, no components

`palette.ts` is the only file in the repo allowed a hex literal. Everything else
reads semantic tokens (`positive`, `negative`, `accent`, `surfaceAlt`) so light mode,
dark mode and reduced motion are one switch rather than a sweep.

The tokens are ported from the web app's `globals.css`, and three of them carry
reasoning worth keeping:

- **Money-in is teal (`#1FA2A8`), never green.** The retired red/green pair measured
  ΔE 2.4 under deuteranopia — indistinguishable.
- **Warnings wear gold**, the accent, rather than a fourth hue.
- **Serif carries hero numbers and titles**, sans carries everything else. It is the
  strongest single signal that this is the same product as the web app.

Under reduced motion every duration collapses to `0`, in one place, so no component
has to remember.

### 2. `src/components` — dumb, reusable, no data

`AppText` is the only text component: every string goes through it so the type scale,
the colour tokens and the per-variant cap on OS font scaling apply in one place. A raw
`<Text>` is a layout that breaks at 200% text size and a colour that never learned
about light mode.

Two components encode a rule rather than a look:

- **`MetricCard`** takes `cents: number | null`. `null` renders as "Not available"
  plus a reason — never `$0`. A zero reads as a measured fact and is
  indistinguishable from "we don't know yet", which is the most expensive class of
  bug a money app has.
- **`AmountText`** owns every sign, colour and tabular figure, so no screen decides
  what negative looks like.

### 3. `src/features` — composed, still no fetching

`RunwayHero`, `FlowView`, `TransactionsList`, `ChangeList`. These know the shape of
the domain but read from the store, never from the network.

### 4. `src/screens` — one screen, one question

| Screen | The question |
|---|---|
| Home | How long does my money last? |
| Accounts | Where is it? |
| Activity | Where did it go? (`Transactions`) · How did it move? (`Flow`) |
| Plan | What is coming? |
| More | Settings, review queue, diagnostics |

Home leads with **runway**, not "safe to spend". The system computes a runway and does
not compute a safe-to-spend, and a figure this client invented would be a second
opinion about someone's money. `savingsCents` was removed for the same reason: the
model has no savings-account type, so there was nothing to back it.

---

## State

Three stores, split by how long each may live.

| Store | Persisted? | Why |
|---|---|---|
| `financeStore` | **No** | Balances and transactions are re-fetchable and are the most sensitive thing here. Persisting buys a faster cold start in exchange for a durable copy of someone's finances in a phone backup. |
| `preferencesStore` | Yes | Theme, notifications, the biometric-lock choice. No money, no identifiers. |
| `lockStore` | **No** | A lock that survives a restart is indistinguishable from one that does not, since a cold start arms it anyway. Nothing stored means nothing to tamper with. |

Stores are readable outside React via `getState()`, which is how the logger, the audit
service and the refresh orchestrator work without depending on the component tree.

---

## Refresh, and what "refreshed" means

One path — `refreshFinancialData(trigger)` — for pull-to-refresh, the header button,
app foreground and launch. Two implementations is how a phone ends up showing two
different balances.

- **Pull or tap** runs the Plaid sync (`sync_now`) *first*, then re-derives.
- **Launch or foreground** re-derives only. A bank round-trip on every app switch is
  not a refresh, it is a rate limit waiting to happen.
- A failed bank sync is a **partial**, never a success. `sync_now` returns its errors
  rather than throwing, and believing it once produced a green refresh with a fresh
  timestamp over unreachable banks.
- One refresh makes **one** network call: all five repository methods start in the
  same tick and attach to the same in-flight promise. Request coalescing, deliberately
  with no TTL — a TTL would eventually serve a stale balance.

---

## Two audit streams, deliberately separate

`src/analytics` records **interaction** — which screens, how long, where errors
happen. Its property type has no field capable of holding money. That is enforced by
the type, not by care.

`src/audit` records **system and financial** events — a refresh, a sync, a review
decision — with correlation ids threading a user action through to its failure.

They are separate because one is switchable off by the user and the other is not. A
privacy preference must never be able to disable the record of what happened to a
figure.

---

## Errors

Every failure becomes an `AppError` with a `category`, a calm `userMessage`, and a
`technicalMessage` that only reaches logs. Screens render `userMessage` and never a
raw message from an API, a parser or a native module: those leak implementation
detail, occasionally leak data, and are never actionable for the person holding the
phone.

Logs are redacted by key name **and** value shape, so a token that arrives under an
unexpected key is still caught.

---

## Native modules, and what they cost

Four things here cannot run in Expo Go and therefore require a development build:
Plaid Link, Google sign-in, `expo-local-authentication`, `expo-document-picker`.

Each is loaded through a lazy `require` inside a `try`/`catch`, so a build without the
native side degrades to "not offered" rather than crashing at import.

`expo-dev-client` is installed and matters more than it sounds: without it the only
way this app can find Metro is the LAN address frozen into the binary at build time,
so a DHCP lease change means a full rebuild.

---

## Choices that had a real alternative

| Chosen | Over | Because |
|---|---|---|
| Callables | Direct Firestore reads | Firestore has no balances to read |
| Firebase **JS** SDK, scoped `@firebase/*` | `@react-native-firebase/*` | Same SDK as the web app. The scoped packages are required, not stylistic: the umbrella entry points declare no `react-native` condition, so `getReactNativePersistence` resolves to `undefined` at runtime and the session silently vanishes on every restart |
| `SegmentedControl` for Activity's tabs | Material top tabs | Top tabs need `react-native-pager-view` — a native module and a rebuild — to buy a swipe between two tabs |
| Proportional bars for Flow | Sankey as the default | A Sankey's value is its ribbons, and at 390pt they overlap into decoration. The Sankey is still there behind a toggle |
| Face ID as a **lock** | Face ID as a login | The device cannot prove anything to the server. A failed scan keeps the balances covered; it does not sign you out |
| React Navigation | Expo Router | Explicit param types on a five-tab shell with two nested stacks |

---

## What is deliberately not built

- **Plaid re-linking for banks already connected.** The account has ten lifetime
  Items. Adding a bank spends one permanently; repairing one is update mode and costs
  nothing. The two are never the same button.
- **A CSV parser on the phone.** `importCsv` runs the web app's parser server-side.
  The sign conventions alone — Amex and Discover post charges positive, everyone else
  negative — are not worth getting right twice.
- **Offline persistence of financial data.** See `financeStore` above.
- **Any arithmetic over cents that the server could do instead.**
