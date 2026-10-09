import {Rng} from './rng';

/** The screen: Lumen gives a web app a 600 x 600 CSS px square. Everything is drawn in these units. */
export const W = 600;
export const H = 600;
/** The map: top-down rows of 64 px cells, 9 columns from x = 12 to 588. */
export const CELL = 64;
export const COLS = 9;
export const X0 = 12;
export const X1 = X0 + COLS * CELL;
/** A row's baseline (where things stand), from its top. */
export const BASE = 54;
/** The snow starts at this row. */
export const SNOW_FROM = 100;

/** Half the goat's width when a vehicle or a train hits it. */
export const GOAT_HW = 16;
/** The goat stands on a log or a floe while its center is at least this far inside the ends. */
export const RIDE_MARGIN = 6;
/** Every gap on a road leaves a standing goat at least this long between two vehicles (s). */
export const ROAD_WINDOW = 1.2;
/** At any point of a river, the next log or floe comes within this time (s). */
export const RIVER_MAX_WAIT = 2.4;
/** The signal blinks this long before a train comes in (s). */
export const TRAIN_WARN = 1.8;

/** Vehicles' lengths (their drawings), px. */
export const LENGTH = {car: 86, car2: 86, truck: 150} as const;
export const LOCO = 170;
export const WAGON = 160;
/** Logs and floes, px. */
export const LOG_LENGTH: readonly [number, number] = [128, 224];
export const FLOE_LENGTH: readonly [number, number] = [112, 152];
/** The hidden part of a lane on each side, where its things wrap around. */
const ROAD_MARGIN = 190;
const RIVER_MARGIN = 270;

export type RowKind = 'meadow' | 'road' | 'river' | 'rails';
export type MoverKind = 'car' | 'car2' | 'truck' | 'log' | 'floe';
export type ObstacleKind = 'rock' | 'tree' | 'signal';

/** A vehicle, a log or a floe: where it is on its lane's loop at time 0, and its length. */
export interface Mover {
  kind: MoverKind;
  offset: number;
  length: number;
}

/** A road lane or a river: everything on it moves at one speed, around a loop wider than the screen. */
export interface Lane {
  dir: 1 | -1;
  /** px/s. */
  speed: number;
  loop: number;
  margin: number;
  movers: Mover[];
}

/** A track's trains: one every [period] s, the first coming in at [phase]. */
export interface Train {
  dir: 1 | -1;
  /** px/s. */
  speed: number;
  period: number;
  phase: number;
  wagons: number;
}

export interface Obstacle {
  col: number;
  kind: ObstacleKind;
}

export interface Row {
  index: number;
  kind: RowKind;
  /** In the snow zone: snowy meadows and trees, ice floes on the rivers. */
  snow: boolean;
  /** Seed of the ground's look (tufts, waves). */
  look: number;
  /** A meadow's cells taken by a rock, a tree or a signal. */
  blocked: boolean[];
  obstacles: Obstacle[];
  lane: Lane | null;
  train: Train | null;
  /** A meadow under a track holds its signal: the track's trains. */
  signal: Train | null;
}

/** How hard the rows at [index] are: 0 at the start, 1 at row 150, slowly more after. */
export function difficulty(index: number): number {
  if (index <= 0) return 0;
  if (index < 150) return index / 150;
  return 1 + Math.min(0.5, (index - 150) / 400);
}

/** The center x of column [col]. */
export function colX(col: number): number {
  return X0 + col * CELL + CELL / 2;
}

/** The column nearest to [x], 0..8. */
export function nearestCol(x: number): number {
  return Math.max(0, Math.min(COLS - 1, Math.round((x - X0 - CELL / 2) / CELL)));
}

/** The left end of [mover] at time [t]. */
export function moverX(lane: Lane, mover: Mover, t: number): number {
  const p = (mover.offset + lane.dir * lane.speed * t) % lane.loop;
  return (p < 0 ? p + lane.loop : p) - lane.margin;
}

/** The vehicle on [row] that overlaps [x - hw, x + hw] at time [t], if any. */
export function vehicleAt(row: Row, x: number, hw: number, t: number): Mover | null {
  if (row.kind !== 'road' || !row.lane) return null;
  for (const m of row.lane.movers) {
    const left = moverX(row.lane, m, t);
    // The drawings span 3 .. length - 1.
    if (x + hw > left + 3 && x - hw < left + m.length - 1) return m;
  }
  return null;
}

