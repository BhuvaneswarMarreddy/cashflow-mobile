@AGENTS.md

## Standing brief

This app is the phone half of CashFlow, and the standing brief lives in
[cashflow-forecast/CLAUDE.md](https://github.com/BhuvaneswarMarreddy/cashflow-forecast/blob/main/CLAUDE.md): read it before any slice. It **computes no money**: every figure is integer cents from a Cloud Function that runs the web app's `src/lib/**`, and a number the phone needs is a new or extended callable on the web side first, never a formula here. Web ships and matches to the cent before mobile renders it. `src/contracts/` pins those payloads (CI tests against cashflow-forecast `main`). Colours come from `src/theme/palette.ts`, copied from web `globals.css`. Native changes (widgets, config plugins) need a dev build and reach phones only through a manual TestFlight upload.
