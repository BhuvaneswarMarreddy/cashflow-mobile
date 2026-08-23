# Overnight Persona + Design Loop — Program Plan

**Owner's instruction (2026-08-23, ~01:40):** run persona reviews (3 personas + a UI/UX designer), escalating rigor 5 → 8 → 10, implement findings including backend changes, deploy, build the next app version. Loop: persona 1 → 2 → 3 → designer → back to personas for a final check; **max 5 loops**. Core principles: easy glance, learn the values, don't overclutter. Owner is asleep; results reviewed in the morning.

## 1. What this program is allowed to change

**In scope, autonomous:** mobile UI (screens, components, theme tokens), copy, navigation, chat prompt/verb behaviour, server derivation and callables, tests, and deploys of the web/functions (CI auto-deploys on merge to main). A new mobile Release build installed to the owner's device.

**Out of scope, needs the owner:**
- TestFlight upload (requires his Apple ID + 2FA).
- `firestore.rules` deploys (CI deliberately never deploys them; a bad ruleset locks him out).
- Anything that spends money outside the existing OpenAI usage (no new paid services).
- Deleting or rewriting his real data. No migrations of live documents.
- Changing his stated decisions (assumptions, review confirmations, bills) — those are HIS, not findings to "fix".

## 2. The personas (fixed definitions, used every loop)

- **P1 — 20, first job.** Small money, high stakes. Never budgeted. Thinks "can I afford this weekend", not "monthly burn". Phone-only, no patience for setup, allergic to anything that looks like accounting.
- **P2 — 50, Excel veteran.** Twenty years of spreadsheets, quit Rocket Money because it couldn't capture his detail or his categories and gave no real planning. Wants CONTROL and will check the arithmetic against his own sheet. Not afraid of complexity; afraid of being wrong.
- **P3 — 30, peak career, kids, no time.** Not budgeting — SEEING. "Where did it all go?" and "why is this month worse?". Thirty-second sessions, one-handed, at night. Will abandon anything with a weekly ritual.
- **D — designer, 20 years, modern iOS idiom.** Glass/blur, depth, restrained motion, typographic hierarchy. Judges tokens, spacing scale, optical alignment, radii, real-estate allocation, hierarchy, touch targets, overlap/clipping risk. Owner's constraint: **no loud colour** — contrast comes from hierarchy, weight and surface, never from alarm palettes.

## 3. Rigor ladder

| Loop | Rigor | What it means |
|---|---|---|
| 1 | 5 | Structural and high-frequency: comprehension, first-run, missing capability, systemic spacing/hierarchy. No pixel-hunting. |
| 2 | 8 | Every screen state incl. empty/loading/error/long-string; per-component spacing and alignment; the persona's second-month experience, not first-week. |
| 3 | 10 | Pixel-level: exact token values, optical vs mathematical alignment, Dynamic Type at largest size, small-device (SE) layout, motion timing, one-handed reach maps. Persona: the edge cases that make them quit. |
| 4-5 | 10 | Only if loop-3 findings required changes big enough to invalidate earlier passes. Otherwise verification-only and STOP EARLY. |

**Stop early** when a loop produces no Critical/High findings. Five is a ceiling, not a target.

## 4. Loop protocol (one iteration)