/** The log or floe on [row] that a goat at [x] stands on at time [t], if any. */
export function floatAt(row: Row, x: number, t: number): Mover | null {
  if (row.kind !== 'river' || !row.lane) return null;
  for (const m of row.lane.movers) {
    const left = moverX(row.lane, m, t);
    if (x >= left + RIDE_MARGIN && x <= left + m.length - RIDE_MARGIN) return m;
  }
  return null;
}

export function trainLength(train: Train): number {
  return LOCO + WAGON * train.wagons;
}

/** Seconds since the last train came in (0 .. period). */
function trainClock(train: Train, t: number): number {
  const s = (t - train.phase) % train.period;
  return s < 0 ? s + train.period : s;
}

/** Seconds from a train's nose coming in to its tail leaving the screen. */
export function trainPass(train: Train): number {
  return (W + 160 + trainLength(train)) / train.speed;
}

/** The train's nose x at time [t], or null when no train is on the track. */
export function trainNose(train: Train, t: number): number | null {
  const s = trainClock(train, t);
  if (s > trainPass(train)) return null;
  return train.dir > 0 ? -80 + train.speed * s : W + 80 - train.speed * s;
}

/** The x span of the train at time [t], or null. */
export function trainSpan(train: Train, t: number): [number, number] | null {
  const nose = trainNose(train, t);
  if (nose === null) return null;
  const length = trainLength(train);
  return train.dir > 0 ? [nose - length, nose] : [nose, nose + length];
}

/** The signal blinks: a train comes within TRAIN_WARN, or one is passing. */
export function trainWarning(train: Train, t: number): boolean {
  const s = trainClock(train, t);
  return s >= train.period - TRAIN_WARN || s <= trainPass(train);
}

/** Free runs of a meadow's cells: a goat walks along one, never across a rock or a tree. */
export function segments(blocked: readonly boolean[]): number[][] {
  const out: number[][] = [];
  let run: number[] = [];
  for (let col = 0; col < COLS; col++) {
    if (blocked[col]) {
      if (run.length) out.push(run);
      run = [];
    } else {
      run.push(col);
    }
  }
  if (run.length) out.push(run);
  return out;
}

/** A row decided but not built yet (a meadow's rocks depend on the row below). */
type Planned =
  | {kind: 'meadow'; signal: Train | null}
  | {kind: 'road'; lane: Lane}
  | {kind: 'river'; lane: Lane}
  | {kind: 'rails'; train: Train};

/** The lowest row ever built: the start meadow goes down to here. */
const BOTTOM = -14;
/** Rows up to here are the start meadow. */
const START_TOP = 1;

/**
 * The crossing: rows built ahead of the goat, the same for the same seed. Meadow strips and hazard
 * groups (roads, rivers, rails) take turns. Every row is fair to a goat that hops with the band's
 * latency (see the unit tests): meadows always leave a way up, roads leave wide gaps, logs come
 * often, trains are announced.
 */
