## What changed

<!-- One or two sentences. What a reader needs to know before the diff. -->

## Why

<!-- The defect, the measurement, or the decision behind it. If a figure was
     wrong on screen, say what it read before and after. -->

## Evidence

- [ ] `npm run verify` — typecheck, lint and tests green (CI runs it too)

## Web

<!-- One product, two repos. A feature is not done until both halves are live. -->

- [ ] No web change needed, or its PR is linked: BhuvaneswarMarreddy/cashflow-forecast#
- [ ] Ran on a real device (say which screen, and what it showed)
- [ ] Native change? `npx expo prebuild -p ios` and a fresh build, not just a reload

## Money

<!-- Delete if this PR touches no figure.

     This client computes no money. If the diff adds arithmetic over cents,
     say why the server could not do it — see ARCHITECTURE.md. -->

- [ ] No new money arithmetic in this client, or the reason is stated above

## Risk

<!-- What could this break, and what would show it. For anything that renders a
     figure: which numbers move, and why that is correct. -->
