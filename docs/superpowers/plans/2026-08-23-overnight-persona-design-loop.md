# Overnight Persona + Design Loop — Program Plan (v2)

**Owner's instruction (2026-08-23, ~01:40):** run persona reviews (3 personas + a UI/UX designer), escalating rigor 5 → 8 → 10, implement findings including backend changes, deploy, build the next app version. Loop: persona 1 → 2 → 3 → designer → back to personas for a final check; **max 5 loops**. Core principles: easy glance, learn the values, don't overclutter. Owner is asleep; results reviewed in the morning.

**v2 (after plan review 1, rigor 6).** Changes: a real screenshot harness replaces code-only "visual" review; rigor levels are bound to required *evidence types* instead of adjectives; shared theme tokens get a collision rule; the loop log gets a real file; personas are seeded with the owner's literal complaints instead of rediscovering them; deploy blast radius is bounded; build number is bumped. Plan review 1's headline finding — that the `feedless` regression fixture is fabricated — was **verified false** (it exists at `cashflow-forecast/src/__tests__/feedless-card.test.ts`, `functions/src/__tests__/feedless-card.test.ts`, `src/__tests__/feedless-guard-wiring.test.ts`); the reviewer grepped only the mobile repo, where the plan lives. §6 now carries full paths so no future reader repeats that.

---

## 0. The evidence rule (new in v2, governs everything below)

Tonight's single biggest failure mode is **a confident finding derived from something the agent could not actually see**. It has already happened four times in this session: three agents reasoned from a checkout 116 commits stale, and plan review 1 called a real fixture fabricated after grepping the wrong repo.

Therefore, every finding carries an evidence tag, and **the tag decides whether it may be auto-implemented**:

| Tag | Means | Auto-implement? |
|---|---|---|
| `MEASURED` | A computed value: contrast ratio from the hex table, a token diff, a Dynamic-Type overflow calculation, a screenshot citation. | Yes |
| `GREPPED` | A capability provably absent or present at `file:line`, read from **`origin/main`**. | Yes |
| `INFERRED` | Reasoned from code, not observed rendering. | Only if the fix is reversible and touches one file. |
| `AESTHETIC` | Taste, "feels cramped", motion feel. | **No.** Goes to the owner's morning device-check list. |

A finding claiming rigor 10 with no `MEASURED` evidence is logged as **"claimed L10, evidenced L5"** in the morning report — automatically, not at the report writer's discretion.

**Every review agent reads `origin/main`, never the working checkout.** The mobile repo's working tree currently holds the owner's uncommitted counterparty/flow-lane work; `cashflow-forecast` was fast-forwarded 116 commits tonight.

## 0b. The screenshot harness (new in v2 — this is what makes "pixel-level" real)

`EXPO_PUBLIC_APP_ENV=test` resolves `environment='test'` (`src/config/env.ts:22-31`), which turns `ENABLE_MOCK_API` on (`src/config/featureFlags.ts:44-52`). The app then serves every screen from `src/mocks/dataset.ts` + `scenarios.ts` with **no network, no real credentials, and no contact with the owner's data**. Eleven scenarios — empty account, failed refresh, negative balance — that real data will not reproduce on demand.

- Target: iOS Simulator (`iPhone 17 Pro` for standard, `iPhone 17e` for small-screen), never the owner's phone.
- Capture: `xcrun simctl io booted screenshot <path>`.
- **Auth caveat:** `src/App.tsx:91` gates on `authStore.status === 'signed-out'`, and there is no dev bypass. Screenshots therefore run on a throwaway branch `harness/screenshots` carrying a 3-line forced-signed-in patch. **That branch is never merged and the patch never enters shipped code** — an auth bypass flag in production is exactly the kind of "lazy" that is not allowed.
- Rigor 8 and 10 designer passes **must** cite a screenshot path for any layout, contrast, overlap or free-space claim. Step-6 "verify" must screenshot-diff, not re-read the diff.