export class World {
  private readonly rows = new Map<number, Row>();
  private readonly rng: Rng;
  private readonly plan: Planned[] = [];
  private top = BOTTOM - 1;
  private lastHazard: RowKind = 'meadow';

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.ensure(12);
  }

  /** Row [index] (built on demand). */
  row(index: number): Row {
    if (index > this.top) this.ensure(index);
    return this.rows.get(Math.max(index, BOTTOM)) ?? this.rows.get(this.lowest())!;
  }

  /** Builds the rows up to [index]. */
  ensure(index: number): void {
    while (this.top < index) {
      const i = this.top + 1;
      this.rows.set(i, this.build(i));
      this.top = i;
    }
  }

  /** Forgets the rows below [index] (the goat never goes back that far). */
  prune(index: number): void {
    for (const key of this.rows.keys()) if (key < index) this.rows.delete(key);
  }

  private lowest(): number {
    return Math.min(...this.rows.keys());
  }

  private build(i: number): Row {
    if (i <= START_TOP) return this.meadow(i, null, this.rows.get(i - 1) ?? null);
    if (this.plan.length === 0) this.planSegment(i);
    const next = this.plan.shift()!;
    const snow = i >= SNOW_FROM;
    const base = {index: i, snow, look: this.rng.int(1, 1 << 30), blocked: new Array<boolean>(COLS).fill(false), obstacles: [] as Obstacle[], lane: null, train: null, signal: null};
    switch (next.kind) {
      case 'meadow':
        return this.meadow(i, next.signal, this.rows.get(i - 1) ?? null);
      case 'road':
        return {...base, kind: 'road', lane: next.lane};
      case 'river':
        return {...base, kind: 'river', lane: next.lane};
      case 'rails':
        return {...base, kind: 'rails', train: next.train};
    }
  }

  /** Plans a meadow strip, then a group of roads, rivers or tracks, from row [start]. */
  private planSegment(start: number): void {
    const rng = this.rng;
    const d = difficulty(start);
    const snow = start >= SNOW_FROM;
    // Which hazard: rivers and tracks come in after the first rows; the same kind twice in a row
    // is less likely.
    const weights: [RowKind, number][] = [
      ['road', snow ? 0.36 : 0.42],
      ['river', start < 5 ? 0 : snow ? 0.42 : 0.36],
      ['rails', start < 10 ? 0 : 0.22],
    ];
    for (const w of weights) if (w[0] === this.lastHazard) w[1] *= 0.5;
    let roll = rng.next() * weights.reduce((sum, w) => sum + w[1], 0);
    let kind: RowKind = 'road';
    for (const [k, weight] of weights) {
      if (roll < weight) {
        kind = k;
        break;
      }
      roll -= weight;
    }
    this.lastHazard = kind;

    const strip = start <= 3 ? 1 : d < 0.35 ? rng.int(1, 3) : rng.int(1, 2);
    for (let k = 0; k < strip - 1; k++) this.plan.push({kind: 'meadow', signal: null});
    const groupMax = Math.min(4, 2 + Math.floor(Math.min(1, d) * 2.5));
    if (kind === 'rails') {
      const first = this.train(start + strip);
      this.plan.push({kind: 'meadow', signal: first});
      this.plan.push({kind: 'rails', train: first});
      if (rng.chance(0.25 + 0.2 * Math.min(1, d))) {
        const second = this.train(start + strip + 2);
        this.plan.push({kind: 'meadow', signal: second});
        this.plan.push({kind: 'rails', train: second});
      }
      return;
    }
    this.plan.push({kind: 'meadow', signal: null});
    // Roads come in up to three lanes, rivers up to four.
    const count = start <= 6 ? 1 : rng.int(1, kind === 'road' ? Math.min(3, groupMax) : groupMax);
    let dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    for (let k = 0; k < count; k++) {
      const index = start + strip + k;
      if (kind === 'road') {
        if (k > 0 && rng.chance(0.65)) dir = dir > 0 ? -1 : 1;
        else if (k > 0) dir = rng.chance(0.5) ? 1 : -1;
        this.plan.push({kind: 'road', lane: this.roadLane(index, dir, count)});
      } else {
        // Rivers next to each other always flow in turns, one way then the other.
        if (k > 0) dir = dir > 0 ? -1 : 1;
        this.plan.push({kind: 'river', lane: this.riverLane(index, dir)});
      }
    }
  }

  /** A road lane, in a group of [lanes]: the more lanes to cross, the wider the gaps. */
  private roadLane(index: number, dir: 1 | -1, lanes: number): Lane {
    const rng = this.rng;
    const d = difficulty(index);
    const speed = rng.range(46 + 46 * d, 76 + 70 * d) * (lanes >= 3 ? 0.85 : 1);
    const trucks = rng.chance(0.3 + 0.1 * Math.min(1, d));
    // A gap leaves a standing goat ROAD_WINDOW s between two vehicles, at this speed.
    const minGap = speed * ROAD_WINDOW + 2 * GOAT_HW + 10;
    const spread = Math.max(120, 280 - 140 * d) + 60 * (lanes - 1);
    const movers: Mover[] = [];
    let total = 0;
    while (total < W + 2 * ROAD_MARGIN) {
      const kind: MoverKind = trucks && rng.chance(0.6) ? 'truck' : rng.chance(0.5) ? 'car' : 'car2';
      const length = LENGTH[kind as keyof typeof LENGTH];
      movers.push({kind, offset: total, length});
      total += length + minGap + rng.range(0, spread);
    }
    const shift = rng.range(0, total);
    for (const m of movers) m.offset = (m.offset + shift) % total;
    return {dir, speed, loop: total, margin: ROAD_MARGIN, movers};
  }

  private riverLane(index: number, dir: 1 | -1): Lane {
    const rng = this.rng;
    const d = difficulty(index);
    const snow = index >= SNOW_FROM;
    // Floes drift faster than logs, and are shorter.
    const extra = Math.max(0, d - 1) * 16;
    const speed = snow ? rng.range(50 + extra, 66 + extra) : rng.range(30 + 16 * d, 46 + 22 * d);
    const [shortest, longest] = snow ? FLOE_LENGTH : LOG_LENGTH;
    // The next log is under any point within RIVER_MAX_WAIT (a goat stands RIDE_MARGIN inside the ends).
    const maxGap = Math.min(170, RIVER_MAX_WAIT * speed - 2 * RIDE_MARGIN);
    const movers: Mover[] = [];
    let total = 0;
    while (total < W + 2 * RIVER_MARGIN) {
      const length = Math.round(rng.range(shortest, longest) / 8) * 8;
      movers.push({kind: snow ? 'floe' : 'log', offset: total, length});
      total += length + rng.range(48, maxGap);
    }
    const shift = rng.range(0, total);
    for (const m of movers) m.offset = (m.offset + shift) % total;
    return {dir, speed, loop: total, margin: RIVER_MARGIN, movers};
  }

  private train(index: number): Train {
    const rng = this.rng;
    const d = Math.min(1, difficulty(index));
    const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    const period = Math.max(5, rng.range(5.8, 8.5) - d);
    return {dir, speed: rng.range(1100, 1300) + 200 * d, period, phase: rng.range(0, period), wagons: rng.int(2, 3)};
  }

  /**
   * The meadow a goat crosses from to reach row [i] going straight up: the row below, or the one
   * before the roads and tracks below (a goat crosses those in a straight line). Null past a river.
   */
  private meadowBefore(i: number): Row | null {
    for (let k = i - 1; k >= BOTTOM; k--) {
      const row = this.rows.get(k);
      if (!row || row.kind === 'river') return null;
      if (row.kind === 'meadow') return row;
    }
    return null;
  }

  /**
   * A meadow: up to four cells taken (rocks, trees, a signal by a track), never trapping the goat:
   * from every free run of the meadow before it (the row below, or the one before the roads and
   * tracks below), a cell of this one is free straight ahead. Next to a river, no two taken cells
   * side by side, so a goat riding past finds a way up.
   */
  private meadow(i: number, signal: Train | null, below: Row | null): Row {
    const before = this.meadowBefore(i);
    const rng = this.rng;
    const d = difficulty(i);
    const blocked = new Array<boolean>(COLS).fill(false);
    const obstacles: Obstacle[] = [];
    if (signal) {
      // On the side the trains come from, unless its post would close the only way up from a
      // single free cell of the meadow below (then the other side; if both, the post stands aside
      // and the goat can pass it).
      const runs = before ? segments(before.blocked) : [];
      const closes = (col: number) => runs.some((run) => run.length === 1 && run[0] === col);
      const preferred = signal.dir > 0 ? 0 : COLS - 1;
      const other = COLS - 1 - preferred;
      const col = !closes(preferred) ? preferred : !closes(other) ? other : preferred;
      blocked[col] = !closes(col);
      obstacles.push({col, kind: 'signal'});
    }
    const overRiver = below?.kind === 'river';
    const underRiver = this.plan[0]?.kind === 'river';
    const start = i <= START_TOP;
    const most = Math.min(4 - (signal ? 1 : 0), start ? 2 : d < 0.25 ? 2 : d < 0.6 ? 3 : 4);
    const look = rng.int(1, 1 << 30);
    for (let tries = 0; tries < 40; tries++) {
      const want = rng.int(start || d < 0.1 ? 0 : 1, most);
      const cells = blocked.slice();
      const placed: number[] = [];
      for (let k = 0; k < want; k++) {
        const col = rng.int(0, COLS - 1);
        if (cells[col] || obstacles.some((o) => o.col === col) || (start && col >= 3 && col <= 5)) continue;
        cells[col] = true;
        placed.push(col);
      }
      if ((overRiver || underRiver) && cells.some((b, c) => b && cells[c + 1])) continue;
      // No free cell alone between rocks (or a rock and the edge): a dead end.
      if (segments(cells).some((run) => run.length < 2)) continue;
      if (before && !segments(before.blocked).every((run) => run.some((c) => !cells[c]))) continue;
      for (const col of placed) obstacles.push({col, kind: rng.chance(0.5) ? 'rock' : 'tree'});
      return {index: i, kind: 'meadow', snow: i >= SNOW_FROM, look, blocked: cells, obstacles, lane: null, train: null, signal};
    }
    return {index: i, kind: 'meadow', snow: i >= SNOW_FROM, look, blocked, obstacles, lane: null, train: null, signal};
  }
}
