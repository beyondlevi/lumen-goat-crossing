import {
  CELL, COLS, GOAT_HW, SNOW_FROM, X0, X1, World, colX, floatAt, nearestCol, trainSpan, vehicleAt, type Row,
} from './world';

export type Screen = 'title' | 'howto' | 'playing' | 'paused' | 'over';
export type Move = 'up' | 'down' | 'left' | 'right';
export type Cause = 'car' | 'train' | 'splash' | 'swept' | 'eagle';
export type Zone = 'valley' | 'snow';

/** The simulation's fixed step (s): the same game on the glasses' 30 fps and a desktop's 60. */
export const STEP = 1 / 60;
/** One hop (s). */
export const HOP_TIME = 0.15;
/** No hop for this long and the eagle comes (s). */
export const IDLE_TIME = 5;
/** From "KEEP MOVING!" to the eagle's dive (s). */
export const EAGLE_TIME = 2;
/** The eagle's dive, before it carries the goat off (s). */
export const EAGLE_DIVE = 0.45;
/** The goat's row this close to the bottom edge (in rows) is lagging. */
export const LAG_ROWS = 0.25;
/** The view follows a goat more than this many rows above the bottom edge. */
export const FOLLOW_ROWS = 3;
/** Where the view starts: the goat two rows above the bottom one. */
export const START_CAM = -2;
/** The zone banner (s). */
export const BANNER_TIME = 2.4;
/** The controls pill shows this long, then fades (s). */
export const HINT_TIME = 6;
export const HINT_FADE = 1.5;
/** After a game over, swipes this soon are the run's last ones, not "again" (s). */
export const OVER_GUARD = 0.6;
/** How long each end plays before the game over screen (s). */
export const DEATH_TIME: Record<Cause, number> = {car: 1.1, train: 1.1, splash: 1.1, swept: 1.1, eagle: 1.45};
/** How high the goat stands on a log or a floe (px). */
export const RIDE_LIFT = {log: 19, floe: 15} as const;

/** How fast the view creeps forward (rows/s): slowly, then faster with the score. */
export function creep(score: number): number {
  return Math.min(0.45, 0.15 + score * 0.0015);
}

export function zoneOf(row: number): Zone {
  return row >= SNOW_FROM ? 'snow' : 'valley';
}

export interface Hop {
  move: Move;
  fromRow: number;
  toRow: number;
  fromX: number;
  toX: number;
  at: number;
  fromLift: number;
  toLift: number;
}

export interface Goat {
  /** The row it is on, or hopping to. */
  row: number;
  /** Center x. */
  x: number;
  facing: 1 | -1;
  hop: Hop | null;
  /** The last hop, kept for its trail. */
  last: Hop | null;
  landedAt: number;
  /** How high it stands (on a log or a floe). */
  lift: number;
  /** A hop that a rock, a tree or an edge refused: a little nudge. */
  bump: {move: Move; at: number} | null;
}

export interface Warning {
  at: number;
  /** The goat's row then: a hop past it clears the warning. */
  row: number;
  cause: 'lag' | 'idle';
  /** The eagle waits on this side of the goat: 1 right, -1 left. */
  side: 1 | -1;
}

export interface Dying {
  cause: Cause;
  at: number;
  x: number;
  /** The row the goat was in, and where it was drawn (between two rows mid-hop). */
  row: number;
  visualRow: number;
  lift: number;
  /** Where the vehicle came from (knocks the goat that way). */
  dir: 1 | -1;
  facing: 1 | -1;
  snow: boolean;
  side: 1 | -1;
}

export interface Store {
  get(): number;
  set(best: number): void;
}

const MOVES: Record<string, Move> = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'};

/**
 * One game: the screens (title, how to play, the crossing, pause, game over), the hops, the rows'
 * hazards, the creeping view and the eagle. No drawing here (see render.ts), so it runs the same in
 * tests. [t] is the run's clock and [wt] the world's (both stop while paused; the world's also
 * stops once the goat is hit). [clock] runs on every screen.
 */
