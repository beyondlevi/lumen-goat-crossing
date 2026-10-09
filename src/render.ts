import {
  P, drawArrow, drawCar, drawEagle, drawFloe, drawFloor, drawGoat, drawHorns, drawLog, drawRock, drawSignal, drawStar,
  drawTrain, drawTree, drawTruck, meadowGround, railsGround, roadGround, topFade, waterGround, type Arrow, type Pose,
} from './draw';
import {
  BANNER_TIME, DEATH_TIME, EAGLE_DIVE, HINT_FADE, HINT_TIME, HOP_TIME, type Dying, type Game, type Warning,
} from './game';
import {fill, rows, type Strings} from './i18n';
import {
  BASE, CELL, H, LENGTH, SNOW_FROM, W, X0, X1, colX, moverX, trainNose, trainWarning, type Lane, type Row,
} from './world';

const TITLE_FONT = 'Bungee, "Chakra Petch", sans-serif';
const BODY_FONT = '"Chakra Petch", sans-serif';

/** What the screens need besides the game: the texts and the number format of the language. */
export interface Texts {
  s: Strings;
  num: (n: number) => string;
}

interface Font {
  size: number;
  /** Bungee (400); otherwise Chakra Petch at [weight]. */
  title?: boolean;
  weight?: number;
  /** Letter spacing, px (after each letter, as CSS does). */
  spacing?: number;
}

