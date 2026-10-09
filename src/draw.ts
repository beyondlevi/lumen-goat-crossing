import {Rng} from './rng';
import {COLS, W, X0} from './world';

/**
 * The approved design's "Rokid" palette. The glasses' display is green only and additive: black is
 * see-through and every color is a brightness, so row kinds differ by pattern and things by shape
 * and brightness (vehicles brightest, platforms mid, ground textures dim).
 */
export const P = {
  bg: '#000000',
  text: '#E2FFEE',
  sub: '#B8FFD6',
  hint: '#8DF0B5',
  line: '#2E7D50',
  panel: '#03100A',
  focus: '#123A24',
  accent: '#F0FFF6',
  goat: '#F6FFFA',
  fill: '#0B2617',
  grass: '#3E9E66',
  tree: '#5CD890',
  rock: '#4FBF7E',
  snow: '#8DF0B5',
  road: '#4FBF7E',
  water: '#3E9E66',
  rail: '#5CD890',
  tie: '#2E7D50',
  wood: '#6BE69C',
  ice: '#9DFFC4',
  lfill: '#06180E',
  car: '#D6FFE6',
  car2: '#C6FFDD',
  truck: '#C6FFDD',
  train: '#E2FFEE',
  vfill: '#0B2617',
  speed: '#3E9E66',
  danger: '#F0FFF6',
  edge: '#8DF0B5',
} as const;

/** The colors text may use: the palette's bright roles only. */
export const TEXT_COLORS: readonly string[] = [P.text, P.sub, P.hint, P.accent];

type Ctx = CanvasRenderingContext2D;

function line(ctx: Ctx, path: Path2D, color: string, width: number, fill?: string): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

function round(ctx: Ctx): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string | null, stroke?: string, width = 2.6): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

// ---- The goat (Goat Climb's drawing) ----

export type Pose = 'stand' | 'jump' | 'land' | 'fall';

const LEGS: Record<Pose, string> = {
  stand: 'M22 40 L21 54 M28 41 L28 54 M40 41 L41 54 M46 40 L47 54',
  jump: 'M22 40 L14 48 M28 41 L20 50 M40 41 L48 47 M46 40 L55 45',
  land: 'M22 40 L18 54 M28 41 L27 54 M40 41 L42 54 M46 40 L51 54',
  fall: 'M22 40 L24 50 M28 41 L31 52 M40 41 L37 52 M46 40 L44 50',
};

const GOAT = {
  body: new Path2D('M14 30 C14 22 22 19 32 19 C42 19 50 22 50 30 C50 38 44 42 32 42 C20 42 14 38 14 30 Z'),
  belly: new Path2D('M20 41 L22 44 L25 41 L28 44 L31 41 L34 44 L37 41 L40 44 L43 41 M14 27 L9 22 L13 24'),
  head: new Path2D('M44 24 L48 15 C50 9 61 8 63 13 L65 21 C65 25 61 26 58 23 L52 22 L49 27'),
  face: new Path2D('M53 11 C50 4 43 3 42 8 C41 12 45 13 47 11 M56 10 C56 4 51 1 48 3 M51 14 L46 15 L50 17'),
  beard: new Path2D('M60 22 L61 28 L58 24'),
  legs: Object.fromEntries(Object.entries(LEGS).map(([pose, d]) => [pose, new Path2D(d)])) as Record<Pose, Path2D>,
};

/** The goat, centered on [x] with its feet at [base]; about 55 x 48 at scale 0.86. [rotate] in degrees. */
export function drawGoat(ctx: Ctx, x: number, base: number, scale: number, facing: number, pose: Pose, rotate = 0): void {
  ctx.save();
  if (rotate) {
    const cy = base - 28 * scale;
    ctx.translate(x, cy);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-x, -cy);
  }
  ctx.translate(x - 34 * scale * facing, base - 56 * scale);
  ctx.scale(scale * facing, scale);
  round(ctx);
  line(ctx, GOAT.body, P.goat, 2.8, P.fill);
  line(ctx, GOAT.belly, P.goat, 2.8);
  line(ctx, GOAT.head, P.goat, 2.8, P.fill);
  line(ctx, GOAT.face, P.goat, 2.8);
  circle(ctx, 57, 14, 1.6, P.goat);
  line(ctx, GOAT.beard, P.goat, 2.8);
  line(ctx, GOAT.legs[pose], P.goat, 2.8);
  ctx.restore();
}

