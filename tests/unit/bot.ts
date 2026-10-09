import {Game, HOP_TIME, STEP, type Move} from '../../src/game';
import {GOAT_HW, X0, X1, colX, floatAt, nearestCol, segments, trainSpan, trainWarning, vehicleAt, type Row} from '../../src/world';

/**
 * A player for the tests: it only sends the four hops, and each one reaches the game DELAY s after
 * it decided (the band's latency). It looks at the rows ahead like a person does, and plans a way
 * through roads, rivers and tracks before it goes.
 */

/** The band's latency the bot plays with. */
export const DELAY = 0.3;
/** How often it looks again while it waits (s). */
const LOOK = 0.1;
/** The waits it considers before each next hop (s). */
const WAITS = Array.from({length: 14}, (_, i) => i * 0.1);
/** Extra room it keeps from vehicles and trains (px). */
const ROOM = 6;

const KEYS: Record<Move, string> = {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'};

/** x of a goat that was at [x] at [t0], at [t] (a log carries it). */
function drift(row: Row, x: number, t0: number, t: number): number {
  return row.kind === 'river' && row.lane ? x + row.lane.dir * row.lane.speed * (t - t0) : x;
}

/** Whether a goat that stands on [row] at [x] at [t0] (riding along on a river) is alive until [t1]. */
function holds(row: Row, x: number, t0: number, t1: number): boolean {
  if (row.kind === 'meadow') return true;
  if (row.kind === 'river') {
    if (!floatAt(row, x, t0)) return false;
    const end = drift(row, x, t0, t1);
    return end > X0 + 4 && end < X1 - 4;
  }
  for (let t = t0; t <= t1 + 1e-9; t += STEP * 2) {
    if (row.kind === 'road' && vehicleAt(row, x, GOAT_HW + ROOM, t)) return false;
    if (row.kind === 'rails' && row.train) {
      const span = trainSpan(row.train, t);
      if (span && x + GOAT_HW + ROOM * 3 > span[0] && x - GOAT_HW - ROOM * 3 < span[1]) return false;
    }
  }
  return true;
}

/** Whether a goat arriving on [row] at [x], present from [enter] and landed at [land], is fine there. */
function arrives(row: Row, x: number, enter: number, land: number): boolean {
  if (row.kind === 'river') return floatAt(row, x, land) !== null && holds(row, x, land, land + 0.2);
  // Never onto a track while its signal blinks.
  if (row.kind === 'rails' && row.train && trainWarning(row.train, enter)) return false;
  return holds(row, x, enter, land + 0.1);
}

/**
 * The hop [move] decided at [t] by a goat that stood on row [r] at [x] since [t] (or riding there):
 * where it lands and when, or null if it doesn't make it.
 */
function hop(game: Game, r: number, x: number, t: number, move: Move): {row: number; x: number; land: number} | null {
  const here = game.world.row(r);
  const start = t + DELAY;
  if (!holds(here, x, t, start + HOP_TIME / 2)) return null;
  const to = game.target(move, {row: r, x: drift(here, x, t, start)});
  if (!to) return null;
  const land = start + HOP_TIME;
  if (!arrives(game.world.row(to.row), to.x, start + HOP_TIME / 2, land)) return null;
  return {row: to.row, x: to.x, land};
}

/** Whether a goat that landed on row [r] at [x] at [t] gets to the next meadow going up, waiting as needed. */
function through(game: Game, r: number, x: number, t: number, depth: number): boolean {
  const row = game.world.row(r);
  if (row.kind === 'meadow') return true;
  if (depth === 0) return false;
  for (const wait of WAITS) {
    if (!holds(row, x, t, t + wait + DELAY + HOP_TIME / 2)) return false;
    const next = hop(game, r, drift(row, x, t, t + wait), t + wait, 'up');
    if (next && through(game, next.row, next.x, next.land, depth - 1)) return true;
  }
  return false;
}

/** Up now, with a way through what follows. */
function upWorks(game: Game, r: number, x: number, t: number): boolean {
  const next = hop(game, r, x, t, 'up');
  return next !== null && through(game, next.row, next.x, next.land, 5);
}

/** The seconds from now until going up from row [r] at [x] works (after a wait), or Infinity. */
function soonestUp(game: Game, r: number, x: number, at: number, within: number): number {
  const row = game.world.row(r);
  for (let wait = 0; wait <= within + 1e-9; wait += 0.1) {
    if (!holds(row, x, at, at + wait)) return Infinity;
    if (upWorks(game, r, drift(row, x, at, at + wait), at + wait)) return at + wait - game.t;
  }
  return Infinity;
}

/** The bot's choice now: forward when it can, sideways to a better spot, away from danger, or wait. */
export function decide(game: Game): Move | null {
  const goat = game.goat;
  const now = game.t;
  const here = game.world.row(goat.row);
  if (upWorks(game, goat.row, goat.x, now)) return 'up';
  const step = DELAY + HOP_TIME;
  if (here.kind === 'meadow') {
    // Look along this meadow for the spot with the soonest way up (walking there takes hops).
    const col = nearestCol(goat.x);
    const run = segments(here.blocked).find((r) => r.includes(col)) ?? [col];
    let best = {col, time: soonestUp(game, goat.row, goat.x, now, 2)};
    for (const c of run) {
      const hops = Math.abs(c - col);
      if (hops === 0 || hops > 4) continue;
      const time = hops * step + soonestUp(game, goat.row, colX(c), now + hops * step, 2);
      if (time < best.time - 0.05) best = {col: c, time};
    }
    if (best.col !== col) return best.col < col ? 'left' : 'right';
    return null;
  }
  if (here.kind === 'river' && here.lane) {
    // Riding: up later from here, or from a step along the log.
    const stay = soonestUp(game, goat.row, goat.x, now, 2);
    let best: {move: Move | null; time: number} = {move: null, time: stay};
    for (const move of ['left', 'right'] as Move[]) {
      const next = hop(game, goat.row, goat.x, now, move);
      if (!next) continue;
      const time = next.land - now + soonestUp(game, next.row, next.x, next.land, 2);
      if (time < best.time - 0.05) best = {move, time};
    }
    if (best.move) return best.move;
    if (Number.isFinite(stay) || holds(here, goat.x, now, now + step + 0.2)) return null;
  } else if (holds(here, goat.x, now, now + step + 0.2)) {
    return null;
  }
  // In danger: get out of the way.
  const away: Move[] = here.lane?.dir === 1 ? ['right', 'left', 'down'] : ['left', 'right', 'down'];
  for (const move of away) {
    const next = hop(game, goat.row, goat.x, now, move);
    if (next && (next.row !== goat.row || holds(game.world.row(next.row), next.x, next.land, next.land + 0.3))) return move;
  }
  return null;
}

/** Plays [game] with the bot until it reaches row [target], the run ends, or [limit] s pass. */
export function play(game: Game, target: number, limit = 900): {score: number; screen: string; cause: string | null; t: number} {
  let pending: {move: Move; at: number} | null = null;
  let lookAt = 0;
  while (game.screen === 'playing' && game.score < target && game.t < limit) {
    if (pending && game.t >= pending.at - 1e-9) {
      game.key(KEYS[pending.move]);
      pending = null;
    }
    if (!pending && !game.goat.hop && !game.dying && game.t >= lookAt - 1e-9) {
      const move = decide(game);
      if (move) pending = {move, at: game.t + DELAY};
      else lookAt = game.t + LOOK;
    }
    game.update(STEP);
  }
  return {score: game.score, screen: game.screen, cause: game.dying?.cause ?? (game.screen === 'over' ? game.cause : null), t: game.t};
}

