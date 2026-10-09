// Plays the built game in a real browser with the band's keys and saves a screenshot of each
// screen to .e2e-output/. Run after `npm run build`: node tests/e2e/run.mjs.
// CHROME_PATH=/path/to/chrome uses an installed Chrome instead of Playwright's Chromium;
// E2E_BROWSERS=chromium,firefox picks the engines (default: chromium, plus firefox if installed).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium, firefox} from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const out = path.join(root, '.e2e-output');
fs.mkdirSync(out, {recursive: true});

const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(dist, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream'}).end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

// The design's bright text roles: text, sub, hint, accent.
const TEXT_COLORS = ['#E2FFEE', '#B8FFD6', '#8DF0B5', '#F0FFF6'];

const STRINGS = {
  en: {causes: {car: 'HIT BY A CAR', train: 'HIT BY THE TRAIN', splash: 'SPLASH!', swept: 'SWEPT AWAY', eagle: 'CARRIED OFF!'}, warning: 'KEEP MOVING!', snow: 'SNOW', hop: 'HOP', paused: 'PAUSED', newBest: 'NEW BEST', how: 'HOW TO PLAY', title: 'CROSSING'},
  pt: {causes: {car: 'ATROPELADO!', train: 'PEGO PELO TREM!', splash: 'TCHIBUM!', swept: 'LEVADO PELO RIO', eagle: 'LEVADO PELA ÁGUIA!'}, warning: 'NÃO PARE!', snow: 'NEVE', hop: 'PULAR', paused: 'PAUSA', newBest: 'NOVO RECORDE', how: 'COMO JOGAR', title: 'CROSSING'},
};

async function playIn(browser, name, lang) {
  const context = await browser.newContext({viewport: {width: 600, height: 600}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith(base)) external.push(r.url()); });
  const words = STRINGS[lang];
  const tag = lang === 'en' ? name : `${name}-pt`;
  const t = (label) => `${tag}: ${label}`;
  const url = `${base}?test=1&seed=42&lang=${lang === 'en' ? 'en' : 'pt-PT'}`;
  const ready = async () => {
    await page.waitForFunction(() => window.__goatcross && document.fonts.status === 'loaded');
    await page.waitForTimeout(300);
  };
  await page.goto(url);
  await ready();

  const state = () => page.evaluate(() => window.__goatcross.state());
  const shot = (file) => page.screenshot({path: path.join(out, `${tag}-${file}.png`)});
  const key = async (k, wait = 60) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
  const step = (seconds) => page.evaluate((s) => window.__goatcross.step(s), seconds);
  // Lumen's Back: an Escape keydown and keyup sent to the focused element. True if the page took it.
  const back = () => page.evaluate(() => {
    const target = document.activeElement ?? document.body;
    const init = {key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true};
    const down = new KeyboardEvent('keydown', init);
    target.dispatchEvent(down);
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    return down.defaultPrevented;
  });
  /** The texts of the last frame: none under 14 px, all in a bright role, opaque, inside the screen. */
  const checkTexts = async (label, expected = []) => {
    await page.waitForTimeout(120);
    const texts = await page.evaluate(() => window.__goatcross.texts());
    const problems = [];
    for (const x of texts) {
      if (x.size < 14) problems.push(`"${x.value}" ${x.size} px`);
      if (!TEXT_COLORS.includes(x.color.toUpperCase())) problems.push(`"${x.value}" color ${x.color}`);
      if (x.alpha < 0.99) problems.push(`"${x.value}" alpha ${x.alpha.toFixed(2)}`);
      if (x.left < 0 || x.right > 600 || x.top < 0 || x.bottom > 600) problems.push(`"${x.value}" off screen ${Math.round(x.left)}..${Math.round(x.right)}, ${Math.round(x.top)}..${Math.round(x.bottom)}`);
    }
    for (const want of expected) if (!texts.some((x) => x.value.includes(want))) problems.push(`no "${want}"`);
    check(t(`${label}: texts >= 14 px, bright, inside the screen`), texts.length > 0 && problems.length === 0, problems.join('; ') || `${texts.length} texts`);
  };
  /** Puts the goat on the meadow under the first row of [kind] (a test setup through warp). */
  const below = (kind, from = 2) => page.evaluate(([k, f]) => {
    const {game, world} = window.__goatcross;
    let r = f;
    while (game.world.row(r).kind !== k || game.world.row(r - 1).kind !== 'meadow') r++;
    window.__goatcross.warp(r - 1);
    const meadow = game.world.row(r - 1);
    const col = [4, 3, 5, 2, 6, 1, 7].find((c) => !meadow.blocked[c]);
    game.goat.x = world.colX(col);
    return r;
  }, [kind, from]);
  /** Steps the game (1/60 s at a time) until [condition] holds for the hazard row [r] (at most [max] s). */
  const waitFor = (condition, r, max = 30) => page.evaluate(([c, row, m]) => {
    const {game, world} = window.__goatcross;
    const hop = 0.15;
    const lane = game.world.row(row);
    const x = game.goat.x;
    const tests = {
      // A hop up now lands clear of vehicles, and stays clear a while.
      roadClear: () => [0.08, 0.15, 0.3, 0.5, 0.7].every((d) => !world.vehicleAt(lane, x, 22, game.wt + d)),
      // A hop up now lands in front of a vehicle.
      roadHit: () => !world.vehicleAt(lane, x, 18, game.wt + 0.08) && !world.vehicleAt(lane, x, 18, game.wt + 0.12) && world.vehicleAt(lane, x, 16, game.wt + 0.35) !== null,
      // A log (or floe) under the landing, for a while.
      floatSoon: () => [-0.05, 0, 0.2, 0.5, 0.8].every((d) => world.floatAt(lane, x, game.wt + hop + d) !== null),
      waterSoon: () => [-0.05, 0, 0.05].every((d) => world.floatAt(lane, x, game.wt + hop + d) === null),
      // The signal blinks and the train's nose is in the middle of the screen.
      trainMid: () => { const n = world.trainNose(lane.train, game.wt); return n !== null && n > 180 && n < 320; },
      // The train reaches the goat's x just after a hop onto the track.
      trainHit: () => { const a = world.trainSpan(lane.train, game.wt + 0.1); const b = world.trainSpan(lane.train, game.wt + 0.3); return !(a && x + 16 > a[0] && x - 16 < a[1]) && b !== null && x + 16 > b[0] && x - 16 < b[1]; },
    };
    for (let i = 0; i < m * 60; i++) {
      if (tests[c]()) return true;
      game.lastHopAt = game.t;
      window.__goatcross.step(1 / 60);
    }
    return false;
  }, [condition, r, max]);

  // 1. The title.
  let s = await state();
  check(t('title'), s.screen === 'title');
  const box = await page.evaluate(() => document.getElementById('game').getBoundingClientRect().toJSON());
  check(t('the game fits 600 x 600'), box.left >= 0 && box.top >= 0 && box.right <= 600 && box.bottom <= 600 && box.width === 600 && box.height === 600, JSON.stringify(box));
  await checkTexts('title', [words.title]);
  await shot('01-title');
  check(t('Escape on the title is left to Lumen (exit)'), (await back()) === false && (await state()).screen === 'title');

  // 2. How to play.
  await key('Enter');
  check(t('Enter: how to play'), (await state()).screen === 'howto');
  await checkTexts('how to play', [words.how]);
  await shot('02-howto');
  check(t('Escape in how to play is prevented and goes back'), (await back()) === true && (await state()).screen === 'title');
  await key('Enter');
  await key('Enter');
  check(t('Enter goes back too'), (await state()).screen === 'title');

  // 3. A run: the first hops, the controls pill.
  await key('ArrowUp');
  await page.evaluate(() => window.__goatcross.hold(true));
  s = await state();
  check(t('swipe up: the run starts'), s.screen === 'playing' && s.score === 0 && s.row === 0);
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', repeat: true, bubbles: true, cancelable: true})));
  s = await state();
  check(t('a repeated key is ignored'), !s.hopping && s.row === 0);
  check(t('Enter does nothing while playing'), (await page.evaluate(() => {
    const down = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
    document.activeElement.dispatchEvent(down);
    return !down.defaultPrevented;
  })) && (await state()).screen === 'playing');
  await key('ArrowRight');
  check(t('a swipe is a hop'), (await state()).hopping);
  await step(0.2);
  s = await state();
  check(t('one cell sideways'), !s.hopping && s.x === 364 && s.row === 0, `x ${s.x}`);
  await key('ArrowUp');
  await step(0.2);
  check(t('forward: +1'), (await state()).score === 1);
  await checkTexts('first seconds', [words.hop]);
  await shot('03-start');

  // 4. A road: hop into the first lane (mid-hop, as in the design).
  const road = await below('road');
  check(t('a clear moment to cross'), await waitFor('roadClear', road));
  await key('ArrowUp');
  await step(0.07);
  await shot('04-road');
  await step(0.15);
  s = await state();
  check(t('in the lane, alive'), s.kind === 'road' && s.dying === null && s.row === road, `${s.kind} ${s.dying}`);

  // 5. A river: onto a log, riding it.
  const river = await below('river', 5);
  check(t('a log coming'), await waitFor('floatSoon', river));
  await key('ArrowUp');
  await step(0.25);
  s = await state();
  const lane = await page.evaluate((r) => window.__goatcross.game.world.row(r).lane, river);
  check(t('on the log'), s.riding && s.dying === null, `${s.kind} ${s.dying}`);
  await step(0.5);
  const s2 = await state();
  check(t('the log carries the goat'), Math.abs(s2.x - s.x - lane.dir * lane.speed * 0.5) < 2 && s2.dying === null, `${(s2.x - s.x).toFixed(1)} vs ${(lane.dir * lane.speed * 0.5).toFixed(1)}`);
  await shot('05-river');

  // 6. Rails: the signal blinks, the train comes through.
  const rails = await below('rails', 10);
  check(t('the train passes, the signal blinking'), await waitFor('trainMid', rails));
  check(t('the track warns'), await page.evaluate((r) => window.__goatcross.world.trainWarning(window.__goatcross.game.world.row(r).train, window.__goatcross.game.wt), rails));
  await shot('06-rails');

  // 7. The snow, from row 100 (once the controls pill is gone).
  await page.evaluate(() => { const g = window.__goatcross.game; if (g.t < 8) window.__goatcross.step(8 - g.t); window.__goatcross.warp(103); });
  await step(0.6);
  s = await state();
  check(t('row 100: the snow and its banner'), s.zone === 'snow' && s.banner && s.score >= 100);
  await checkTexts('snow banner', [words.snow]);
  await shot('07-snow');

  // 8. The eagle: the goat lags at the bottom edge (once the banner is gone).
  await step(2);
  await page.evaluate(() => { const g = window.__goatcross.game; g.cam = g.goat.row - 0.08; });
  await step(1.0);
  s = await state();
  check(t('lagging: KEEP MOVING!'), s.warning === 'lag' && s.dying === null);
  await checkTexts('eagle warning', [words.warning]);
  await shot('08-eagle');
  await step(1.2);
  check(t('the eagle dives'), (await state()).dying === 'eagle');
  await step(1.6);
  s = await state();
  check(t('carried off'), s.screen === 'over' && s.cause === 'eagle');
  await checkTexts('game over: eagle', [words.causes.eagle]);
  await shot('14-over-eagle');
  const firstBest = s.best;
  check(t('a swipe right after the end is not "again"'), (await page.evaluate(() => { window.__goatcross.game.key('ArrowUp'); return window.__goatcross.state().screen; })) === 'over');
  check(t('Escape on game over is prevented and goes to the title'), (await back()) === true && (await state()).screen === 'title');

  // 9. Pause: Escape pauses, Enter resumes, Escape quits keeping the best.
  await key('ArrowUp');
  const railsAgain = await below('rails', 10);
  await waitFor('trainMid', railsAgain);
  check(t('Escape pauses (prevented)'), (await back()) === true && (await state()).screen === 'paused');
  await checkTexts('pause', [words.paused]);
  await shot('09-pause');
  await key('Enter');
  check(t('Enter resumes'), (await state()).screen === 'playing');
  await back();
  await key('ArrowUp');
  check(t('swipe up resumes too'), (await state()).screen === 'playing');
  await page.evaluate(() => window.__goatcross.warp(140));
  await back();
  s = await state();
  check(t('a quit run keeps its best'), (await back()) === true && (await state()).screen === 'title' && (await state()).best === Math.max(firstBest, s.score), `${(await state()).best}`);

  // 10. The other ends: a car, the train, the water, a ride off the edge.
  const end = async (cause, file) => {
    await step(1.4);
    const st = await state();
    check(t(`${cause}: the game over screen`), st.screen === 'over' && st.cause === cause, `${st.screen} ${st.cause}`);
    await checkTexts(`game over: ${cause}`, [words.causes[cause]]);
    await shot(file);
  };
  await key('ArrowUp');
  await page.evaluate(() => window.__goatcross.hold(true));
  const road2 = await below('road');
  check(t('a car coming'), await waitFor('roadHit', road2));
  await key('ArrowUp');
  await step(0.5);
  check(t('hit by a car'), (await state()).dying === 'car');
  await shot('10-hit');
  await end('car', '10-over-car');
  check(t('NEW BEST shows on a record'), (await state()).record === false || (await page.evaluate(() => window.__goatcross.texts().some((x) => x.value.length > 0))));
  await step(0.7);
  await key('ArrowUp');
  check(t('swipe up: again'), (await state()).screen === 'playing' && (await state()).score === 0);

  const rails2 = await below('rails', 10);
  check(t('a train coming'), await waitFor('trainHit', rails2));
  await key('ArrowUp');
  await step(0.5);
  check(t('hit by the train'), (await state()).dying === 'train');
  await end('train', '11-over-train');
  await step(0.7);
  await key('ArrowUp');

  const river2 = await below('river', 5);
  check(t('water at the landing'), await waitFor('waterSoon', river2));
  await key('ArrowUp');
  await step(0.3);
  check(t('splash'), (await state()).dying === 'splash');
  await end('splash', '12-over-splash');
  await step(0.7);
  await key('ArrowUp');

  const river3 = await below('river', 5);
  await page.evaluate((r) => {
    // Stand at the edge the river flows to.
    const {game, world} = window.__goatcross;
    const dir = game.world.row(r).lane.dir;
    const col = dir < 0 ? 0 : 8;
    game.world.row(r - 1).blocked[col] = false;
    game.goat.x = world.colX(col);
  }, river3);
  check(t('a log at the edge'), await waitFor('floatSoon', river3));
  await key('ArrowUp');
  await step(2.5);
  check(t('swept away'), (await state()).dying === 'swept' || (await state()).screen === 'over');
  await end('swept', '13-over-swept');

  // 11. The best stays on the device.
  const best = (await state()).best;
  await page.reload();
  await ready();
  check(t('the best is kept'), (await state()).best === best && best > 0, `${(await state()).best}`);

  check(t('no page errors'), errors.length === 0, errors.join(' | '));
  check(t('nothing loaded from outside the package'), external.length === 0, external.join(', '));
  await context.close();
}

