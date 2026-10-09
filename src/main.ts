import {Game, type Store} from './game';
import {languageFor, numberFormat, stringsFor} from './i18n';
import {lastTexts, recordTexts, render, type Texts} from './render';
import * as world from './world';
import {H, W} from './world';

const BEST_KEY = 'goat-crossing.best';

/** The best run, kept on the device (each Lumen app has its own origin and storage). */
const store: Store = {
  get() {
    try {
      return Math.max(0, Math.floor(Number(localStorage.getItem(BEST_KEY))) || 0);
    } catch {
      return 0;
    }
  },
  set(best) {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Private mode or full storage: the best lasts for this session.
    }
  },
};

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff);
const language = languageFor(params.get('lang') ?? navigator.language);
document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en';
const texts: Texts = {s: stringsFor(language), num: numberFormat(language)};

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', {alpha: false})!;
const game = new Game(seed, store);

/** Canvas pixels per logical unit, set by [fit]. */
let pixels = 1;

/** The 600 x 600 screen, scaled to fit the window (on the glasses, Lumen's square is 600 x 600). */
function fit(): void {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  const dpr = devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
  canvas.width = Math.floor(W * scale * dpr);
  canvas.height = Math.floor(H * scale * dpr);
  pixels = canvas.width / W;
}

/**
 * Draws a frame, setting the scale every time: while the glasses' display sleeps, Android may kill
 * Gecko's GPU process, and the canvas comes back with its state reset. A scale set once would be
 * lost then, and the game drawn at 1:1, cut at the right and the bottom.
 */
function draw(): void {
  ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
  render(ctx, game, texts);
}

addEventListener('resize', fit);
canvas.addEventListener('contextrestored', () => {
  fit();
  draw();
});
fit();

// The band arrives as keys: swipes are arrows, the index tap is Enter, the middle tap is Escape
// (Lumen's Back). Escape on the title is left alone, so Back closes the app.
document.addEventListener('keydown', (event) => {
  if (event.repeat) {
    if (event.key === 'Escape' && game.screen !== 'title') event.preventDefault();
    return;
  }
  if (game.key(event.key)) event.preventDefault();
});

let last = performance.now();
let frame = 0;
/** Test hook: the game waits for step() instead of the clock. */
let held = false;

function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!held) game.update(dt);
  draw();
  frame = requestAnimationFrame(loop);
}

// Hidden (the display off, another screen in front): a run waits paused, the best is kept, and
// nothing draws. Back on screen, the canvas is set up again: it may have been reset.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.hidden();
    cancelAnimationFrame(frame);
  } else {
    fit();
    last = performance.now();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(loop);
  }
});
addEventListener('pagehide', () => game.hidden());

async function start(): Promise<void> {
  const fonts = [
    new FontFace('Bungee', 'url(fonts/Bungee-Regular-latin.woff2)'),
    new FontFace('Chakra Petch', 'url(fonts/ChakraPetch-SemiBold-latin.woff2)', {weight: '500 600'}),
    new FontFace('Chakra Petch', 'url(fonts/ChakraPetch-Bold-latin.woff2)', {weight: '700'}),
  ];
  await Promise.all(fonts.map(async (font) => {
    try {
      document.fonts.add(await font.load());
    } catch {
      // A font that doesn't load falls back to the system's.
    }
  }));
  canvas.focus();
  last = performance.now();
  frame = requestAnimationFrame(loop);
}

// The e2e test's hook, only with ?test=1.
if (params.get('test') === '1') {
  recordTexts(true);
  (window as unknown as {__goatcross: unknown}).__goatcross = {
    game,
    world,
    state: () => ({
      screen: game.screen,
      score: game.score,
      best: game.best,
      previousBest: game.previousBest,
      record: game.record,
      row: game.goat.row,
      x: game.goat.x,
      kind: game.world.row(game.goat.row).kind,
      hopping: game.goat.hop !== null,
      riding: game.goat.hop === null && game.world.row(game.goat.row).kind === 'river',
      warning: game.warning?.cause ?? null,
      dying: game.dying?.cause ?? null,
      cause: game.cause,
      zone: game.zone,
      banner: game.bannerAt !== null,
      cam: game.cam,
      t: game.t,
    }),
    /** Runs the game [seconds] ahead in fixed steps, and draws. */
    step: (seconds: number) => {
      for (let i = 0; i < Math.round(seconds * 60); i++) game.update(1 / 60);
      draw();
    },
    warp: (rows: number) => {
      game.warp(rows);
      draw();
    },
    /** Stops (true) or restarts (false) the real-time clock; step() still runs the game. */
    hold: (on: boolean) => {
      held = on;
    },
    texts: () => lastTexts(),
    scale: () => ({now: ctx.getTransform().a, expected: canvas.width / W}),
  };
}

void start();