export class Game {
  screen: Screen = 'title';
  world!: World;
  goat!: Goat;
  /** The row at the bottom edge of the view (fractional: the view creeps). */
  cam = START_CAM;
  t = 0;
  wt = 0;
  clock = 0;
  score = 0;
  best: number;
  /** The best before this run (for NEW BEST). */
  previousBest = 0;
  /** The first hop starts the pressure (the creeping view, the eagle). */
  started = false;
  lastHopAt = 0;
  warning: Warning | null = null;
  dying: Dying | null = null;
  /** The last run's end, for the game over screen. */
  cause: Cause = 'car';
  causeSnow = false;
  zone: Zone = 'valley';
  bannerAt: number | null = null;
  overAt = 0;
  queued: Move | null = null;
  private seed: number;
  private acc = 0;
  private readonly store: Store;

  constructor(seed: number, store: Store) {
    this.seed = seed;
    this.store = store;
    this.best = store.get();
    this.reset();
  }

  /** A fresh crossing: a new world, the goat on the start meadow. */
  reset(): void {
    this.world = new World(this.seed++);
    this.goat = {row: 0, x: colX(4), facing: 1, hop: null, last: null, landedAt: -10, lift: 0, bump: null};
    this.cam = START_CAM;
    this.t = 0;
    this.wt = 0;
    this.acc = 0;
    this.score = 0;
    this.started = false;
    this.lastHopAt = 0;
    this.warning = null;
    this.dying = null;
    this.zone = 'valley';
    this.bannerAt = null;
    this.queued = null;
  }

  // ---- Input ----

  /** A key from the band (arrows, Enter = index tap, Escape = middle tap). True if the game used it. */
  key(key: string): boolean {
    switch (this.screen) {
      case 'title':
        if (key === 'ArrowUp') return this.begin();
        if (key === 'Enter') return this.show('howto');
        return false; // Escape: the app's Back (Lumen closes it).
      case 'howto':
        if (key === 'Enter' || key === 'Escape') return this.show('title');
        return false;
      case 'playing': {
        const move = MOVES[key];
        if (move) {
          this.move(move);
          return true;
        }
        if (key === 'Escape') {
          if (!this.dying) this.pause();
          return true;
        }
        return false; // Enter does nothing while playing.
      }
      case 'paused':
        if (key === 'Enter' || key === 'ArrowUp') return this.show('playing');
        if (key === 'Escape') {
          this.keepRecord();
          this.reset();
          return this.show('title');
        }
        return false;
      case 'over':
        if (key === 'ArrowUp' || key === 'Enter') {
          // A swipe that left the band just as the run ended isn't "again".
          if (this.clock - this.overAt < OVER_GUARD) return true;
          return this.begin();
        }
        if (key === 'Escape') {
          this.reset();
          return this.show('title');
        }
        return false;
    }
  }

  /** The app went to the background (the display off, another screen): a run waits paused. */
  hidden(): void {
    if (this.screen !== 'playing') return;
    if (this.dying) this.finish();
    else this.pause();
  }

  private show(screen: Screen): boolean {
    this.screen = screen;
    return true;
  }

  private pause(): void {
    this.keepRecord();
    this.screen = 'paused';
  }

  private begin(): boolean {
    this.reset();
    this.previousBest = this.best;
    this.screen = 'playing';
    return true;
  }

  /** A hop, or the next one if the goat is in the air (one waits, the latest). */
  move(move: Move): void {
    if (this.screen !== 'playing' || this.dying) return;
    if (this.goat.hop) {
      this.queued = move;
      return;
    }
    this.hop(move);
  }

  /**
   * Where [move] takes a goat at [from] (by default, where the goat is), or null when it can't go:
   * an edge, a rock, a tree, or back below the bottom edge.
   */
  target(move: Move, from: {row: number; x: number} = this.goat): {row: number; x: number} | null {
    const sideways = move === 'left' || move === 'right';
    const step = move === 'left' ? -1 : 1;
    const row = move === 'up' ? from.row + 1 : move === 'down' ? from.row - 1 : from.row;
    if (move === 'down' && row < this.cam) return null;
    const to = this.world.row(row);
    if (to.kind === 'river') {
      // On the water the goat keeps its x (it rides wherever it lands).
      const x = sideways ? from.x + step * CELL : from.x;
      if (x < X0 + 8 || x > X1 - 8) return null;
      return {row, x};
    }
    // On land it stands on a cell.
    const col = nearestCol(from.x) + (sideways ? step : 0);
    if (col < 0 || col >= COLS) return null;
    if (to.kind === 'meadow' && to.blocked[col]) return null;
    return {row, x: colX(col)};
  }