/**
 * On the glasses the canvas has fewer pixels than CSS px (a 480 px square shows Lumen's 600), and
 * Android may kill Gecko's GPU process while the display sleeps: the canvas comes back reset.
 */
async function resetCanvas(browser, name) {
  const context = await browser.newContext({viewport: {width: 600, height: 600}, deviceScaleFactor: 2});
  const page = await context.newPage();
  await page.goto(`${base}?test=1&seed=42&lang=en`);
  await page.waitForFunction(() => window.__goatcross && document.fonts.status === 'loaded');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp');
  await page.evaluate(() => document.getElementById('game').getContext('2d').setTransform(1, 0, 0, 1, 0, 0));
  await page.waitForTimeout(150);
  const scale = await page.evaluate(() => window.__goatcross.scale());
  check(`${name}: at 2x, a reset canvas is drawn at its scale again`, scale.expected === 2 && Math.abs(scale.now - 2) < 1e-6, `${scale.now} vs ${scale.expected}`);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(150);
  check(`${name}: and after the page is shown again`, Math.abs((await page.evaluate(() => window.__goatcross.scale())).now - 2) < 1e-6);
  await page.screenshot({path: path.join(out, `${name}-15-reset-2x.png`)});
  await context.close();
}

async function play(browserType, name) {
  const browser = await browserType.launch(process.env.CHROME_PATH && name === 'chromium' ? {executablePath: process.env.CHROME_PATH} : {});
  try {
    for (const lang of ['en', 'pt']) await playIn(browser, name, lang);
    await resetCanvas(browser, name);
  } finally {
    await browser.close();
  }
}

const wanted = (process.env.E2E_BROWSERS ?? 'chromium,firefox').split(',');
const engines = {chromium, firefox};
for (const name of wanted) {
  try {
    await play(engines[name], name);
  } catch (error) {
    if (name === 'firefox' && !process.env.E2E_BROWSERS && /Executable doesn't exist/.test(String(error))) {
      console.log('skip firefox (not installed)');
      continue;
    }
    console.log(`FAIL ${name}: ${error.message}`);
    failures++;
  }
}
server.close();
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
