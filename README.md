# Goat Crossing

An endless crossing game for [Rokid Lumen](https://github.com/beyondlevi/rokid-lumen) glasses,
played with the Meta Neural Band. Hop the goat across meadows, roads, rivers and rails, one swipe
per hop, as far as you can go. Keep moving: the view creeps forward, and an eagle is watching.

| Band | In the game |
| --- | --- |
| Swipe up | Hop forward (+1 for every new row) |
| Swipe left, right | Hop sideways |
| Swipe down | Hop back |
| Index tap | How to play (title), resume (pause), again (game over) |
| Middle tap | Pause; quit to the title from the pause or the game over; exit from the title |

A swipe made while the goat is in the air is kept and done when it lands. The best run stays on
the glasses, even when a run is quit or the glasses go to sleep.

## Rows

| Row | What happens there |
| --- | --- |
| Meadow | Safe. Rocks and trees block a cell, but a meadow always leaves a way forward |
| Road | Cars and trucks, each lane its own way and speed. Don't get hit |
| River | Ride the logs. Water is deadly, and so is drifting off the edge on a log |
| Rails | The signal blinks 1.8 s before a train comes through, very fast |

From row 100 the valley turns to **snow**: snowy meadows, and ice floes that drift faster than
logs. The view creeps forward once you start, a little faster as you go. Fall behind to the bottom
edge, or wait 5 s without a hop, and **KEEP MOVING!** shows: hop forward within 2 s, or the eagle
carries the goat off.

Every crossing is generated, and only with rows a goat can get through with the band's delay
between a gesture and the hop: wide road gaps, logs that come often, rivers side by side that flow
in turns, trains announced in time. The unit tests check it on many crossings, and a bot that only
uses the four hops, each 0.3 s late, crosses 150 rows on at least 18 of 20.

## Install on the glasses

Download the `.mrbd.zip` from the latest [release](https://github.com/beyondlevi/lumen-goat-crossing/releases)
and add it from the Lumen companion's Apps tab, or push it to the glasses:

```sh
adb push lumen-goat-crossing-<version>.mrbd.zip /sdcard/Android/data/dev.lumen.glasses/files/webapps/
```

Lumen installs it the next time its home opens. The game never uses the internet.

## Development

```sh
npm ci
npm run dev        # http://localhost:5173 (arrows, Enter, Escape play it)
npm run typecheck
npm test           # unit tests: the rows' guarantees, hits, the eagle, the screens, the texts, the bot
npm run package    # dist/lumen-goat-crossing.mrbd.zip
npm run test:e2e   # after a build: plays it in Chromium and Firefox, screenshots in .e2e-output/
```

`CHROME_PATH=/usr/bin/google-chrome E2E_BROWSERS=chromium,firefox npm run test:e2e` uses an
installed Chrome. The game draws on a 600 x 600 canvas, the square Lumen gives a web app, in line
art on black: black is see-through on the glasses, and their green display turns colors into
brightness, so each row kind has its own pattern. The texts are in English and Brazilian Portuguese
(`src/i18n.ts`).

## License

MIT (see [LICENSE](LICENSE)). The fonts, [Bungee](https://github.com/djrrb/Bungee) and
[Chakra Petch](https://github.com/m4rc1e/Chakra-Petch), are under the SIL Open Font License 1.1
(`public/fonts/OFL-*.txt`).
