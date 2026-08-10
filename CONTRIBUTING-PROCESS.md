# How work moves through this repo

One person builds this today. The process below is written as if twenty were, because
the cost of an unclear tracker is the same either way: two people touching the same
file, a decision nobody can find, a fix nobody knows shipped.

It mirrors [`cashflow-forecast`](https://github.com/BhuvaneswarMarreddy/cashflow-forecast)'s
process on purpose — the two repos are one product, and a change often starts in one
and finishes in the other.

---

## 1. Every change starts as an issue

No work begins without one. The issue is where the *why* lives; the PR only shows the
*what*.

Each issue carries four labels, and they are not decoration — they are how you decide
what to pick up next:

| Label group | Values | Answers |
|---|---|---|
| **Priority** | `P0` `P1` `P2` `P3` | How much does waiting cost? |
| **Type** | `type:feature` `type:defect` `type:infra` `type:design` | What kind of work is it? |
| **Area** | `area:ui` `area:data` `area:native` `area:platform` `area:docs` | Which part does it touch? |
| **Status** | `status:ready` `status:blocked` `status:designing` `status:on-hold` | Can someone start it *right now*? |

- **P0** — drop everything: the app shows a wrong figure, or cannot be opened.
- **P1** — blocks the roadmap, or a real number is unavailable when it should not be.
- **P2** — scheduled and valuable, not urgent.
- **P3** — do it when it becomes cheap.

**Area is the collision map.** Two people can safely work in parallel when their
issues carry different areas. Same area means read each other's branch first.

`area:native` deserves its own line: anything touching `app.json`, a config plugin or
a native module invalidates the built binary. Two native issues in flight at once
means two people rebuilding on top of each other's `expo prebuild`.

---

## 2. A figure on this screen is never computed here

The standing constraint, and the one most likely to be broken by accident.

Firestore stores no balances. An account's current balance is *derived* — opening
anchor plus its transactions — and that derivation lives in `cashflow-forecast/src/lib`
and runs inside a Cloud Function. This client asks for finished figures in integer
cents and renders them.

So an issue that needs a number this app does not already receive is a **server issue
first**. Adding the arithmetic here is not the shortcut it looks like: it is a second
implementation of someone's money, and the two answers will diverge the first time
either changes.

Sorting, grouping and formatting are display. Summing, netting and deriving are not.

---

## 3. Every issue states its dependencies

A comment on each issue says three things, in plain words:

- **Blocked by** — which issues must land first, and *why* (never just a number)
- **Blocks** — what is waiting on this
- **Parallel-safe** — whether someone else can work at the same time, and which files
  are the collision risk

An issue that is blocked carries `status:blocked` and does not get picked up, even if
it looks tempting. Cross-repo blockers are written as
`BhuvaneswarMarreddy/cashflow-forecast#123`, because half of this app's work starts
there.

---

## 4. Design before code, when the decision is hard

Anything labelled `type:design` gets a written decision *before* implementation:
alternatives, the one chosen, and why. It lands in `docs/decisions/` and is linked
from the issue.

This is not ceremony. The Flow view shipped as bars rather than a Sankey because
writing down what each option loses made it obvious that a Sankey's value is its
ribbons, and that ribbons do not survive a 390pt screen. Building the "obvious"
version first would have shipped a decoration.

---

## 5. One branch, one issue

```
feat/<short-name>     a new capability
fix/<short-name>      something wrong today
chore/<short-name>    tooling, deps, process
docs/<short-name>     documentation
```

`main` is never committed to directly.

---

## 6. The PR links the issue, and closes it on merge

```
Closes #10
```

Use `Closes` when the PR completes the issue, and `Refs #10` when it is only a step
along the way. A partial PR must never say `Closes`.

The template asks for five things:

- **What changed** — so a reviewer knows before reading the diff
- **Why** — the defect, the measurement, or the decision
- **Evidence** — `npm run verify`, and *which screen you actually looked at on a
  device*. A green suite is not a rendered screen; this repo has shipped a component
  that type-checked, passed its tests, and clipped the tops off its own capitals
- **Money** — confirm no new arithmetic over cents, or justify it
- **Risk** — what could break and what would show it

---

## 7. Evidence means the device, not just the suite

The tests run in jsdom. They cannot see layout, gestures, native modules or the
things that have actually broken here: a sheet with no height cap that pushed its own
close button off-screen, a `Pressable` ancestor that swallowed a scroll, a `lineHeight`
inherited from a variant whose `fontSize` had been overridden.

A PR that changes anything visual says which screen was opened and what it showed.

**Native changes need a real build.** A JS change reloads over Metro; adding a native
module, a config plugin or an `app.json` key does not. `npx expo prebuild -p ios`,
rebuild, reinstall — a reload will show you the old binary and tell you nothing.

---

## 8. Merge only on green, and squash

Squash-merge, delete the branch. One issue becomes one commit on `main`, so the
history reads as a list of decisions rather than a stream of keystrokes.

---

## The short version

```
issue  →  (design doc, if the decision is hard)  →  branch  →  PR "Closes #N"
       →  npm run verify + a real device  →  squash-merge  →  issue closes itself
```

Nothing is in flight without an issue. Nothing merges without evidence — and on this
repo, evidence includes a screen someone looked at.