**STATUS: ATTEMPTED, NOT VIABLE (verified 2026-08-23 ~04:00).** What worked: the app **built and installed** on the `iPhone 17 Pro` simulator under `EXPO_PUBLIC_APP_ENV=test`, Metro served it (HTTP 200), and `xcrun simctl io booted screenshot` captured real frames. What blocked it: this environment permits **no input to the simulator at all** — `simctl launch`, `simctl openurl`, and AppleScript/System Events clicks are each denied by the sandbox classifier. Two consequences, the second fatal:

1. Expo's dev-launcher onboarding modal covers the app on first launch and can only be dismissed by a tap (or by the `disableOnboarding=1` deep link, which needs `openurl`).
2. **Even with the modal gone, photographing five screens requires navigating between them** — and there is no tap capability. A screenshot pass could only ever capture whichever screen the app happens to open on.

Therefore **the ladder caps at rigor 8** and the morning report says the pixel pass did not happen. It does not silently claim visual review it could not do.

**What survives:** most of what rigor 10 asked for does not actually need a rendered frame. Contrast ratios computed from the hex table, exact token diffs, and Dynamic-Type overflow arithmetic against real font metrics are all still `MEASURED` evidence — the FAB's ~1.1:1 contrast was proven this way tonight with no device. Only genuine overlap/clipping claims need pixels, and those are now explicitly the owner's morning device-check list, not something an agent may assert.

The harness patch lives on branch `harness/screenshots` (a 3-line forced-signed-in shim in `authStore.observe()`). **It is never merged.** It stays only as evidence of what was tried.

## 1. What this program is allowed to change

**In scope, autonomous:** mobile UI (screens, components, theme tokens), copy, navigation, chat prompt/verb behaviour, server derivation and callables, tests, and deploys of the web/functions. A new mobile Release build installed to the owner's device.

**Out of scope, needs the owner:**
- TestFlight upload (requires his Apple ID + 2FA).
- `firestore.rules` deploys (CI deliberately never deploys them; a bad ruleset locks him out).
- Anything that spends money outside the existing OpenAI usage.
- Deleting or rewriting his real data. No migrations of live documents.
- Changing his stated decisions (assumptions, review confirmations, bills) — those are HIS, not findings to "fix".

**Deploy blast radius (new in v2).** Neither repo has branch protection, and `deploy.yml` auto-deploys on every push to `main`. Left alone this plan could fire five unattended production deploys at a live financial app, backstopped only by an HTTP-200 smoke test that proves pages *load*, not that a number is *right*. Therefore: **at most one deploy per loop**, batched at the end of the loop, and a deploy is only "successful" when the job's own smoke output is read — not when the job goes green. Any change touching `functions/src/lib/forecast*`, `homeSnapshot`, `flowSnapshot`, `applyDecision`/`undoDecision` is money-path and must be cross-checked against the CSV ground-truth fixtures before merge.

**Chat/prompt changes are shipped behind review, not deploy-and-hope.** His OpenAI account is refusing requests, so chat behaviour cannot be verified end-to-end tonight; a prompt change would go live unverified for every future call. Chat-path changes are committed and merged but flagged in the report as **live-but-unverified**, and anything altering existing verb *semantics* (as opposed to adding a new one) waits for him.

## 2. The personas (fixed definitions, used every loop)

- **P1 — 20, first job.** Small money, high stakes. Never budgeted. Thinks "can I afford this weekend", not "monthly burn". Phone-only, no patience for setup, allergic to anything that looks like accounting.
- **P2 — 50, Excel veteran.** Twenty years of spreadsheets, quit Rocket Money because it couldn't capture his detail or his categories and gave no real planning. Wants CONTROL and will check the arithmetic against his own sheet. Not afraid of complexity; afraid of being wrong.
- **P3 — 30, peak career, kids, no time.** Not budgeting — SEEING. "Where did it all go?" and "why is this month worse?". Thirty-second sessions, one-handed, at night. Will abandon anything with a weekly ritual.
- **D — designer, 20 years, modern iOS idiom.** Glass/blur, depth, restrained motion, typographic hierarchy. Judges tokens, spacing scale, optical alignment, radii, real-estate allocation, hierarchy, touch targets, overlap/clipping. Owner's constraint: **no loud colour** — contrast comes from hierarchy, weight and surface, never from alarm palettes.