/** Just the horns, sticking out of the water. */
export function drawHorns(ctx: Ctx, x: number, y: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  round(ctx);
  line(ctx, new Path2D('M-4 0 C-8 -10 -16 -12 -18 -6 M4 0 C4 -8 -1 -12 -5 -10'), P.goat, 2.6);
  ctx.restore();
}

// ---- The eagle (Goat Climb's) ----

/** The eagle centered on (x, y); [flap] -1..1 lifts the wing tips. */
export function drawEagle(ctx: Ctx, x: number, y: number, s: number, facing: number, talons: boolean, flap = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * facing, s);
  round(ctx);
  ctx.strokeStyle = P.danger;
  ctx.lineWidth = 2.8 / s;
  const lift = 6 * flap;
  ctx.beginPath();
  ctx.moveTo(-28, lift);
  ctx.bezierCurveTo(-18, -10 + lift, -8, -10, 0, 0);
  ctx.bezierCurveTo(8, -10, 18, -10 + lift, 28, lift);
  ctx.moveTo(-4, 0);
  ctx.lineTo(0, 8);
  ctx.lineTo(4, 0);
  ctx.moveTo(4, 2);
  ctx.lineTo(10, 0);
  if (talons) {
    ctx.moveTo(-3, 7);
    ctx.lineTo(-5, 15);
    ctx.moveTo(3, 7);
    ctx.lineTo(5, 15);
    ctx.moveTo(-7, 15);
    ctx.lineTo(-3, 15);
    ctx.moveTo(3, 15);
    ctx.lineTo(7, 15);
  }
  ctx.stroke();
  ctx.restore();
}

// ---- Ground patterns (top-down, one per row kind) ----

const groundCache = new Map<string, Path2D>();

function cached(key: string, make: () => Path2D): Path2D {
  let path = groundCache.get(key);
  if (!path) {
    if (groundCache.size > 400) groundCache.clear();
    path = make();
    groundCache.set(key, path);
  }
  return path;
}

/** A meadow's tufts (or snow's flakes), relative to its top; no tufts on the [skip] cells. */
export function meadowGround(ctx: Ctx, top: number, look: number, skip: readonly number[], snowy: boolean): void {
  const path = cached(`m${look}${snowy ? 's' : ''}${skip.join()}`, () => {
    const r = new Rng(look);
    const d: string[] = [];
    for (let col = -1; col <= COLS; col++) {
      const count = r.next() < 0.6 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const x = X0 + col * 64 + r.int(6, 46);
        const y = r.int(22, 52);
        if (skip.includes(col)) continue;
        if (!snowy) d.push(`M${x} ${y} l3 -7 l3 7 l3 -5 l3 5`);
        else if (r.next() < 0.5) d.push(`M${x} ${y} l7 0 M${x + 3.5} ${y - 3.5} l0 7`);
        else d.push(`M${x} ${y} l0.1 0`);
      }
    }
    return new Path2D(d.join(' '));
  });
  ctx.save();
  ctx.translate(0, top);
  round(ctx);
  line(ctx, path, snowy ? P.snow : P.grass, 2.2);
  ctx.restore();
}