  private hop(move: Move): void {
    const goat = this.goat;
    if (move === 'left') goat.facing = -1;
    if (move === 'right') goat.facing = 1;
    const to = this.target(move);
    if (!to) {
      goat.bump = {move, at: this.t};
      return;
    }
    const dest = this.world.row(to.row);
    goat.hop = {
      move, fromRow: goat.row, toRow: to.row, fromX: goat.x, toX: to.x, at: this.t, fromLift: goat.lift,
      toLift: dest.kind === 'river' ? (dest.snow ? RIDE_LIFT.floe : RIDE_LIFT.log) : 0,
    };
    goat.row = to.row;
    goat.bump = null;
    this.started = true;
    this.lastHopAt = this.t;
    if (to.row > this.score) this.reach(to.row);
  }

  /** A new row: +1, and the record kept at once (a run can end with the app closed). */
  private reach(row: number): void {
    this.score = row;
    if (this.score > this.best) {
      this.best = this.score;
      this.store.set(this.best);
    }
    const zone = zoneOf(row);
    if (zone !== this.zone) {
      this.zone = zone;
      this.bannerAt = this.t;
    }
  }

  private keepRecord(): void {
    if (this.score > this.best) {
      this.best = this.score;
      this.store.set(this.best);
    }
  }

  /** A new record this run. */
  get record(): boolean {
    return this.score > this.previousBest;
  }

  // ---- Simulation ----