**Seeding (new in v2).** Each persona's first pass is handed the owner's *literal* complaints to confirm or refute, not rediscover: the FAB "blending into the background — it should pop", radius/margin/alignment/overlap, and free-space usage. Likewise his already-filed issues #32 (mic), #34 (bill edit/remove), #36 (batch bills) are pre-loaded as **known**, so the morning report can separate "genuinely new tonight" from "confirmed his existing backlog" instead of presenting his own words back to him as a discovery.

## 3. Rigor ladder — bound to evidence, not adjectives

| Loop | Rigor | Required evidence for every finding |
|---|---|---|
| 1 | 5 | Prose + screen name. Structural, comprehension, missing-capability. Fast triage pass. |
| 2 | 8 | `file:line` **and the actual current value** at that location. Not "spacing feels off" — "`spacing.sm` (8) where the adjacent row uses `spacing.md` (12), `X.tsx:42`". Every screen state incl. empty/loading/error/long-string. |
| 3 | 10 | One of: computed contrast ratio, exact token diff, Dynamic-Type overflow calculation against real font metrics, or a **screenshot citation**. Anything else is downgraded and logged as such. |
| 4-5 | 10 | Only if loop-3 changes were big enough to invalidate earlier passes. Otherwise verification-only, then STOP. |

**Stop early** when a loop produces no Critical/High findings. Five is a ceiling, not a target. **Per-loop wall-clock cap: 90 minutes**, after which the loop closes with whatever it has and the report says which passes were cut — a hung simulator install must not eat the night and starve the rigor-10 pass the owner actually asked to see.

## 4. Loop protocol (one iteration)

1. **Review fan-out (parallel, read-only, against `origin/main`):** P1, P2, P3, D each produce ranked findings with `file:line`, severity *for that persona*, an evidence tag per §0, and the smallest fix.
2. **Triage (me, not an agent):** merge into one ranked backlog, de-duplicate, resolve persona conflicts explicitly, and **write the loop log synchronously before any implementation starts** — `docs/decisions/2026-08-23-overnight-loop-log.md`, one entry per finding with loop number, evidence tag, and the fundamental it was decided against. If the session dies mid-loop, that file is the recovery map.
3. **Implement:** one agent per coherent slice, **each in its own git worktree** (the repo already uses `.worktrees/`), so parallel lanes cannot collide on `node_modules` or an in-flight build. Money-touching changes carry the full bar: red-first tests, mutation proof, ground-truth fixtures unchanged.
4. **Review the implementation:** every money-touching or cross-surface change gets an independent reviewer before merge. UI-only changes get a lighter check.
5. **Ship:** merge → one batched deploy → mobile build installed to the device.
6. **Verify:** screenshot-diff the visual changes (§0b); the affected persona re-checks their own finding. Unresolved items carry forward at their original severity.

**Shared-token collision rule (new in v2).** `src/theme/*.ts` and `palette.ts` are read by every screen; "each agent owns its files" is not an isolation boundary for them. Any token change requires triage-level sign-off as a **system-wide** decision, and **no later loop may re-touch a token an earlier loop changed without a logged reason the earlier decision was wrong.** Without this, loop 2 silently undoing loop 1 because a different persona objected is not a risk — it is the default behaviour of giving four opinionated reviewers write access to one stylesheet across five rounds.

**Cross-repo rule (new in v2).** The two repos are one product. Any callable contract change in `cashflow-forecast` is checked against the mobile client's typed wrappers **before either side ships**, so the phone cannot break against a changed server response shape.

## 5. Triage rules (how findings become work)