/** A road's edges: solid lines where it meets something else, dashed between two lanes. */
export function roadGround(ctx: Ctx, top: number, belowIsRoad: boolean, aboveIsRoad: boolean): void {
  ctx.save();
  round(ctx);
  ctx.strokeStyle = P.road;
  ctx.lineWidth = 2.4;
  if (!aboveIsRoad) {
    ctx.beginPath();
    ctx.moveTo(0, top + 3);
    ctx.lineTo(W, top + 3);
    ctx.stroke();
  } else {
    ctx.setLineDash([20, 16]);
    ctx.beginPath();
    ctx.moveTo(-6, top);
    ctx.lineTo(W, top);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (!belowIsRoad) {
    ctx.beginPath();
    ctx.moveTo(0, top + 61);
    ctx.lineTo(W, top + 61);
    ctx.stroke();
  }
  ctx.restore();
}

/** Water: two lines of small waves; ice chips on a frozen river. */
export function waterGround(ctx: Ctx, top: number, look: number, chips: boolean): void {
  const waves = cached(`w${look}`, () => {
    const r = new Rng(look);
    const d: string[] = [];
    [18, 42].forEach((y, row) => {
      const off = r.int(0, 90);
      for (let k = 0; k < 6; k++) {
        const x = ((off + k * 112 + row * 56) % 640) - 20;
        d.push(`M${x} ${y} q5 -5 10 0 t10 0 t10 0`);
      }
    });
    return new Path2D(d.join(' '));
  });
  ctx.save();
  ctx.translate(0, top);
  round(ctx);
  line(ctx, waves, P.water, 2.2);
  if (chips) {
    const ice = cached(`c${look}`, () => {
      const r = new Rng(look ^ 0x51ce);
      const d: string[] = [];
      for (let k = 0; k < 3; k++) d.push(`M${r.int(10, 590)} ${r.chance(0.5) ? 30 : 54} l5 -4 l5 4 l-5 3 Z`);
      return new Path2D(d.join(' '));
    });
    line(ctx, ice, P.ice, 1.8);
  }
  ctx.restore();
}

const TIES = new Path2D(Array.from({length: Math.ceil((W - 4) / 20)}, (_, i) => `M${4 + i * 20} 14 L${4 + i * 20} 58`).join(' '));

/** A track: ties, two rails; while a train is announced, bright rails and dashed edges. */
export function railsGround(ctx: Ctx, top: number, warn: boolean): void {
  ctx.save();
  ctx.translate(0, top);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  line(ctx, TIES, P.tie, 3);
  round(ctx);
  ctx.strokeStyle = warn ? P.danger : P.rail;
  ctx.lineWidth = warn ? 3 : 2.6;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(W, 20);
  ctx.moveTo(0, 52);
  ctx.lineTo(W, 52);
  ctx.stroke();
  if (warn) {
    ctx.strokeStyle = P.danger;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(W, 4);
    ctx.moveTo(0, 63);
    ctx.lineTo(W, 63);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** The bottom edge the view creeps over: a zigzag, bright while the eagle warns. */
export function drawFloor(ctx: Ctx, strong: boolean): void {
  ctx.save();
  ctx.globalAlpha *= strong ? 1 : 0.55;
  ctx.strokeStyle = P.edge;
  ctx.lineWidth = strong ? 2.4 : 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 598);
  for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, (x / 20) % 2 ? 592 : 598);
  ctx.stroke();
  ctx.restore();
}

// ---- Things on the rows (side view) ----

const ROCK = {
  body: new Path2D('M-22 0 L-19 -17 L-7 -27 L9 -25 L20 -13 L22 0 Z'),
  marks: new Path2D('M-9 -17 l7 5 M8 -19 l-3 8 M-26 0 L26 0'),
};

export function drawRock(ctx: Ctx, x: number, base: number): void {
  ctx.save();
  ctx.translate(x, base);
  round(ctx);
  line(ctx, ROCK.body, P.rock, 2.6, P.vfill);
  line(ctx, ROCK.marks, P.rock, 2.2);
  ctx.restore();
}

const TREE = {
  trunk: new Path2D('M0 0 L0 -10'),
  tiers: [new Path2D('M-21 -10 L0 -30 L21 -10 Z'), new Path2D('M-16 -24 L0 -44 L16 -24 Z'), new Path2D('M-11 -38 L0 -56 L11 -38 Z')],
  snow: new Path2D('M-12 -19 L0 -30 L12 -19 M-8 -34 L0 -44 L8 -34 M-5 -49 L0 -56 L5 -49'),
};

export function drawTree(ctx: Ctx, x: number, base: number, snowy: boolean): void {
  ctx.save();
  ctx.translate(x, base);
  round(ctx);
  line(ctx, TREE.trunk, P.tree, 2.6);
  for (const tier of TREE.tiers) line(ctx, tier, P.tree, 2.6, P.vfill);
  if (snowy) line(ctx, TREE.snow, P.snow, 3.4);
  ctx.restore();
}

/** One, two or three motion lines behind a vehicle (local coordinates, the vehicle facing right). */
const SPEED_LINES = [1, 2, 3].map((n) => new Path2D(['M-8 -28 l-16 0', 'M-6 -18 l-24 0', 'M-10 -8 l-12 0'].slice(0, n).join(' ')));

function speedLines(ctx: Ctx, count: number): void {
  if (count > 0) line(ctx, SPEED_LINES[Math.min(3, count) - 1], P.speed, 2.2);
}

/** Facing right from x (its left end), or mirrored to face left over the same span. */
function facingFrom(ctx: Ctx, x: number, base: number, dir: number, length: number): void {
  if (dir > 0) {
    ctx.translate(x, base);
  } else {
    ctx.translate(x + length, base);
    ctx.scale(-1, 1);
  }
}

const CAR = {
  body: new Path2D('M3 -9 L3 -22 C3 -26 6 -27 10 -27 L24 -27 L34 -40 L60 -40 L72 -27 L80 -27 C84 -27 86 -25 86 -21 L86 -9 Z'),
  windows: new Path2D('M37 -36 L46 -36 L46 -30 L30 -30 Z M50 -36 L58 -36 L65 -30 L50 -30 Z'),
  tail: new Path2D('M3 -19 L8 -19'),
};

/** A car spanning [x, x + 86], driving in [dir]. */
export function drawCar(ctx: Ctx, x: number, base: number, dir: number, color: string, lines: number): void {
  ctx.save();
  facingFrom(ctx, x, base, dir, 86);
  round(ctx);
  speedLines(ctx, lines);
  line(ctx, CAR.body, color, 2.6, P.vfill);
  line(ctx, CAR.windows, color, 2);
  line(ctx, CAR.tail, color, 3);
  circle(ctx, 82, -20, 2.6, color);
  for (const wx of [21, 68]) {
    circle(ctx, wx, -8, 7.5, P.vfill, color, 2.6);
    circle(ctx, wx, -8, 2, color);
  }
  ctx.restore();
}

const TRUCK = {
  box: new Path2D('M2 -10 L2 -50 L106 -50 L106 -10 Z'),
  ribs: new Path2D([20, 38, 56, 74, 92].map((i) => `M${i} -44 L${i} -16`).join(' ')),
  cab: new Path2D('M110 -10 L110 -42 L130 -42 L144 -27 L150 -24 L150 -10 Z'),
  window: new Path2D('M116 -37 L128 -37 L139 -26 L116 -26 Z'),
};

/** A truck spanning [x, x + 150]. */
export function drawTruck(ctx: Ctx, x: number, base: number, dir: number, lines: number): void {
  ctx.save();
  facingFrom(ctx, x, base, dir, 150);
  round(ctx);
  speedLines(ctx, lines);
  line(ctx, TRUCK.box, P.truck, 2.6, P.vfill);
  line(ctx, TRUCK.ribs, P.truck, 2);
  line(ctx, TRUCK.cab, P.truck, 2.6, P.vfill);
  line(ctx, TRUCK.window, P.truck, 2);
  circle(ctx, 146, -17, 2.6, P.truck);
  for (const wx of [24, 46, 128]) {
    circle(ctx, wx, -8, 8, P.vfill, P.truck, 2.6);
    circle(ctx, wx, -8, 2, P.truck);
  }
  ctx.restore();
}

/** Short water lines at the trailing end of a log or a floe. */
function wake(ctx: Ctx, x: number, base: number, dir: number, length: number): void {
  ctx.save();
  round(ctx);
  ctx.strokeStyle = P.water;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (dir > 0) {
    ctx.moveTo(x - 6, base - 4);
    ctx.lineTo(x - 22, base - 4);
    ctx.moveTo(x - 4, base + 3);
    ctx.lineTo(x - 28, base + 3);
  } else {
    ctx.moveTo(x + length + 6, base - 4);
    ctx.lineTo(x + length + 22, base - 4);
    ctx.moveTo(x + length + 4, base + 3);
    ctx.lineTo(x + length + 28, base + 3);
  }
  ctx.stroke();
  ctx.restore();
}

/** A log spanning [x, x + length]; the cut end leads. */
export function drawLog(ctx: Ctx, x: number, base: number, length: number, dir: number): void {
  wake(ctx, x, base, dir, length);
  ctx.save();
  round(ctx);
  ctx.beginPath();
  ctx.roundRect(x, base - 19, length, 21, 10);
  ctx.fillStyle = P.lfill;
  ctx.fill();
  ctx.strokeStyle = P.wood;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 20; i < length - 16; i += 24) {
    ctx.moveTo(x + i, base - 13);
    ctx.lineTo(x + i, base - 3);
  }
  const end = dir > 0 ? x + length - 9 : x + 9;
  ctx.moveTo(end + 4, base - 8.5);
  ctx.ellipse(end, base - 8.5, 4, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** An ice floe spanning [x, x + length], its underside jagged. */
export function drawFloe(ctx: Ctx, x: number, base: number, length: number, dir: number): void {
  wake(ctx, x, base, dir, length);
  ctx.save();
  round(ctx);
  ctx.beginPath();
  ctx.moveTo(x, base - 15);
  ctx.lineTo(x + length, base - 15);
  ctx.lineTo(x + length - 4, base - 4);
  const teeth = Math.floor((length - 12) / 12) + 1;
  for (let i = 0; i < teeth; i++) ctx.lineTo(x + length - 6 - i * 12, base + (i % 2 === 0 ? 2 : -4));
  ctx.lineTo(x + 4, base - 4);
  ctx.closePath();
  ctx.fillStyle = P.lfill;
  ctx.fill();
  ctx.strokeStyle = P.ice;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x + 10, base - 10);
  ctx.lineTo(x + 28, base - 10);
  ctx.moveTo(x + length - 34, base - 10);
  ctx.lineTo(x + length - 24, base - 10);
  ctx.stroke();
  ctx.restore();
}

const TRAIN = {
  loco: new Path2D('M0 -10 L0 -48 L128 -48 L150 -40 L168 -22 L170 -10 Z'),
  cab: new Path2D('M134 -43 L148 -38 L159 -25 L134 -25 Z'),
  locoWindows: new Path2D([16, 44, 72, 100].map((wx) => `M${wx} -40 l16 0 l0 12 l-16 0 Z`).join(' ')),
  locoStripe: new Path2D('M0 -18 L168 -18'),
  beams: new Path2D('M176 -16 L232 -30 M176 -13 L240 -13 M176 -10 L232 2'),
  wagon: new Path2D('M0 -10 L0 -48 L150 -48 L150 -10 Z'),
  wagonWindows: new Path2D([14, 46, 86, 118].map((wx) => `M${wx} -40 l18 0 l0 12 l-18 0 Z`).join(' ')),
  wagonStripe: new Path2D('M0 -18 L150 -18 M150 -20 L160 -20'),
};

/** A locomotive whose nose is at x = [nose], driving in [dir], [wagons] trailing behind. */
export function drawTrain(ctx: Ctx, nose: number, base: number, dir: number, wagons: number, beams = true): void {
  ctx.save();
  if (dir > 0) {
    ctx.translate(nose - 170, base);
  } else {
    ctx.translate(nose + 170, base);
    ctx.scale(-1, 1);
  }
  round(ctx);
  for (let k = 0; k < wagons; k++) {
    ctx.save();
    ctx.translate(-160 * (k + 1), 0);
    line(ctx, TRAIN.wagon, P.train, 2.8, P.vfill);
    line(ctx, TRAIN.wagonWindows, P.train, 2);
    line(ctx, TRAIN.wagonStripe, P.train, 2);
    for (const wx of [20, 42, 108, 130]) circle(ctx, wx, -7, 7, P.vfill, P.train, 2.6);
    ctx.restore();
  }
  line(ctx, TRAIN.loco, P.train, 2.8, P.vfill);
  line(ctx, TRAIN.cab, P.train, 2.2);
  line(ctx, TRAIN.locoWindows, P.train, 2);
  line(ctx, TRAIN.locoStripe, P.train, 2);
  circle(ctx, 164, -14, 3.2, P.train);
  for (const wx of [22, 46, 120, 144]) circle(ctx, wx, -7, 7, P.vfill, P.train, 2.6);
  if (beams) {
    ctx.setLineDash([8, 7]);
    line(ctx, TRAIN.beams, P.danger, 2.4);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

const SIGNAL = {
  post: new Path2D('M0 0 L0 -30 M-9 0 L9 0'),
  cross: new Path2D('M-8 -22 L8 -12 M8 -22 L-8 -12'),
  bar: new Path2D('M-11 -38 L11 -38'),
  rays: new Path2D('M-11 -49 l0 -5 M-19 -46 l-4 -4 M-22 -38 l-5 0 M-19 -30 l-4 4'),
};

/**
 * A crossing signal standing at [x]: two lights that blink in turn while a train is announced.
 * [lit]: 0 off, 1 the left light on, 2 the right one.
 */
export function drawSignal(ctx: Ctx, x: number, base: number, lit: 0 | 1 | 2): void {
  const c = lit ? P.danger : P.rail;
  ctx.save();
  ctx.translate(x, base);
  round(ctx);
  line(ctx, SIGNAL.post, c, 2.6);
  line(ctx, SIGNAL.cross, c, 2.4);
  line(ctx, SIGNAL.bar, c, 2.4);
  for (const side of [-1, 1]) {
    const on = (lit === 1 && side < 0) || (lit === 2 && side > 0);
    if (on) {
      circle(ctx, 11 * side, -38, 7, P.danger, P.danger, 2.4);
      ctx.save();
      ctx.scale(-side, 1);
      line(ctx, SIGNAL.rays, P.danger, 2.4);
      ctx.restore();
    } else {
      circle(ctx, 11 * side, -38, 7, P.vfill, c, 2.4);
    }
  }
  ctx.restore();
}

// ---- Small icons ----

export type Arrow = 'up' | 'down' | 'left' | 'right';
const ARROWS: Record<Arrow, Path2D> = {
  up: new Path2D('M6 15 L12 9 L18 15'),
  down: new Path2D('M6 9 L12 15 L18 9'),
  left: new Path2D('M15 6 L9 12 L15 18'),
  right: new Path2D('M9 6 L15 12 L9 18'),
};

/** A chevron in a [size] px box whose top left corner is (x, y). */
export function drawArrow(ctx: Ctx, arrow: Arrow, x: number, y: number, size: number, color: string = P.text): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  round(ctx);
  line(ctx, ARROWS[arrow], color, 2.6);
  ctx.restore();
}

/** A five-pointed star outline. */
export function drawStar(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.save();
  round(ctx);
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r : r * 0.45;
    const px = x + rr * Math.cos(a);
    const py = y + rr * Math.sin(a);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** Darkens the top of the field under the HUD, so the rows passing behind don't cross its text. */
export function topFade(ctx: Ctx): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, 96);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(58 / 96, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, 96);
}

