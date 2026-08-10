# Architecture

Decisions a future developer needs, and the reasoning behind the ones that look
arbitrary. Not a survey of the code — read the code for that; the files carry
their own explanations.

## The shape

```
screens ─┐
         ├─→ stores (cached server state, preferences, UI)
features ┘        ↑
                  │ written by
             services (refresh · change detection · summaries · notifications)
                  │ reads through
             repositories  ←── the seam ──→  mock dataset  |  HTTP client
                  │
             cross-cutting: logging · redaction · telemetry · audit · errors
```

One direction only. A screen never calls `fetch`, never imports a mock, and
never contains a calculation that decides what a number means.

## Why the backend owns the numbers

`FinancialSnapshot` arrives complete — including `safeToSpendCents` and the
reason it is absent when it is. The client does not derive it.

That is not laziness. The web app (`cashflow-forecast`) already contains ~15k
lines of money logic with its own test suite, and a second implementation on the
phone would eventually disagree with it. Two clients showing two different
"safe to spend" figures is worse than one client showing none.

What the client _does_ compute is presentation-level and diffable: which figures
moved since yesterday (`changeDetection.ts`) and how to phrase that
(`summarize.ts`). Both are pure functions over two snapshots.

## Two audit streams, deliberately separate

They answer different questions and must not be merged.

|                   | Interaction telemetry   | System audit                  |
| ----------------- | ----------------------- | ----------------------------- |
| Question          | How is the app used?    | How was this number produced? |
| Module            | `src/analytics`         | `src/audit`                   |
| Leaves the device | eventually, to a vendor | no                            |
| Carries amounts   | **never**               | yes, where relevant           |
| Keyed by          | session                 | correlation ID                |

The privacy boundary is enforced by types, not by discipline:
`InteractionProperties` has no field that can hold an amount, a merchant or an
account, so no future call site can leak one into an analytics vendor. Anything
financial belongs in the audit stream, which stays local.

Both share a **correlation ID** with the API stream, which is what lets
Diagnostics show one chain: _user event → API call → processing stage → error →
what the screen rendered._

## Errors

Every thrown thing becomes an `AppError` through `normalizeError`, which is what
makes "no raw error reaches the UI" a property rather than a convention. An
`AppError` carries a `userMessage` (calm, non-technical, shown verbatim) and a
`technicalMessage` (logs and development builds only).

Three layers catch:

- **Component/section** — a failed section keeps its previous data and shows an
  inline `ErrorState`.
- **Screen** — `ErrorBoundary` with a themed fallback.
- **Root** — `ErrorBoundary` with a _theme-independent_ fallback, because a
  fallback that calls `useTheme()` cannot render a crash in the theme provider.
- **Global** — `installGlobalErrorHandler` records, then delegates to React
  Native's handler so LogBox and native crash reporting still fire.

## Refresh

One function, `refreshFinancialData(trigger)`, for pull-to-refresh, the header
button, foreground-after-5-minutes and (later) background wake. Sections are
fetched with `Promise.allSettled`, so balances can succeed while activity fails:
that is `partialSuccess`, and the screen keeps the transactions it already had
rather than blanking.

A refresh that the user did not initiate does not produce a notification.

## Notifications summarise, never itemise

Enforced in `summarize.ts`: at most two changes per notification, one sentence
of position, and no template with a blank for a merchant name. Three
notifications reading "Amazon $14.97 / Gas $42.00 / Walmart $71.23" are noise a
person learns to swipe away.

## Choices that had an alternative

**React Navigation, not Expo Router.** The requested structure separates
`screens/` from `navigation/`, and explicit navigators are far easier to test —
`RootNavigator.test.tsx` drives real tab presses. Expo Router's file convention
also collides with a `src/app/` directory, which is why `App.tsx` sits at
`src/App.tsx`.

**zustand, not Context or Redux.** Services need to read and write state from
outside the component tree; Context cannot do that, and Redux is ceremony for
five small stores. Selector subscriptions also avoid Context's
re-render-everything behaviour on a dashboard full of live figures.

**A hand-rolled bottom sheet.** `@gorhom/bottom-sheet` needs Reanimated and
Gesture Handler. What the app needs is a menu that slides up. Revisit if a
screen ever wants gesture-driven snap points.

**One icon family (Feather).** Each extra family is another font in the bundle,
and mixed families read as assembled rather than designed.

**No `expo-notifications` yet.** Remote push needs a development build, and the
part worth designing now is the _copy_, which the in-app centre exercises fully.

## Accessibility, as properties rather than intentions

- Sign is never colour-only: a negative amount always carries a minus glyph.
- Amounts are read aloud as words ("minus $240"), because the typographic minus
  is not the ASCII hyphen and screen readers treat them differently.
- Font scaling is capped **per variant** — body text scales freely, the 34pt
  hero caps at 1.4x so the runway figure stays on screen.
- Reduced motion collapses every duration in the theme to zero, so no component
  needs to check the setting itself.
- Pressables are ≥44pt, via `hitSlop` where padding would distort the layout.
- Status is always a word, never a bare coloured dot.

## Security extension points

Nothing native is wired up, so the Expo Go loop stays intact. Where each piece
attaches:

| Capability               | Where it goes                             | Needs                            |
| ------------------------ | ----------------------------------------- | -------------------------------- |
| Biometric unlock         | `Gate` in `src/App.tsx`                   | `expo-local-authentication`      |
| Token storage            | already `secretStore` (Keychain/Keystore) | —                                |
| Session expiry / refresh | `AuthService.refresh` + a 401 interceptor | backend                          |
| Screenshot protection    | root view                                 | `expo-screen-capture`, dev build |
| Certificate pinning      | `ApiClientOptions.fetchImpl`              | native module                    |

## What deliberately is not built

- **A state machine library.** Refresh has five states and one transition
  function.
- **An analytics vendor SDK.** The sink interface exists; the vendor does not.
- **Toast, Avatar, PercentageText.** Listed as candidate primitives but nothing
  uses them yet, and a component becomes reusable by being used twice.
- **Offline write queue.** Nothing in this build writes.
