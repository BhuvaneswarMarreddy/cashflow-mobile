# Data Mappings + Chat Epic — Implementation Plan

> **For agentic workers:** This is the EPIC-level plan (issues #7–#14). Each phase expands into its own full TDD plan (superpowers:writing-plans format, complete code steps) when the owner gives that issue its go. REQUIRED SUB-SKILL at execution time: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** One control point — an overlay chat plus thin forms — through which every data mapping (categories, transfers, bills, account state, feedless cards) is changed once and every number on every screen re-tallies, past and future.

**Architecture:** All mapping edits are *decisions* written dual-keyed to the shared decisions store via server callables in the web repo's functions (the same money lib that powers `homeSnapshot` re-derives everything after each write). The mobile app never computes money and never writes Firestore directly; it renders snapshots and submits decision ops. The chat is a second *surface* over the identical decision ops the forms use — the AI can propose ops, never write freely.

**Tech Stack:** Expo/React Native (existing), Firebase callables + Firestore (existing), Claude API (`claude-sonnet-5`) server-side for chat vision + tool use, iOS keyboard dictation for voice (no audio infra).

## Global Constraints

- Numbers accurate > everything; UI simple (owner's two fundamentals). A wrong number is the failure mode; autonomy risk is accepted, silent inaccuracy is not.
- Decisions are dual-keyed and survive facts resets/re-imports (target architecture). No mobile-private stores.
- Anthropic key lives server-side only (web repo root `.env`); the mobile bundle never contains an AI key.
- Every applied decision is undoable; the journal records enough to invert it.
- Confirmation UX is subtle: markers at the same visual weight as sibling icons; small overlays; never bright alerts, toasts, or pushes.
- Chat overlay never occupies the full screen.
- All 175 existing tests stay green; CI on PRs (issue #2) should land before or with Phase 1.

---

## Why (owner's motive, verbatim anchors)

- "I don't want to type each and every payment transaction… or go for each one and change the category." → The unit of work is the *rule*, not the transaction.
- "Single point to change is this particular chat… it should be overlay." → Chat = control plane; screens = read plane.
- "From past to present and update all the numbers in all the screens properly." → Retro + future application with full re-derivation is the core contract.
- "I would take the risk than seeing wrong numbers." → Apply immediately + undo, but validate server-side; when the model is unsure it asks, it never guesses.
- Differentiation vs ChatGPT-style finance chat: theirs describes; ours *changes the books* from one message.

## Decision schema (Phase 1 locks this; later phases only add `kind`s)

```ts
// decisions/{decisionId}  — dual keys: stable entity key + fact key where applicable
interface Decision {
  id: string;                  // ulid
  kind: 'merchantRule' | 'txnOverride' | 'transferPair' | 'accountState'
      | 'cardPolicy' | 'billMatcher' | 'anomalyAnswer';
  entityKey: string;           // e.g. merchant:COSTCO, account:amazon-store
  payload: Record<string, unknown>;  // kind-specific, validated by zod schema server-side
  supersedes?: string;         // decision it replaces (undo = write inverse / reinstate)
  source: 'form' | 'chat' | 'anomaly-confirm';
  createdAt: string;           // server timestamp
}
```

Callables (web repo `functions/`):

- `applyDecision(op: DecisionOp): { decisionId, snapshotVersion, changed: ChangeSummary }` — validates, writes, re-derives, returns what changed (e.g. `{ transactionsRecategorized: 37, monthsAffected: ['2026-06','2026-07'] }`).
- `undoDecision(decisionId): { snapshotVersion }`
- `chatTurn(messages, images?): { reply, proposedOps?: DecisionOp[], applied?: ChangeSummary[] }` — Claude with a tool schema exposing ONLY `applyDecision`-shaped ops.
- `listAnomalies(): AnomalyProposal[]` / anomaly answers go through `applyDecision` (`kind: 'anomalyAnswer'`).

Precedence rule (fixed here, tested in Phase 2): `txnOverride` (specific) beats `merchantRule` (general) beats import default.

## Phases

| Phase | Issue | Deliverable | Depends on |
|-------|-------|-------------|-----------|
| 1 | #7 | `applyDecision`/`undoDecision` callables + decision journal + re-derivation + mobile client wrapper with optimistic update/rollback | web repo functions |
| 2 | #8 | Merchant→category rules: long-press a transaction → "Always categorize <merchant> as…", retro+future | 1 |
| 3 | #9, #11 | Transfer pairing/naming; account rename & visibility — same op plumbing, thin forms | 1 |
| 4 | #14 | Feedless card policy: payment-to-card = spend, balance anchor "start from now", twin-guard | 1 |
| 5 | #13 | Anomaly proposals server-side + subtle confirm markers on mobile | 1, 4 |
| 6 | #12 | Chat overlay (FAB, flyout, screenshots, dictation) driving the same ops | 1–5 usable via chat as they exist; minimum viable after 2 |
| 7 | #10 | Bill matchers/locks editing | 1 |

Phase 6 can start after Phase 2 with categories only, then gains verbs as phases land — the chat's tool schema is generated from the same zod op schemas, so new kinds appear in chat for free.

## Infra & keys

| Need | Answer | New cost/keys |
|------|--------|---------------|
| Screenshot understanding | Claude vision in `chatTurn` (images passed to the API) — no OCR service | Anthropic key **already in web repo `.env`**; usage pennies at personal volume |
| Audio input | iOS keyboard mic dictation into the chat TextInput — on-device, free, offline, zero code beyond a TextInput | none |
| Chat runtime | Firebase callable (existing project, Blaze) | none |
| Model | `claude-sonnet-5`, tool use constrained to decision ops | — |

Nothing else. No OpenAI/Whisper, no new services, no client-side AI.

## Test-case catalog

**A. Merchant rules (Phase 2)**
1. Rule COSTCO→Groceries recategorizes every past COSTCO txn; month totals shift by exactly the moved amounts; grand total unchanged (conservation invariant).
2. Newly imported COSTCO txn lands in Groceries with no user action.
3. A txn manually overridden earlier keeps its override (specific beats general).
4. Re-pointing the rule (Groceries→Dining) moves the same set once; no txn double-moved.
5. Undo restores prior categories and totals exactly.
6. "COSTCO WHSE #123" matches merchant key COSTCO; "COSTCO GAS" does not unless included — rule stores the merchant key + matched variants, and the ChangeSummary lists variants swept so the owner sees scope.
7. Facts wipe/re-import: rules re-apply to re-imported facts untouched (dual-key survival — the #111 lesson).

**B. Re-derivation invariants (Phase 1)**
8. Every `applyDecision` bumps `snapshotVersion`; all screens render one version — never mixed old/new numbers.
9. Runway and Plan figures recompute after any decision.
10. Reconciliation replay: derived totals tie back to source facts after arbitrary decision sequences (same audit pattern as the web Sankey reconciliation).
11. Optimistic update rolls back cleanly when the callable rejects; UI shows the server's error reason.
12. Two rapid decisions serialize (no lost update; second sees first's state).

**C. Feedless card (Phase 4)**
13. $800 buffer→Amazon-card payment books as $800 spend at payment date; not ALSO as a transfer (reclassified, not duplicated).
14. Balance anchor set today ⇒ forward card balance = anchor − payments (+ interest facts if present); no history required.
15. If a feed later appears, itemized txns + prior payment-spends are flagged for confirm, never silently double-counted (twin-guard).
16. Screenshot-sourced item split of a payment must sum to the payment; mismatch is flagged with the delta, not auto-balanced.

**D. Anomalies (Phase 5)**
17. Loan with zero balance and no payments this cycle → "closed?" proposal; marker renders at sibling-icon size/tone; tap → small overlay; confirm writes `accountState: closed`; account leaves active totals, history stays.
18. Declined proposal is remembered — no re-nag next cycle.
19. Proposals surface ONLY via marker and chat — assert no toast/alert/push path exists.
20. The same confirm executed from chat produces the identical decision record.

**E. Chat (Phase 6)**
21. "These are groceries" + screenshot of the Activity screen → proposed merchantRule op → applied → reply states scope ("37 transactions across 2 accounts, Jun–Aug") + undo handle.
22. Ambiguous screenshot (unreadable merchant) → model asks, never guesses (accuracy beats autonomy).
23. Tool schema exposes only decision ops; a malformed/out-of-schema op is rejected server-side (zod) and surfaced in chat.
24. External screenshot (Amazon store app) → item enrichment flow of test 16.
25. "Undo that" reverts the most recent chat-applied decision.
26. Callable timeout/offline: message marked failed, no half-applied decision (server transactional), retry works.
27. Dictated input follows the identical path as typed text (nothing audio-specific to break).

**F. Platform/regression**
28. Existing 175 tests green; new suites keep `npm run verify` the single gate.
29. Overlay + FAB: 44pt targets, VoiceOver labels, overlay dismissible by tap-outside and swipe (a11y is non-negotiable).
30. Chat overlay never blocks the tab bar's screen content underneath from scroll-freezing bugs (overlay is a portal, not a navigation state).

## Example flows (owner-facing)

1. **Groceries sweep:** Screenshot Activity → drop in chat → "these should be groceries" → reply: "Mapped COSTCO to Groceries — 37 transactions since June re-tallied, Home and Plan updated. Undo?"
2. **Mercedes wind-down:** App notices no payment this cycle → tiny neutral dot on the account row → tap → "Looks paid off — mark closed?" → Confirm → runway recomputes without the phantom obligation.
3. **Amazon card:** "I paid $800 to my Amazon card from buffer" (or it's seen in the feed) → booked as $800 spend; later a screenshot of the order history splits it into items that must sum to $800.
4. **Voice:** Tap FAB, tap mic on the keyboard, speak — same as typing; no separate audio system.

## Risks / open edges

- Merchant normalization quality decides how often rules over/under-sweep — ChangeSummary transparency + undo is the mitigation; a merchant-alias decision kind is the escape hatch if needed later.
- Chat cost/latency: one callable round-trip per message with images; acceptable at personal scale, streamed reply later if it feels slow.
- Web app parity: decisions written from mobile appear in web immediately (shared store) — web UI may need read-only awareness of new kinds (`cardPolicy`, `accountState`) to render correctly; tracked as a web-repo follow-up when Phase 4 starts.