1. **Review fan-out (parallel, read-only):** P1, P2, P3, D each produce ranked findings with file:line, severity *for that persona*, and the smallest fix. Designer additionally verifies the previous loop's design changes actually landed as intended.
2. **Triage (me, not an agent):** merge the four lists into one ranked backlog. De-duplicate. Resolve conflicts between personas explicitly (P2 wants density, P3 wants glanceability — record the decision and its reason, don't silently pick).
3. **Implement:** one agent per coherent slice, each with its own lane (explicit owned files) so parallel work cannot collide. Money-touching changes carry the full bar: red-first tests, mutation proof, and the regression fixture unchanged.
4. **Review the implementation:** every money-touching or cross-surface change gets an independent reviewer before merge. UI-only changes get a lighter check.
5. **Ship:** merge → CI deploy for web/functions → mobile build installed to the device.
6. **Verify:** designer re-checks the visual changes; the affected persona re-checks their own finding. Unresolved items carry into the next loop's backlog with their original severity.

## 5. Triage rules (how findings become work)

Ranked by: **(does it produce a wrong number) > (does it block the persona's core job) > (does it violate a core principle) > (polish)**.

- A finding that makes a figure wrong or misleading is Critical regardless of which persona raised it, and jumps the queue.
- A "missing capability" finding (e.g. no month-over-month comparison) is only actionable this program if it fits in a loop; otherwise it becomes a filed issue with the persona's words attached, and I say so rather than pretending it shipped.
- Conflicts between personas are decided by the owner's own stated fundamentals — numbers accurate, UI simple, and the chat as the single control point — and the decision is recorded in the loop log.
- Design findings that would introduce loud colour are rejected on the owner's explicit constraint, and an alternative using hierarchy/elevation/surface is required instead.

## 6. Quality bar (non-negotiable, unchanged from the session's standard)

- No claim of success for a write that was not confirmed.
- No figure printed that the owner never provided.
- Tests must fail when the behaviour breaks — mutation-prove anything load-bearing; a green suite is not evidence.
- `tsc --noEmit` is a required gate everywhere (jest does not typecheck — this blocked a deploy earlier today).
- The no-feedless-account regression fixture stays byte-identical.
- Every deploy watched to completion; a failed deploy is diagnosed, not retried blindly.

## 7. Failure and interruption handling

- **Session/API limits** (hit once tonight): agents commit after each coherent item so an interruption cannot lose work; on resume, check `git log` in the worktree before re-dispatching anything.
- **A wrong fix** (happened tonight with the table height): when a device-reported bug survives a fix, the next attempt must diagnose which node/behaviour actually causes it and say what evidence distinguishes it from the previous wrong hypothesis. No re-applying a failed hypothesis.
- **RTL cannot prove layout.** React Native's test preset replaces ScrollView; a passing style assertion is not proof the box shrinks. Any layout claim is marked "device-verifiable only" and listed for the owner to confirm.

## 8. Morning deliverable

A single report containing: what each persona found per loop, what was implemented and merged (with PR numbers), what was deployed, the new build number on his phone, findings deliberately NOT actioned and why, filed issues for anything deferred, and the explicit list of things only he can verify (device visuals, his OpenAI quota, his real statement text).

## 9. Known context that shapes this program

- His OpenAI account is currently refusing requests (quota/rate limit), so anything AI-dependent cannot be verified end-to-end tonight. Chat-path changes are shipped tested but marked unverifiable until he tops up.
- Mobile lacks: bill edit/delete (server-only so far), batch subscription adds, unknown-amount bills, the mic. These are filed (#32, #34, #36) and are candidate work if a persona raises them.
- The app on his phone is 1.0.1 build 3; an archive is already waiting in Organizer for him to upload.

---

# LOOP 1 (rigor 5) — findings and triage

## Process failure found and fixed before triage
Persona 2's #1 CRITICAL ("the deployed prompt never teaches add_category/rename_category/remove_category/record_bill") was **FALSE**. It read the local `cashflow-forecast` checkout, which was **116 commits behind origin/main**; all verbs are present in the deployed prompt (verified with `git show origin/main:functions/src/prompts.ts`). Two earlier agents tonight hit the same trap. Root cause fixed: the checkout was fast-forwarded to origin/main, with the owner's five WIP files stashed and restored intact (upstream had not touched them). **Rule added for later loops: every review agent must read `origin/main`, not the working checkout.**

## Ranked backlog (merged, de-duplicated)

### Tier 1 — wrong or dishonest output (jumps the queue)
1. **"Nothing has changed since your last refresh" is a false negative** (P3). `previousSnapshot` is memory-only by design (financeStore.ts:19-24), so on any cold start the app reports "nothing changed" when it means "no baseline". For a 30-second-session user that is most opens. → Persist a lightweight last-seen snapshot, or say "no baseline yet".
2. **Dead "Record cash" button** (P1 + P3 independently). `HomeScreen.tsx:65-78` — the entire handler is an analytics call. Tapping does nothing.
3. **CSV import silently flattens custom categories into 13 buckets** (P2). `csv-import.ts:243-259`; the original text survives only in `sourceCategory`, which **no UI anywhere reads**.

### Tier 2 — blocks a persona's core job
4. **No month-vs-month comparison anywhere** (P3). His literal question is unanswerable by any navigation path. Flow offers this month / this year / all time only.
5. **"Left after commitments" is on the wrong screen** (P1). The app's best self-explaining figure is 4 taps away on Plan; Home leads with "Runway", which this persona reads as a status label.
6. **Provenance/audit exists and is switched off for real users** (P2). `AccountsDiagnostics` + `obs/provenance.ts` are gated behind a dev-only env flag; the audit log has no reader at all. This is the single cheapest trust win in the app — a settings toggle, not a build.
7. **The app never speaks first** (P3). `'background'` trigger is never called; `summarizeMorning` is dev-only. A notification can only echo an action the user just took.
8. **No single-transaction categorize** (P2). Long-press always writes a merchant-wide rule; there is no way to fix just the row in front of you.

### Tier 3 — principle violations (glance / teach / clutter)
9. **Runway and Locked are unexplained jargon** (P1); "Locked" most likely reads as frozen money, and tapping it navigates to a screen that never shows a "Locked" figure.
10. **Chat is undiscoverable and gives no starting prompt** (P1). Two non-obvious taps deep; the empty state offers no examples.
11. **Home's empty state says "Connect an account" but its button says "Refresh"** (P1) — and it rarely fires anyway, so a fresh install shows a wall of $0.00.
12. **Review queue is buried with no badge** (P3), while its own comment says it is why runway and income are fuzzy — silent accuracy decay.
13. **Flow shows audit language to everyone** (P1): "Unexplained", "equal by construction".

### Tier 4 — design system (designer)
14. **FAB mini actions invisible** — root cause: dark-mode `elevation()` returns the same hairline for every level (theme.ts:40-55), and `surface` has no contrast headroom against the 60% scrim. Fix: `surfaceAlt` + the unused `borderStrong` on the chips/buttons, AND make dark elevation scale.
15. **36pt touch targets** in `SegmentedControl.tsx:58` (used on three daily screens) and 38pt in `FlowView.tsx:274` — below the app's own documented 44pt floor.
16. **`heroNumber` used once, on the wrong screen**; `MetricCard size="hero"` renders at the same 22px as ordinary rows, so Plan and Accounts have no clear focal figure.
17. **`StatusChip` uses `radius.control` where every sibling chip uses `radius.pill`** — same semantic role, different shape.
18. **`ErrorBoundary` hardcodes spacing/radius and two DRIFTED hex colours** (#f3f1ec vs #F2EFE6) despite already importing the palette.
19. Minor: five `gap: 2` literals instead of `spacing.xxs`; no icon-chip size scale; two off-grid values in FlowView; an undocumented 13th type style in the tab bar.

## Explicit persona conflicts to decide
- **P2 wants density and control; P1/P3 want fewer words and fewer decisions.** Decision: default to P1/P3 (glance) on Home, and give P2 depth on demand (Plan/Accounts/provenance), never by adding chrome to Home. Recorded per plan §5.
- **P1 wants the Flow reconciliation language hidden; P2 wants exactly that language as proof the numbers reconcile.** Decision: keep it, but move it behind a "show technical detail" affordance — P2 can find it, P1 never trips over it.

## Deliberately NOT actioned this loop (and why)
- **No self-serve sign-up** (P1 #1) — this is a single-owner companion app by design; the persona is a lens, not a target market. Flagged, not built.
- **Sub-categories, merging, per-account rules** (P2 #5) — real ceiling, too large for a loop; belongs in the #23 CRUD program.