/** A text as drawn, for the e2e test: its size, color, opacity and box. */
export interface DrawnText {
  value: string;
  size: number;
  color: string;
  alpha: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

let drawn: DrawnText[] | null = null;

/** Test hook: keep the texts of each frame. */
export function recordTexts(on: boolean): void {
  drawn = on ? [] : null;
}

/** The texts of the last frame (with recordTexts on). */
export function lastTexts(): DrawnText[] {
  return drawn ?? [];
}

type Ctx = CanvasRenderingContext2D;

function fontOf(f: Font): string {
  return f.title ? `400 ${f.size}px ${TITLE_FONT}` : `${f.weight ?? 600} ${f.size}px ${BODY_FONT}`;
}

/** The width of [value] in [f], with the letter spacing (trailing included, as CSS lays it out). */
function measure(ctx: Ctx, value: string, f: Font): number {
  ctx.font = fontOf(f);
  return ctx.measureText(value).width + (f.spacing ?? 0) * value.length;
}

/** Draws [value] with its baseline at [y]; returns its width. */
function text(ctx: Ctx, value: string, x: number, y: number, f: Font, color: string, align: 'left' | 'center' | 'right' = 'left'): number {
  const spacing = f.spacing ?? 0;
  const w = measure(ctx, value, f);
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (!spacing) {
    ctx.fillText(value, left, y);
  } else {
    for (let i = 0; i < value.length; i++) ctx.fillText(value[i], left + ctx.measureText(value.slice(0, i)).width + spacing * i, y);
  }
  drawn?.push({value, size: f.size, color, alpha: ctx.globalAlpha, left, right: left + w - spacing, top: y - f.size * 0.75, bottom: y + f.size * 0.22});
  return w;
}

/** [f], smaller if needed (never under 14 px) so that [value] fits in [max] px. */
function fitting(ctx: Ctx, value: string, f: Font, max: number): Font {
  let font = f;
  while (font.size > 14 && measure(ctx, value, font) > max) font = {...font, size: font.size - 1};
  return font;
}

/** Lines of [value] (split on \n), at the given baselines. */
function lines(ctx: Ctx, value: string, x: number, baselines: number[], f: Font, color: string, align: 'left' | 'center' = 'left'): void {
  const parts = value.split('\n');
  parts.forEach((part, i) => {
    const y = baselines[i] ?? baselines[baselines.length - 1] + (i - baselines.length + 1) * (baselines[1] - baselines[0] || 20);
    text(ctx, part, x, y, fitting(ctx, part, f, align === 'center' ? W - 40 : W - 24 - x), color, align);
  });
}

function roundBox(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, border: number, stroke: string, bg: string): void {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = border;
  ctx.beginPath();
  ctx.roundRect(x + border / 2, y + border / 2, w - border, h - border, Math.max(0, r - border / 2));
  ctx.stroke();
  ctx.restore();
}

/** A pill button whose box starts at [top], and its hint under it (the design's button()). */
function button(ctx: Ctx, label: string, hint: string, top: number, primary: boolean): void {
  const f: Font = {size: 20, title: true, spacing: 1};
  const w = Math.min(W - 40, Math.max(280, measure(ctx, label, f) + 52 + (primary ? 6 : 4)));
  roundBox(ctx, W / 2 - w / 2, top, w, 56, 28, primary ? 3 : 2, primary ? P.text : P.hint, primary ? P.focus : P.panel);
  text(ctx, label, W / 2, top + 35, fitting(ctx, label, f, w - 40), primary ? P.text : P.sub, 'center');
  text(ctx, hint, W / 2, top + 77, {size: 16}, P.hint, 'center');
}

// ---- The field ----

function rowTop(r: number, cam: number): number {
  return H - (r - cam + 1) * CELL;
}

function speedLinesOf(lane: Lane): number {
  return lane.speed < 85 ? 1 : lane.speed < 125 ? 2 : 3;
}

function ground(ctx: Ctx, row: Row, top: number, below: Row, above: Row, wt: number): void {
  switch (row.kind) {
    case 'meadow':
      meadowGround(ctx, top, row.look, row.obstacles.map((o) => o.col), row.snow);
      return;
    case 'road':
      roadGround(ctx, top, below.kind === 'road', above.kind === 'road');
      return;
    case 'river':
      waterGround(ctx, top, row.look, row.snow);
      return;
    case 'rails':
      railsGround(ctx, top, row.train !== null && trainWarning(row.train, wt));
      return;
  }
}

function signalLight(row: Row, wt: number): 0 | 1 | 2 {
  if (!row.signal || !trainWarning(row.signal, wt)) return 0;
  return Math.floor(wt * 4) % 2 === 0 ? 1 : 2;
}

function things(ctx: Ctx, row: Row, base: number, wt: number): void {
  if (row.kind === 'meadow') {
    for (const o of row.obstacles) {
      if (o.kind === 'rock') drawRock(ctx, colX(o.col), base);
      else if (o.kind === 'tree') drawTree(ctx, colX(o.col), base, row.snow);
      else drawSignal(ctx, colX(o.col), base, signalLight(row, wt));
    }
    return;
  }
  if (row.lane) {
    const lane = row.lane;
    for (const m of lane.movers) {
      const x = moverX(lane, m, wt);
      if (x > W + 40 || x + m.length < -40) continue;
      if (m.kind === 'log') drawLog(ctx, x, base, m.length, lane.dir);
      else if (m.kind === 'floe') drawFloe(ctx, x, base, m.length, lane.dir);
      else if (m.kind === 'truck') drawTruck(ctx, x, base, lane.dir, speedLinesOf(lane));
      else drawCar(ctx, x, base, lane.dir, P[m.kind], speedLinesOf(lane));
    }
    return;
  }
  if (row.train) {
    const nose = trainNose(row.train, wt);
    if (nose !== null) drawTrain(ctx, nose, base, row.train.dir, row.train.wagons);
  }
}

/** The dotted arc behind a hop, from where it left to where the goat is. */
function trail(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, vertical: boolean, facing: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = P.hint;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 9]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const mx = (x1 + x2) / 2 + (vertical ? -18 * facing : 0);
  const my = (y1 + y2) / 2 + (vertical ? 0 : -22);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** The goat as the game has it: standing, riding, mid-hop or nudged by a rock. */
function drawPlayer(ctx: Ctx, game: Game): void {
  const goat = game.goat;
  const cam = game.cam;
  const hop = goat.hop;
  let x = goat.x;
  let base = rowTop(game.visualRow(), cam) + BASE;
  let lift = goat.lift;
  let pose: Pose = game.t - goat.landedAt < 0.08 ? 'land' : 'stand';
  if (hop) {
    const p = Math.min(1, (game.t - hop.at) / HOP_TIME);
    lift = hop.fromLift + (hop.toLift - hop.fromLift) * p + Math.sin(Math.PI * p) * 16;
    pose = p < 0.55 ? 'jump' : 'land';
  }
  // The trail of the hop, and of the last one for a moment.
  const shown = hop ?? (goat.last && game.t - goat.landedAt < 0.25 ? goat.last : null);
  if (shown) {
    const vertical = shown.move === 'up' || shown.move === 'down';
    const y1 = rowTop(shown.fromRow, cam) + BASE - shown.fromLift - 4;
    const alpha = hop ? 1 : 1 - (game.t - goat.landedAt) / 0.25;
    if (hop ? (game.t - hop.at) / HOP_TIME > 0.2 : true) trail(ctx, shown.fromX - 12 * goat.facing, y1, x - 10 * goat.facing, base - lift - 8, vertical, goat.facing, alpha);
  }
  if (goat.bump) {
    const u = (game.t - goat.bump.at) / 0.14;
    if (u < 1) {
      const off = Math.sin(Math.PI * u) * 7;
      if (goat.bump.move === 'left') x -= off;
      if (goat.bump.move === 'right') x += off;
      if (goat.bump.move === 'up') base -= off;
      if (goat.bump.move === 'down') base += off;
    }
  }
  drawGoat(ctx, x, base - lift, 0.86, goat.facing, pose);
}

/** Where the eagle waits during a warning (screen coordinates). */
function eagleSpot(game: Game, warning: {at: number; side: 1 | -1}, goatX: number): {x: number; y: number} {
  const enter = Math.min(1, (game.t - warning.at) / 0.4);
  return {
    x: Math.max(70, Math.min(W - 70, goatX + warning.side * 158)),
    y: -40 + (168 + 40) * enter * (2 - enter) + 4 * Math.sin(game.clock * 3),
  };
}

/** "KEEP MOVING!": the eagle waits, a target around the goat, the dive's path. */
function drawWarning(ctx: Ctx, game: Game, warning: Warning): void {
  const goat = game.goat;
  const feet = rowTop(game.visualRow(), game.cam) + BASE - goat.lift;
  const e = eagleSpot(game, warning, goat.x);
  const side = warning.side;
  ctx.save();
  ctx.strokeStyle = P.danger;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -game.clock * 12;
  ctx.beginPath();
  ctx.ellipse(goat.x, feet - 22, 42, 32, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.setLineDash([3, 9]);
  ctx.lineDashOffset = 0;
  const sx = e.x - side * 18;
  const sy = e.y + 28;
  const ex = goat.x + side * 30;
  const ey = feet - 56;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.bezierCurveTo(sx - side * 20, sy + 104, ex + side * 30, ey - 110, ex, ey);
  ctx.stroke();
  ctx.restore();
  drawEagle(ctx, e.x, e.y, 2.1, -side, true, Math.sin(game.clock * 7));
}

/** The end of a run, as it plays before the game over screen. */
function drawDying(ctx: Ctx, game: Game, d: Dying): void {
  const u = game.t - d.at;
  const base = rowTop(d.visualRow, game.cam) + BASE;
  if (d.cause === 'car' || d.cause === 'train') {
    const knock = Math.min(1, u / 0.22);
    const x = d.x + d.dir * 22 * knock;
    const feet = base - d.lift * (1 - knock);
    if (u < 0.6) {
      ctx.save();
      ctx.translate(d.x - d.dir * 30, feet - 30);
      ctx.scale(-d.dir, 1);
      ctx.strokeStyle = P.danger;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.stroke(new Path2D('M0 -14 l-9 -9 M-4 0 l-13 0 M0 14 l-9 9 M4 -20 l0 -10'));
      ctx.restore();
    }
    drawGoat(ctx, x, feet, 0.86, d.facing, 'fall', 24 * d.dir * knock);
    if (u > 0.12) {
      [7, 6, 5].forEach((r, i) => {
        const a = game.clock * 3 + (i * Math.PI * 2) / 3;
        drawStar(ctx, x + Math.cos(a) * 20, feet - 58 + Math.sin(a) * 6, r, P.sub);
      });
    }
    return;
  }
  if (d.cause === 'splash' || d.cause === 'swept') {
    const x = Math.max(X0 + 12, Math.min(X1 - 12, d.x));
    const y = base - 4;
    const grow = 0.6 + 0.6 * Math.min(1, u / 0.8);
    ctx.save();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = P.water;
    ctx.beginPath();
    ctx.ellipse(x, y, 44 * grow, 10 * grow, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = P.ice;
    ctx.beginPath();
    ctx.ellipse(x, y, 26 * grow, 6 * grow, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (u < 0.7) drawHorns(ctx, x, y - 8 + u * 12);
    ctx.save();
    ctx.globalAlpha *= Math.max(0, 1 - u / 1.1);
    for (const [bx, by, r] of [[8, 28, 4], [18, 42, 3], [2, 50, 2.4]]) {
      ctx.beginPath();
      ctx.arc(x + bx, y - by - u * 24, r, 0, Math.PI * 2);
      ctx.strokeStyle = P.sub;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  // The eagle: a dive to the goat, then up and out of the top of the view.
  const feet = base - d.lift;
  const start = eagleSpot(game, {at: d.at - 1, side: d.side}, d.x);
  const grab = {x: d.x, y: feet - 64};
  if (u < EAGLE_DIVE) {
    const k = u / EAGLE_DIVE;
    const ease = k * k;
    const ex = start.x + (grab.x - start.x) * ease;
    const ey = start.y + (grab.y - start.y) * ease;
    drawGoat(ctx, d.x, feet, 0.86, d.facing, 'stand');
    drawEagle(ctx, ex, ey, 2.1, -d.side, true, -0.6);
    return;
  }
  const k = Math.min(1, (u - EAGLE_DIVE) / (DEATH_TIME.eagle - EAGLE_DIVE));
  const ease = k * k;
  const ex = grab.x + d.side * 40 * ease;
  const ey = grab.y + (-140 - grab.y) * ease;
  drawGoat(ctx, ex, ey + 70, 0.8, d.facing, 'fall');
  drawEagle(ctx, ex, ey, 2.1, -d.side, true, Math.sin(game.clock * 14));
}

/** The rows on screen, their things, the goat, and the bottom edge. */
function field(ctx: Ctx, game: Game): void {
  const {world, cam} = game;
  const wt = game.wt;
  const lo = Math.floor(cam) - 1;
  const hi = Math.ceil(cam) + 10;
  for (let r = lo; r <= hi; r++) {
    const top = rowTop(r, cam);
    if (top > H || top < -CELL - 8) continue;
    ground(ctx, world.row(r), top, world.row(r - 1), world.row(r + 1), wt);
  }
  const goat = game.goat;
  const d = game.dying;
  const goatRow = d ? Math.floor(d.visualRow) : goat.hop ? Math.min(goat.hop.fromRow, goat.hop.toRow) : goat.row;
  for (let r = hi; r >= lo; r--) {
    const top = rowTop(r, cam);
    if (top > H + 8 || top < -CELL - 8) continue;
    things(ctx, world.row(r), top + BASE, wt);
    if (r === goatRow) {
      if (d) drawDying(ctx, game, d);
      else drawPlayer(ctx, game);
    }
  }
  if (!d && game.warning) drawWarning(ctx, game, game.warning);
  drawFloor(ctx, game.warning !== null || game.dying?.cause === 'eagle');
}

// ---- HUD, hints, banner ----

function hud(ctx: Ctx, game: Game, t: Texts): void {
  topFade(ctx);
  text(ctx, t.num(game.score), 22, 49, {size: 44, title: true}, P.text);
  text(ctx, t.s.best, 578, 25, {size: 14, weight: 700, spacing: 2}, P.hint, 'right');
  text(ctx, t.num(Math.max(game.best, game.score)), 578, 50, {size: 24, weight: 700}, P.text, 'right');
  if (game.warning && !game.dying && game.screen === 'playing') {
    text(ctx, t.s.warning, W / 2, 38, fitting(ctx, t.s.warning, {size: 20, title: true}, 300), P.text, 'center');
  }
}

/** HOP / SIDEWAYS / BACK, for the first seconds of a run. */
function controls(ctx: Ctx, t: Texts, alpha: number): void {
  const items: [Arrow[], string][] = [[['up'], t.s.hop], [['left', 'right'], t.s.sideways], [['down'], t.s.back]];
  const f: Font = {size: 16, weight: 700};
  const widths = items.map(([arrows, label]) => arrows.length * 24 + 4 + measure(ctx, label, f));
  const w = widths.reduce((a, b) => a + b, 0) + 18 * (items.length - 1) + 48;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const left = W / 2 - w / 2;
  roundBox(ctx, left, 532, w, 46, 23, 2, P.line, P.panel);
  let x = left + 24;
  items.forEach(([arrows, label], i) => {
    arrows.forEach((a, k) => drawArrow(ctx, a, x + k * 24, 544, 22, P.text));
    text(ctx, label, x + arrows.length * 24 + 4, 560, f, P.text);
    x += widths[i] + 18;
  });
  ctx.restore();
}

/** "100 ROWS · SNOW · Ice floes drift faster." */
function banner(ctx: Ctx, game: Game, t: Texts): void {
  if (game.bannerAt === null || game.zone !== 'snow') return;
  const age = game.t - game.bannerAt;
  if (age > BANNER_TIME) return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, age / 0.25, (BANNER_TIME - age) / 0.4));
  roundBox(ctx, 90, 78, 420, 132, 18, 2, P.line, P.panel);
  text(ctx, fill(t.s.zoneRows, {count: t.num(SNOW_FROM)}), W / 2, 109, {size: 16, weight: 700, spacing: 4}, P.sub, 'center');
  text(ctx, t.s.snowName, W / 2, 158, {size: 44, title: true}, P.text, 'center');
  text(ctx, t.s.snowText, W / 2, 187, fitting(ctx, t.s.snowText, {size: 18}, 380), P.sub, 'center');
  ctx.restore();
}

// ---- Screens ----

/** The title's little scene: the goat at the edge of a road, a car and a truck going by. */
const TITLE_ROWS = {
  meadow: {look: 3, obstacles: [['rock', 7], ['tree', 8], ['tree', 0]] as const},
  car: {dir: 1 as const, speed: 70, loop: W + 380, margin: 190, movers: [{kind: 'car' as const, offset: 330 + 190, length: LENGTH.car}]},
  truck: {dir: -1 as const, speed: 46, loop: W + 380, margin: 190, movers: [{kind: 'truck' as const, offset: 60 + 190, length: LENGTH.truck}]},
};

function titleScreen(ctx: Ctx, game: Game, t: Texts): void {
  const clock = game.clock;
  meadowGround(ctx, 384, TITLE_ROWS.meadow.look, TITLE_ROWS.meadow.obstacles.map(([, c]) => c), false);
  roadGround(ctx, 320, false, true);
  roadGround(ctx, 256, true, false);
  const truck = TITLE_ROWS.truck;
  drawTruck(ctx, moverX(truck, truck.movers[0], clock), 310, -1, 1);
  const car = TITLE_ROWS.car;
  drawCar(ctx, moverX(car, car.movers[0], clock), 374, 1, P.car, 2);
  for (const [kind, col] of TITLE_ROWS.meadow.obstacles) {
    if (kind === 'rock') drawRock(ctx, colX(col), 438);
    else drawTree(ctx, colX(col), 438, false);
  }
  drawGoat(ctx, colX(3), 438, 1.15, 1, Math.sin(clock * 2) > 0.97 ? 'land' : 'stand');
  const s = t.s;
  text(ctx, s.title1, W / 2, 85, {size: 58, title: true}, P.text, 'center');
  text(ctx, s.title2, W / 2, 145, {size: 58, title: true}, P.text, 'center');
  text(ctx, s.tagline, W / 2, 181, fitting(ctx, s.tagline, {size: 18, weight: 700, spacing: 3}, 520), P.sub, 'center');
  const best = game.best > 0 ? fill(s.bestLine, {rows: rows(s, game.best, t.num)}) : s.firstRun;
  button(ctx, s.play, best, 462, true);
  text(ctx, s.titleHints, W / 2, 573, fitting(ctx, s.titleHints, {size: 16}, 560), P.hint, 'center');
}

/** A 112 x 56 piece of a row (128 x 64 drawn at 0.875), in a rounded frame. */
function swatch(ctx: Ctx, kind: 'meadow' | 'road' | 'river' | 'rails', y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(46, y + 2, 112, 56, 6);
  ctx.clip();
  ctx.translate(46, y + 2);
  ctx.scale(0.875, 0.875);
  if (kind === 'meadow') {
    drawRock(ctx, 102, BASE);
    drawTree(ctx, 38, BASE, false);
  } else if (kind === 'road') {
    roadGround(ctx, 0, false, false);
    drawCar(ctx, 22, BASE, 1, P.car, 2);
  } else if (kind === 'river') {
    waterGround(ctx, 0, 4, false);
    drawLog(ctx, 30, BASE, 92, 1);
  } else {
    railsGround(ctx, 0, true);
    drawSignal(ctx, 100, BASE + 8, 1);
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = P.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(45, y + 1, 114, 58, 7);
  ctx.stroke();
  ctx.restore();
}

function howScreen(ctx: Ctx, t: Texts): void {
  const s = t.s;
  text(ctx, s.howTitle, 44, 55, {size: 34, title: true}, P.text);
  // The cross of arrows around the goat.
  drawArrow(ctx, 'up', 87, 72, 30);
  drawArrow(ctx, 'left', 48.3, 106, 30);
  drawArrow(ctx, 'right', 125.7, 106, 30);
  drawArrow(ctx, 'down', 87, 140, 30);
  ctx.save();
  ctx.translate(82, 101);
  ctx.scale(0.625, 0.625);
  drawGoat(ctx, 32, 58, 0.84, 1, 'stand');
  ctx.restore();
  text(ctx, s.howHop, 174, 105.5, {size: 19, weight: 700}, P.text);
  lines(ctx, s.howHopText, 174, [128.5, 149.5], {size: 16}, P.sub);
  ctx.fillStyle = P.line;
  ctx.fillRect(44, 180, 512, 2);
  const rowsOf: ['meadow' | 'road' | 'river' | 'rails', string, string, number, number, number[]][] = [
    ['meadow', s.meadow, s.meadowText, 192, 218, [239]],
    ['road', s.road, s.roadText, 262, 288, [309]],
    ['river', s.river, s.riverText, 334, 350, [371, 391]],
    ['rails', s.rails, s.railsText, 406, 432, [453]],
  ];
  for (const [kind, name, body, y, nameBase, bodyBases] of rowsOf) {
    swatch(ctx, kind, y);
    text(ctx, name, 178, nameBase, {size: 19, weight: 700}, P.text);
    lines(ctx, body, 178, bodyBases, {size: 16}, P.sub);
  }
  ctx.save();
  ctx.translate(44, 480);
  ctx.scale(0.875, 0.875);
  drawEagle(ctx, 64, 30, 1.6, -1, false);
  ctx.restore();
  text(ctx, s.keepMoving, 174, 494, {size: 19, weight: 700}, P.text);
  lines(ctx, s.keepMovingText, 174, [515, 535], {size: 16}, P.sub);
  text(ctx, s.howHint, W / 2, 581, {size: 16}, P.hint, 'center');
}

// The game over pictures: 260 x 120 scenes, drawn at 312 x 144.

function vignetteFrame(ctx: Ctx, draw: () => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(144, 90, 312, 144);
  ctx.clip();
  ctx.translate(144, 90);
  ctx.scale(1.2, 1.2);
  draw();
  ctx.restore();
}

function vignetteHit(ctx: Ctx, train: boolean): void {
  vignetteFrame(ctx, () => {
    ctx.strokeStyle = P.road;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 106);
    ctx.lineTo(260, 106);
    ctx.stroke();
    ctx.setLineDash([20, 16]);
    ctx.beginPath();
    ctx.moveTo(-8, 12);
    ctx.lineTo(260, 12);
    ctx.stroke();
    ctx.setLineDash([]);
    if (train) drawTrain(ctx, 132, 100, -1, 0, false);
    else drawCar(ctx, 132, 100, -1, P.car, 0);
    ctx.save();
    ctx.strokeStyle = P.danger;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.stroke(new Path2D('M118 60 l-9 -9 M114 74 l-13 0 M118 88 l-9 9 M122 54 l0 -10'));
    ctx.restore();
    drawGoat(ctx, 70, 86, 0.9, 1, 'fall', -24);
    drawStar(ctx, 48, 30, 7, P.sub);
    drawStar(ctx, 76, 22, 6, P.sub);
    drawStar(ctx, 102, 34, 5, P.sub);
  });
}

function vignetteWater(ctx: Ctx, snow: boolean): void {
  vignetteFrame(ctx, () => {
    ctx.save();
    ctx.strokeStyle = P.water;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke(new Path2D('M0 100 q5 -5 10 0 t10 0 t10 0 M30 62 q5 -5 10 0 t10 0 t10 0 M200 36 q5 -5 10 0 t10 0 t10 0 M0 30 q5 -5 10 0 t10 0'));
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(96, 84, 44, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = P.ice;
    ctx.beginPath();
    ctx.ellipse(96, 84, 26, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawHorns(ctx, 96, 76);
    ctx.save();
    ctx.strokeStyle = P.sub;
    ctx.lineWidth = 2;
    for (const [x, y, r] of [[104, 56, 4], [114, 42, 3], [98, 34, 2.4]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (snow) drawFloe(ctx, 160, 96, 96, 1);
    else drawLog(ctx, 160, 96, 96, 1);
  });
}

function vignetteEagle(ctx: Ctx): void {
  vignetteFrame(ctx, () => {
    drawEagle(ctx, 122, 22, 2.0, 1, true);
    drawGoat(ctx, 122, 86, 0.8, 1, 'fall');
    ctx.save();
    ctx.strokeStyle = P.hint;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke(new Path2D('M102 114 l0 -14 M122 118 l0 -20 M142 114 l0 -14'));
    ctx.restore();
  });
}

function overScreen(ctx: Ctx, game: Game, t: Texts): void {
  const s = t.s;
  const head = s.causes[game.cause];
  text(ctx, head, W / 2, 70, fitting(ctx, head, {size: 36, title: true}, 540), P.text, 'center');
  if (game.cause === 'car' || game.cause === 'train') vignetteHit(ctx, game.cause === 'train');
  else if (game.cause === 'eagle') vignetteEagle(ctx);
  else vignetteWater(ctx, game.causeSnow);
  text(ctx, t.num(game.score), W / 2, 309, {size: 76, title: true}, P.text, 'center');
  const reached = rows(s, game.score, t.num);
  if (game.record) {
    text(ctx, s.newBest, W / 2, 343, {size: 18, weight: 700, spacing: 3}, P.accent, 'center');
    // The first best has no previous one.
    const line = game.previousBest > 0 ? fill(s.overLineRecord, {rows: reached, best: t.num(game.previousBest)}) : reached;
    text(ctx, line, W / 2, 369, fitting(ctx, line, {size: 17}, 540), P.sub, 'center');
  } else {
    // No NEW BEST: the line moves up into its place.
    const line = fill(s.overLine, {rows: reached, best: t.num(game.best)});
    text(ctx, line, W / 2, 347, fitting(ctx, line, {size: 17}, 540), P.sub, 'center');
  }
  button(ctx, s.again, s.overHint, 428, true);
}

function playingScreen(ctx: Ctx, game: Game, t: Texts): void {
  field(ctx, game);
  hud(ctx, game, t);
  const hint = HINT_TIME + HINT_FADE - game.t;
  if (hint > 0 && !game.dying) controls(ctx, t, Math.min(1, hint / HINT_FADE));
  banner(ctx, game, t);
}

function pausedScreen(ctx: Ctx, game: Game, t: Texts): void {
  ctx.save();
  ctx.globalAlpha = 0.2;
  field(ctx, game);
  ctx.restore();
  hud(ctx, game, t);
  const s = t.s;
  text(ctx, s.paused, W / 2, 213, fitting(ctx, s.paused, {size: 48, title: true}, 540), P.text, 'center');
  button(ctx, s.resume, s.resumeHint, 246, true);
  button(ctx, s.quit, s.quitHint, 352, false);
}

/** Draws [game] as it is now, in logical 600 x 600 units. */
export function render(ctx: Ctx, game: Game, t: Texts): void {
  if (drawn) drawn = [];
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  switch (game.screen) {
    case 'title':
      titleScreen(ctx, game, t);
      return;
    case 'howto':
      howScreen(ctx, t);
      return;
    case 'playing':
      playingScreen(ctx, game, t);
      return;
    case 'paused':
      pausedScreen(ctx, game, t);
      return;
    case 'over':
      overScreen(ctx, game, t);
      return;
  }
}