Ranked by: **(does it produce a wrong number) > (does it block the persona's core job) > (does it violate a core principle) > (polish)**.

- A finding that makes a figure wrong or misleading is Critical regardless of which persona raised it, and jumps the queue.
- A "missing capability" finding is only actionable this program if it fits in a loop; otherwise it becomes a filed issue with the persona's words attached, and I say so rather than pretending it shipped.
- Conflicts are decided by the owner's own fundamentals — numbers accurate, UI simple, chat as the single control point — and the decision goes in the loop log.
- Design findings that would introduce loud colour are rejected on the owner's explicit constraint; an alternative using hierarchy/elevation/surface is required instead.

## 6. Quality bar (non-negotiable)

- No claim of success for a write that was not confirmed.
- No figure printed that the owner never provided.
- Tests must fail when the behaviour breaks — mutation-prove anything load-bearing; a green suite is not evidence.
- `tsc --noEmit` is a required gate everywhere (jest does not typecheck — this blocked a deploy earlier today).
- **The feedless-account regression fixtures stay byte-identical.** Full paths, so no reviewer can call them fabricated again: `cashflow-forecast/src/__tests__/feedless-card.test.ts`, `cashflow-forecast/functions/src/__tests__/feedless-card.test.ts`, `cashflow-forecast/src/__tests__/feedless-guard-wiring.test.ts`, `cashflow-forecast/src/__tests__/feedless-account-form.test.tsx`.
- Every deploy watched to completion and its smoke output read; a failed deploy is diagnosed, not retried blindly.

## 7. Failure and interruption handling

- **Session/API limits** (hit once tonight): agents commit after each coherent item; on resume, check `git log` in the worktree before re-dispatching.
- **A wrong fix** (the table-height bug tonight): when a device-reported bug survives a fix, the next attempt must diagnose which node actually causes it and say what evidence distinguishes it from the previous wrong hypothesis. No re-applying a failed hypothesis.
- **RTL cannot prove layout.** React Native's test preset replaces ScrollView; a passing style assertion is not proof the box shrinks. Layout claims are screenshot-backed (§0b) or marked device-verifiable-only.
- **Device pairing can drop.** The mobile install depends on a live wireless `devicectl` pairing; if his phone sleeps or leaves wifi the install silently no-ops. The report must distinguish **built** from **installed and running on his device**, by exit status.

## 8. Morning deliverable

One report with these as literal required fields:

- Per loop: what each persona found, with evidence tags.
- **Genuinely new tonight** vs **confirmed his existing backlog** (#32/#34/#36) — never presented as discoveries.
- Implemented and merged, with PR numbers.
- Deployed: the actual smoke output, not "merged".
- **Build number on his phone** (bumped `1.0.1 (3)` → `1.0.1 (4)`; the build-3 archive already in Organizer stays valid for TestFlight, and the report says which is which), plus the `devicectl install` exit status.
- How each visual fix was verified: **screenshot-diffed** or **code-diff-only**. Code-diff-only re-verification of a visual claim is not verification and must say so.
- Any quality gate that could not be located is reported as **"gate not located, not enforced"** — never silently passed as vacuously true.
- Claimed rigor vs evidenced rigor per §0.
- Deliberately NOT actioned, and why. Filed issues for anything deferred.
- What only he can verify: device visuals, his OpenAI quota, his real statement text.

## 9. Known context that shapes this program

- His OpenAI account is refusing requests (quota), so AI-dependent behaviour cannot be verified end-to-end tonight.
- Mobile lacks bill edit/delete, batch subscription adds, unknown-amount bills, the mic (#32, #34, #36).
- The app on his phone is 1.0.1 build 3; an archive waits in Organizer for him to upload.

---

# LOOP 1 (rigor 5) — findings and triage

## Process failure found and fixed before triage
Persona 2's #1 CRITICAL ("the deployed prompt never teaches add_category/rename_category/remove_category/record_bill") was **FALSE**. It read the local `cashflow-forecast` checkout, which was **116 commits behind origin/main**; all verbs are present in the deployed prompt (verified with `git show origin/main:functions/src/prompts.ts`). Two earlier agents tonight hit the same trap, and plan review 1 made the same class of error from the opposite direction. Root cause fixed: the checkout was fast-forwarded to origin/main, with the owner's five WIP files stashed and restored intact. **Rule promoted into §0: every review agent reads `origin/main`.**

## Ranked backlog (merged, de-duplicated)

### Tier 1 — wrong or dishonest output (jumps the queue)
1. **"Nothing has changed since your last refresh" is a false negative** (P3). `previousSnapshot` is memory-only (financeStore.ts:19-24), so on any cold start the app reports "nothing changed" when it means "no baseline". For a 30-second-session user that is most opens. → Persist a last-seen snapshot, or say "no baseline yet".
2. **Dead "Record cash" button** (P1 + P3 independently). `HomeScreen.tsx:65-78` — the entire handler is an analytics call. Tapping does nothing.
3. **CSV import silently flattens custom categories into 13 buckets** (P2). `csv-import.ts:243-259`; the original text survives only in `sourceCategory`, which **no UI anywhere reads**.

### Tier 2 — blocks a persona's core job
4. **No month-vs-month comparison anywhere** (P3). His literal question is unanswerable by any navigation path.
5. **"Left after commitments" is on the wrong screen** (P1). The app's best self-explaining figure is 4 taps away on Plan; Home leads with "Runway", read as a status label.
6. **Provenance/audit exists and is switched off for real users** (P2). `AccountsDiagnostics` + `obs/provenance.ts` gated behind a dev-only flag; the audit log has no reader. Cheapest trust win in the app — a settings toggle, not a build.
7. **The app never speaks first** (P3). `'background'` trigger never called; `summarizeMorning` dev-only.
8. **No single-transaction categorize** (P2). Long-press always writes a merchant-wide rule.

### Tier 3 — principle violations (glance / teach / clutter)
9. **Runway and Locked are unexplained jargon** (P1); tapping "Locked" navigates to a screen that never shows a "Locked" figure.
10. **Chat is undiscoverable and gives no starting prompt** (P1).
11. **Home's empty state says "Connect an account" but its button says "Refresh"** (P1); a fresh install shows a wall of $0.00.
12. **Review queue is buried with no badge** (P3), while its own comment says it is why runway and income are fuzzy.
13. **Flow shows audit language to everyone** (P1): "Unexplained", "equal by construction".

### Tier 4 — design system (designer)
14. **FAB mini actions invisible** — root cause: dark-mode `elevation()` returns the same hairline for every level (theme.ts:40-55), so nothing can look more raised than anything else; and `surface` has no contrast headroom against the 60% scrim (~1.1:1, `MEASURED`). Fix: `surfaceAlt` + the defined-but-unused `borderStrong`, AND make dark elevation scale. **System-wide token change — triage sign-off per §4.**
15. **36pt touch targets** in `SegmentedControl.tsx:58` (three daily screens) and 38pt in `FlowView.tsx:274` — below the app's own documented 44pt floor.
16. **`heroNumber` used once, on the wrong screen**; `MetricCard size="hero"` renders at the same 22px as ordinary rows, so Plan and Accounts have no focal figure.
17. **`StatusChip` uses `radius.control` where every sibling chip uses `radius.pill`.**
18. **`ErrorBoundary` hardcodes spacing/radius and two DRIFTED hex colours** (#f3f1ec vs #F2EFE6) despite already importing the palette.
19. Minor: five `gap: 2` literals instead of `spacing.xxs`; no icon-chip size scale; two off-grid values in FlowView; an undocumented 13th type style in the tab bar.

## Explicit persona conflicts to decide
- **P2 wants density and control; P1/P3 want fewer words and fewer decisions.** Decision: default to P1/P3 (glance) on Home; give P2 depth on demand (Plan/Accounts/provenance), never by adding chrome to Home.
- **P1 wants the Flow reconciliation language hidden; P2 wants exactly that language as proof the numbers reconcile.** Decision: keep it behind a "show technical detail" affordance — P2 can find it, P1 never trips over it.

## Deliberately NOT actioned this loop (and why)
- **No self-serve sign-up** (P1 #1) — single-owner companion app by design; the persona is a lens, not a target market.
- **Sub-categories, merging, per-account rules** (P2 #5) — real ceiling, too large for a loop; belongs in the #23 CRUD program.