  /** Advances the game by [dt] seconds, in fixed steps. */
  update(dt: number): void {
    this.clock += dt;
    if (this.screen !== 'playing') return;
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP - 1e-9) {
      this.acc -= STEP;
      this.step(STEP);
      if (this.screen !== 'playing') {
        this.acc = 0;
        return;
      }
    }
  }

  /** How far through its hop the goat is (0..1), or null. */
  hopProgress(): number | null {
    const hop = this.goat.hop;
    return hop ? Math.min(1, (this.t - hop.at) / HOP_TIME) : null;
  }

  /** The row the goat is in for the hazards: the one it leaves until halfway through a hop. */
  presenceRow(): number {
    const hop = this.goat.hop;
    const p = this.hopProgress();
    return hop && p !== null && p < 0.5 ? hop.fromRow : this.goat.row;
  }

  /** The row the goat is drawn on (between two rows mid-hop). */
  visualRow(): number {
    const hop = this.goat.hop;
    const p = this.hopProgress();
    return hop && p !== null ? hop.fromRow + (hop.toRow - hop.fromRow) * p : this.goat.row;
  }

  private step(dt: number): void {
    this.t += dt;
    if (this.dying) {
      if (this.t - this.dying.at >= DEATH_TIME[this.dying.cause]) this.finish();
      return;
    }
    this.wt += dt;
    const goat = this.goat;
    if (goat.hop) {
      const p = (this.t - goat.hop.at) / HOP_TIME;
      if (p >= 1 - 1e-9) {
        goat.x = goat.hop.toX;
        this.land();
        if (this.dying) return;
      } else {
        goat.x = goat.hop.fromX + (goat.hop.toX - goat.hop.fromX) * p;
      }
    } else {
      // Riding: the log carries the goat.
      const row = this.world.row(goat.row);
      if (row.kind === 'river' && row.lane) goat.x += row.lane.dir * row.lane.speed * dt;
    }
    this.hits();
    if (this.dying) return;
    this.follow(dt);
    this.pressure();
    this.world.ensure(Math.ceil(this.cam) + 14);
    this.world.prune(Math.floor(this.cam) - 8);
  }

  private land(): void {
    const goat = this.goat;
    goat.last = goat.hop;
    goat.hop = null;
    goat.landedAt = this.t;
    goat.lift = 0;
    const row = this.world.row(goat.row);
    if (row.kind === 'river') {
      const float = floatAt(row, goat.x, this.wt);
      if (!float) {
        this.die('splash', row);
        return;
      }
      goat.lift = float.kind === 'floe' ? RIDE_LIFT.floe : RIDE_LIFT.log;
    }
    const next = this.queued;
    this.queued = null;
    if (next) this.hop(next);
  }

  /** Cars, trucks, trains, and a ride off the edge of the screen. */
  private hits(): void {
    const goat = this.goat;
    const row = this.world.row(this.presenceRow());
    if (row.kind === 'road' && row.lane) {
      if (vehicleAt(row, goat.x, GOAT_HW, this.wt)) this.die('car', row);
    } else if (row.kind === 'rails' && row.train) {
      const span = trainSpan(row.train, this.wt);
      if (span && goat.x + GOAT_HW > span[0] && goat.x - GOAT_HW < span[1]) this.die('train', row);
    } else if (row.kind === 'river' && !goat.hop && (goat.x < X0 || goat.x > X1)) {
      this.die('swept', row);
    }
  }

  /** The view creeps forward once the run started, and follows a goat that runs ahead. */
  private follow(dt: number): void {
    if (this.started) this.cam += creep(this.score) * dt;
    const ahead = this.visualRow() - FOLLOW_ROWS;
    if (ahead > this.cam) this.cam += (ahead - this.cam) * Math.min(1, dt * 8);
    // It never leaves the goat behind: the goat waits at the bottom edge, for the eagle.
    if (this.cam > this.goat.row) this.cam = this.goat.row;
  }

  /** Lagging at the bottom edge, or idle: "KEEP MOVING!", then the eagle unless the goat moves forward. */
  private pressure(): void {
    if (!this.started) return;
    const goat = this.goat;
    const lag = goat.row - this.cam < LAG_ROWS;
    const idle = this.t - this.lastHopAt >= IDLE_TIME;
    if (this.warning) {
      if (goat.row > this.warning.row && !lag) this.warning = null;
      else if (this.t - this.warning.at >= EAGLE_TIME) this.die('eagle', this.world.row(goat.row));
    } else if (lag || idle) {
      this.warning = {at: this.t, row: goat.row, cause: lag ? 'lag' : 'idle', side: goat.x <= 300 ? 1 : -1};
    }
  }

  private die(cause: Cause, row: Row): void {
    const goat = this.goat;
    const p = this.hopProgress();
    const hop = goat.hop;
    const lift = hop && p !== null ? hop.fromLift + (hop.toLift - hop.fromLift) * p + Math.sin(Math.PI * p) * 16 : goat.lift;
    this.dying = {
      cause, at: this.t, x: goat.x, row: row.index, visualRow: this.visualRow(), lift,
      dir: row.lane?.dir ?? row.train?.dir ?? 1, facing: goat.facing, snow: row.snow,
      side: this.warning?.side ?? (goat.x <= 300 ? 1 : -1),
    };
    goat.hop = null;
    this.queued = null;
    this.keepRecord();
  }

  private finish(): void {
    if (this.dying) {
      this.cause = this.dying.cause;
      this.causeSnow = this.dying.snow;
    }
    this.keepRecord();
    this.screen = 'over';
    this.overAt = this.clock;
  }

  // ---- Test hooks ----

  /** Test hook: this run as if it had reached [rows], the goat on the nearest meadow below. */
  warp(rows: number): void {
    if (this.screen !== 'playing') this.begin();
    this.world.ensure(rows + 16);
    let index = Math.max(0, rows);
    while (index > 0 && this.world.row(index).kind !== 'meadow') index--;
    const row = this.world.row(index);
    const col = [4, 3, 5, 2, 6, 1, 7, 0, 8].find((c) => !row.blocked[c]) ?? 4;
    Object.assign(this.goat, {row: index, x: colX(col), hop: null, last: null, lift: 0, bump: null});
    this.cam = index - FOLLOW_ROWS;
    this.started = true;
    this.lastHopAt = this.t;
    this.warning = null;
    this.queued = null;
    if (index > this.score) this.reach(index);
  }
}
