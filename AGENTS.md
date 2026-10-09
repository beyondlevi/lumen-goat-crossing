# Working on this game

A [Rokid Lumen](https://github.com/beyondlevi/rokid-lumen) web app: a canvas game that Lumen runs
offline on Rokid glasses from a `.mrbd.zip` package. Lumen's guide for apps is
[docs/building-apps.md](https://github.com/beyondlevi/rokid-lumen/blob/main/docs/building-apps.md).
It doesn't use the UI Toolkit for Meta Ray-Ban Display: it follows its own approved design, drawn
as line art on a `<canvas>`.

## Rules

- **The band drives it as keys.** Swipes are arrow keys (one hop each), the index tap is `Enter`,
  the middle tap is Back (`Escape`, sent to the focused element). Call `preventDefault()` on
  `Escape` only when the game used it: on the title it must reach Lumen, which closes the app.
  `Enter` does nothing during a run. Ignore repeated keys.
- **Black is see-through on the glasses**, and their display is green: colors become brightness.
  Use the design's Rokid palette (`P` in `src/draw.ts`); row kinds differ by pattern, things by
  shape and brightness. Texts at least 14 px, only in its bright text roles (text, sub, hint,
  accent).
- **The screen is 600 x 600** (Lumen's web app square), the canvas scaled to fit. Set its scale on
  every frame and again on `contextrestored` and when the page is shown: while the glasses sleep,
  Android may kill Gecko's GPU process, and the canvas comes back reset.
- **Animations run at 30 fps on the glasses.** The game advances in fixed 1/60 s steps from the
  frame time; keep motion readable at 30 fps.
- **A hidden app is suspended**: a run pauses on `visibilitychange`. The best is saved as soon as a
  run beats it (`localStorage`, `goat-crossing.best`), so a run that is quit or closed keeps it.
- **Fair crossings.** `World` only builds rows a goat gets through with the band's latency (up to
  about 0.4 s from the gesture to the key): meadows never trap the goat, road gaps leave time to
  hop in and out, logs come often, rivers side by side flow in turns, trains are announced. The
  unit tests check it on many seeds, with a bot that hops 0.3 s late.
- **Offline.** Fonts and everything else ship in the package; nothing loads from the internet.
  The manifest has no `lumen_internet` and no `lumen_config`.
- **English first, multilingual from the start.** Every text lives in `src/i18n.ts`, English by
  default and Brazilian Portuguese (`pt`, for any `pt-*`) with it; placeholders, never
  concatenation. Code, comments, docs and commits in English.
- **An original game**: its own art and names, nothing borrowed from commercial games of the genre.
- **GeckoView only** (Firefox 156 on the glasses).

## Commands

- `npm run dev`, `npm run typecheck`, `npm test` (unit), `npm run test:e2e` (after a build: plays
  the game in Chromium and Firefox with the band's keys, screenshots in `.e2e-output/`)
- `npm run package` builds `dist/lumen-goat-crossing.mrbd.zip`, the package Lumen installs.
- `?test=1` exposes `window.__goatcross` (`game`, `state()`, `step(seconds)`, `warp(rows)`) for the
  e2e test.
