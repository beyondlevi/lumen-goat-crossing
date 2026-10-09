import {describe, expect, it} from 'vitest';
import {
  BANNER_TIME, DEATH_TIME, EAGLE_TIME, FOLLOW_ROWS, Game, HOP_TIME, IDLE_TIME, OVER_GUARD, RIDE_LIFT, STEP, creep,
} from '../../src/game';
import {catalogsForTests, fill, languageFor, numberFormat, rows, stringsFor} from '../../src/i18n';
import {
  COLS, FLOE_LENGTH, GOAT_HW, LOG_LENGTH, RIDE_MARGIN, RIVER_MAX_WAIT, ROAD_WINDOW, SNOW_FROM, TRAIN_WARN, W, X0, World,
  colX, floatAt, segments, trainPass, trainSpan, trainWarning, vehicleAt, type Row,
} from '../../src/world';
import {DELAY, play} from './bot';

function memoryStore(best = 0) {
  let saved = best;
  return {get: () => saved, set: (b: number) => { saved = b; }};
}

/** Runs [game] for [seconds] in its fixed steps. */
function run(game: Game, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) game.update(STEP);
}

/** Runs [game] until [done] (at most [seconds]). */
function until(game: Game, done: () => boolean, seconds = 30): boolean {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    if (done()) return true;
    game.update(STEP);
  }
  return done();
}

function startRun(seed: number, best = 0) {
  const store = memoryStore(best);
  const game = new Game(seed, store);
  game.key('ArrowUp');
  return {game, store};
}

/** The first row of [kind] at or after [from]. */
function find(world: World, kind: Row['kind'], from = 2): number {
  for (let i = from; i < from + 400; i++) if (world.row(i).kind === kind) return i;
  throw new Error(`no ${kind}`);
}

/** Puts the goat on row [row] at [x], standing (a test setup: no pressure from the view or the eagle). */
function place(game: Game, row: number, x: number, lift = 0): void {
  Object.assign(game.goat, {row, x, hop: null, last: null, lift, bump: null});
  game.cam = row - FOLLOW_ROWS;
  game.started = false;
}

const SEEDS = Array.from({length: 60}, (_, i) => i + 1);
const ROWS = 420;

/** Every world row from 0 to ROWS, for each seed. */
const worlds = SEEDS.map((seed) => {
  const world = new World(seed);
  world.ensure(ROWS + 2);
  return Array.from({length: ROWS + 1}, (_, i) => world.row(i));
});

/** Gaps between consecutive things of a lane, around its loop. */
function gaps(row: Row): number[] {
  const lane = row.lane!;
  const sorted = [...lane.movers].sort((a, b) => a.offset - b.offset);
  return sorted.map((m, i) => {
    const next = sorted[(i + 1) % sorted.length];
    return (((next.offset - (m.offset + m.length)) % lane.loop) + lane.loop) % lane.loop;
  });
}

describe('the crossing', () => {
  it('starts on a safe meadow', () => {
    for (const rowsOf of worlds) {
      expect(rowsOf[0].kind).toBe('meadow');
      expect(rowsOf[1].kind).toBe('meadow');
      expect(rowsOf[0].blocked[4]).toBe(false);
    }
  });

  it('never blocks a meadow, nor traps the goat with the next one', () => {
    let checked = 0;
    for (const rowsOf of worlds) {
      rowsOf.forEach((row, i) => {
        if (row.kind !== 'meadow') return;
        const taken = row.blocked.filter(Boolean).length;
        expect(taken).toBeLessThanOrEqual(4);
        // No free cell alone between rocks or a rock and the edge.
        for (const run of segments(row.blocked)) expect(run.length).toBeGreaterThanOrEqual(2);
        // Next to a river, no two taken cells side by side.
        if (rowsOf[i - 1]?.kind === 'river' || rowsOf[i + 1]?.kind === 'river') {
          for (let c = 0; c + 1 < COLS; c++) expect(row.blocked[c] && row.blocked[c + 1]).toBe(false);
        }
        // From every free run of the meadow before (across roads and tracks), a free cell ahead.
        for (let k = i - 1; k >= 0; k--) {
          const before = rowsOf[k];
          if (before.kind === 'river') break;
          if (before.kind !== 'meadow') continue;
          for (const run of segments(before.blocked)) expect(run.some((c) => !row.blocked[c])).toBe(true);
          checked++;
          break;
        }
      });
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('lets rivers next to each other flow in turns, with logs that come often', () => {
    let rivers = 0;
    for (const rowsOf of worlds) {
      rowsOf.forEach((row, i) => {
        if (row.kind !== 'river') return;
        rivers++;
        const lane = row.lane!;
        const [shortest, longest] = row.snow ? FLOE_LENGTH : LOG_LENGTH;
        for (const m of lane.movers) {
          expect(m.kind).toBe(row.snow ? 'floe' : 'log');
          expect(m.length).toBeGreaterThanOrEqual(shortest);
          expect(m.length).toBeLessThanOrEqual(longest);
          // Standing still, a goat has this long to hop onto it as it passes.
          expect((m.length - 2 * RIDE_MARGIN) / lane.speed).toBeGreaterThan(1.3);
        }
        // From any cell, the next log comes within RIVER_MAX_WAIT.
        for (const gap of gaps(row)) expect((gap + 2 * RIDE_MARGIN) / lane.speed).toBeLessThanOrEqual(RIVER_MAX_WAIT + 1e-9);
        const below = rowsOf[i - 1];
        if (below.kind === 'river') {
          expect(lane.dir).toBe(-below.lane!.dir);
          // Riding the one below, the one above passes by slowly enough to hop on.
          const shortestHere = Math.min(...lane.movers.map((m) => m.length));
          expect((shortestHere - 2 * RIDE_MARGIN) / (lane.speed + below.lane!.speed)).toBeGreaterThan(0.65);
        }
      });
    }
    expect(rivers).toBeGreaterThan(2000);
  });

  it('checks the wait for a log by watching the water', () => {
    // The same as the gaps above, measured: at each x, the longest time with nothing to stand on.
    const world = new World(7);
    const river = world.row(find(world, 'river'));
    for (let x = colX(0); x <= colX(8); x += 16) {
      let longest = 0;
      let since = 0;
      for (let t = 0; t < river.lane!.loop / river.lane!.speed; t += 0.02) {
        if (floatAt(river, x, t)) since = 0;
        else longest = Math.max(longest, (since += 0.02));
      }
      expect(longest).toBeLessThanOrEqual(RIVER_MAX_WAIT + 0.1);
    }
  });

  it('leaves road gaps a goat can cross with the band\'s latency', () => {
    let lanes = 0;
    for (const rowsOf of worlds) {
      for (const row of rowsOf) {
        if (row.kind !== 'road') continue;
        lanes++;
        // A goat standing in the lane is clear of both vehicles for ROAD_WINDOW s: a hop in,
        // the band's latency, and a hop out.
        for (const gap of gaps(row)) expect((gap - 2 * GOAT_HW) / row.lane!.speed).toBeGreaterThanOrEqual(ROAD_WINDOW);
        expect(ROAD_WINDOW).toBeGreaterThanOrEqual(HOP_TIME + 0.4 + HOP_TIME);
      }
    }
    expect(lanes).toBeGreaterThan(3000);
  });

  it('announces every train long enough to step off, with a signal by the track', () => {
    expect(TRAIN_WARN).toBeGreaterThanOrEqual(1.5);
    let tracks = 0;
    for (const rowsOf of worlds) {
      rowsOf.forEach((row, i) => {
        if (row.kind !== 'rails') return;
        tracks++;
        const train = row.train!;
        const below = rowsOf[i - 1];
        expect(below.kind).toBe('meadow');
        expect(below.signal).toBe(train);
        expect(below.obstacles.some((o) => o.kind === 'signal' && (o.col === 0 || o.col === COLS - 1))).toBe(true);
        // Quiet time between trains.
        expect(train.period - TRAIN_WARN - trainPass(train)).toBeGreaterThan(1.5);
      });
    }
    expect(tracks).toBeGreaterThan(400);
    // Measured on one track: the signal blinks TRAIN_WARN before the train reaches the screen.
    const world = new World(3);
    const train = world.row(find(world, 'rails')).train!;
    let warnedAt: number | null = null;
    let checkedTrains = 0;
    let before = false;
    for (let t = 0; t < 40; t += 0.01) {
      const warning = trainWarning(train, t);
      if (warning && !before) warnedAt = t;
      before = warning;
      const span = trainSpan(train, t);
      if (span && span[1] > 0 && span[0] < W && warnedAt !== null) {
        expect(t - warnedAt).toBeGreaterThanOrEqual(TRAIN_WARN - 0.02);
        checkedTrains++;
        warnedAt = null;
      }
    }
    expect(checkedTrains).toBeGreaterThan(3);
  });

  it('turns to snow at row 100: snowy meadows, ice floes', () => {
    for (const rowsOf of worlds.slice(0, 10)) {
      for (const row of rowsOf) {
        expect(row.snow).toBe(row.index >= SNOW_FROM);
        if (row.kind === 'river') expect(row.lane!.movers.every((m) => m.kind === (row.snow ? 'floe' : 'log'))).toBe(true);
      }
    }
    // Floes drift faster than logs.
    const speeds = (snow: boolean) => worlds.flatMap((r) => r.filter((row) => row.kind === 'river' && row.snow === snow && row.index < 150).map((row) => row.lane!.speed));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(speeds(true))).toBeGreaterThan(mean(speeds(false)) + 10);
  });

  it('is the same for the same seed', () => {
    const a = new World(11);
    const b = new World(11);
    a.ensure(200);
    b.ensure(200);
    for (let i = 0; i < 200; i++) expect(JSON.stringify(a.row(i))).toBe(JSON.stringify(b.row(i)));
  });
});

describe('a run', () => {
  it('goes through the screens with the band\'s keys', () => {
    const store = memoryStore(50);
    const game = new Game(3, store);
    expect(game.screen).toBe('title');
    expect(game.key('Escape')).toBe(false); // Back closes the app from the title.
    expect(game.key('ArrowLeft')).toBe(false);
    expect(game.key('Enter')).toBe(true);
    expect(game.screen).toBe('howto');
    expect(game.key('Escape')).toBe(true);
    expect(game.screen).toBe('title');
    game.key('Enter');
    expect(game.key('Enter')).toBe(true);
    expect(game.screen).toBe('title');
    expect(game.key('ArrowUp')).toBe(true);
    expect(game.screen).toBe('playing');
    // Enter does nothing while playing.
    expect(game.key('Enter')).toBe(false);
    expect(game.screen).toBe('playing');
    expect(game.key('Escape')).toBe(true);
    expect(game.screen).toBe('paused');
    expect(game.key('Enter')).toBe(true);
    expect(game.screen).toBe('playing');
    game.key('Escape');
    expect(game.key('ArrowUp')).toBe(true);
    expect(game.screen).toBe('playing');
    game.key('Escape');
    expect(game.key('Escape')).toBe(true);
    expect(game.screen).toBe('title');
    expect(game.best).toBe(50);
  });

  it('hops one cell per arrow, and keeps one move asked for mid-hop', () => {
    const {game} = startRun(5);
    expect(game.goat.x).toBe(colX(4));
    game.key('ArrowRight');
    expect(game.goat.hop).not.toBeNull();
    run(game, HOP_TIME / 2);
    game.key('ArrowLeft');
    game.key('ArrowUp'); // the latest one waits
    run(game, HOP_TIME / 2 + STEP);
    expect(game.goat.x).toBe(colX(5));
    expect(game.goat.row).toBe(1);
    run(game, HOP_TIME + STEP);
    expect(game.goat.hop).toBeNull();
    expect(game.goat.x).toBe(colX(5));
    expect(game.goat.facing).toBe(1);
  });

  it('scores each new row once', () => {
    const {game} = startRun(6);
    const scores: number[] = [];
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']) {
      game.key(key);
      run(game, HOP_TIME + 2 * STEP);
      scores.push(game.score);
    }
    expect(scores).toEqual([1, 1, 1, 1, 1]);
    game.key('ArrowUp');
    run(game, HOP_TIME + 2 * STEP);
    expect(game.score).toBe(2);
  });

  it('refuses hops into a rock, off the sides, and below the bottom edge', () => {
    const {game} = startRun(7);
    game.world.row(1).blocked[4] = true;
    game.key('ArrowUp');
    expect(game.goat.hop).toBeNull();
    expect(game.goat.bump?.move).toBe('up');
    expect(game.score).toBe(0);
    game.world.row(0).blocked[3] = false;
    for (let i = 0; i < 6; i++) {
      game.key('ArrowLeft');
      run(game, HOP_TIME + 2 * STEP);
    }
    expect(game.goat.x).toBe(colX(0));
    game.cam = 0;
    game.key('ArrowDown');
    expect(game.goat.hop).toBeNull();
    expect(game.goat.row).toBe(0);
  });

  it('is hit by a car on the road', () => {
    const {game} = startRun(8);
    const r = find(game.world, 'road');
    place(game, r, colX(4));
    expect(until(game, () => game.dying !== null, 40)).toBe(true);
    expect(game.dying!.cause).toBe('car');
    expect(vehicleAt(game.world.row(r), game.goat.x, GOAT_HW, game.wt)).not.toBeNull();
    run(game, DEATH_TIME.car + 0.1);
    expect(game.screen).toBe('over');
    expect(game.cause).toBe('car');
  });

  it('is hit by the train, after the signal blinked long enough to step off', () => {
    const {game} = startRun(9);
    const r = find(game.world, 'rails', 10);
    place(game, r, colX(4));
    const train = game.world.row(r).train!;
    // Wait for a quiet moment, then stand there.
    until(game, () => !trainWarning(train, game.wt), 20);
    let warnedAt: number | null = null;
    expect(until(game, () => {
      if (warnedAt === null && trainWarning(train, game.wt)) warnedAt = game.wt;
      return game.dying !== null;
    }, 20)).toBe(true);
    expect(game.dying!.cause).toBe('train');
    expect(game.wt - warnedAt!).toBeGreaterThanOrEqual(1.5);
    run(game, DEATH_TIME.train + 0.1);
    expect(game.cause).toBe('train');
  });

  it('splashes into the water, and rides a log', () => {
    const {game} = startRun(10);
    const r = find(game.world, 'river');
    const river = game.world.row(r);
    const meadow = game.world.row(r - 1);
    expect(meadow.kind).toBe('meadow');
    const col = [4, 3, 5, 2, 6].find((c) => !meadow.blocked[c])!;
    const x = colX(col);
    // Water at the landing: SPLASH.
    place(game, r - 1, x);
    until(game, () => [-0.05, 0, 0.05].every((d) => !floatAt(river, x, game.wt + HOP_TIME + d)), 20);
    game.key('ArrowUp');
    run(game, HOP_TIME + 2 * STEP);
    expect(game.dying?.cause).toBe('splash');

    const second = startRun(10).game;
    place(second, r - 1, x);
    until(second, () => [-0.05, 0, 0.3, 0.6].every((d) => floatAt(river, x, second.wt + HOP_TIME + d)), 20);
    second.key('ArrowUp');
    run(second, HOP_TIME + 2 * STEP);
    expect(second.dying).toBeNull();
    expect(second.goat.lift).toBe(RIDE_LIFT.log);
    const before = second.goat.x;
    run(second, 0.5);
    expect(second.dying).toBeNull();
    expect(second.goat.x - before).toBeCloseTo(river.lane!.dir * river.lane!.speed * 0.5, 0);
  });

  it('is swept away when its log carries it off the edge', () => {
    const {game} = startRun(11);
    const r = find(game.world, 'river');
    const river = game.world.row(r);
    const lane = river.lane!;
    // A log reaching the edge it drifts to.
    const edge = lane.dir < 0 ? X0 + 4 : X0 + COLS * 64 - 4;
    until(game, () => floatAt(river, edge, game.wt) !== null && floatAt(river, edge - lane.dir * 40, game.wt) !== null, 40);
    place(game, r, edge, RIDE_LIFT.log);
    run(game, 0.3);
    expect(game.dying?.cause).toBe('swept');
    run(game, DEATH_TIME.swept);
    expect(game.cause).toBe('swept');
  });

  it('sends the eagle when the goat lags at the bottom edge', () => {
    const {game} = startRun(12);
    game.key('ArrowRight');
    run(game, HOP_TIME + STEP);
    game.cam = game.goat.row - 0.2;
    run(game, STEP * 2);
    expect(game.warning?.cause).toBe('lag');
    run(game, EAGLE_TIME - 0.2);
    expect(game.dying).toBeNull();
    run(game, 0.3);
    expect(game.dying?.cause).toBe('eagle');
    run(game, DEATH_TIME.eagle + 0.1);
    expect(game.screen).toBe('over');
    expect(game.cause).toBe('eagle');
  });

  it('sends the eagle after idling, unless the goat moves forward', () => {
    const {game} = startRun(13);
    game.key('ArrowRight');
    run(game, HOP_TIME + STEP);
    run(game, IDLE_TIME - 0.3);
    expect(game.warning).toBeNull();
    run(game, 0.4);
    expect(game.warning?.cause).toBe('idle');
    // Sideways doesn't count; forward does.
    game.key('ArrowLeft');
    run(game, HOP_TIME + STEP);
    expect(game.warning).not.toBeNull();
    game.key('ArrowUp');
    run(game, HOP_TIME + STEP);
    expect(game.warning).toBeNull();
    run(game, IDLE_TIME + EAGLE_TIME + 0.2);
    expect(game.dying?.cause).toBe('eagle');
  });

  it('creeps the view forward once the run started, faster with the score', () => {
    const {game} = startRun(14);
    const cam = game.cam;
    run(game, 3);
    expect(game.cam).toBe(cam);
    game.key('ArrowUp');
    run(game, 2);
    expect(game.cam).toBeGreaterThan(cam);
    expect(creep(150)).toBeGreaterThan(creep(0));
    expect(creep(1000)).toBeLessThanOrEqual(0.45);
  });

  it('enters the snow at row 100 with a banner', () => {
    const {game} = startRun(15);
    game.warp(60);
    expect(game.zone).toBe('valley');
    expect(game.bannerAt).toBeNull();
    game.warp(SNOW_FROM + 3);
    expect(game.score).toBeGreaterThanOrEqual(SNOW_FROM);
    expect(game.zone).toBe('snow');
    expect(game.bannerAt).toBe(game.t);
    expect(game.world.row(game.goat.row).snow).toBe(true);
    expect(BANNER_TIME).toBeGreaterThan(2);
  });

  it('keeps the best of a run quit from the pause, or hidden', () => {
    const {game, store} = startRun(16, 10);
    game.warp(30);
    const reached = game.score;
    expect(reached).toBeGreaterThan(10);
    game.key('Escape');
    expect(game.screen).toBe('paused');
    expect(store.get()).toBe(reached);
    game.key('Escape');
    expect(game.screen).toBe('title');
    expect(game.best).toBe(reached);

    const other = startRun(17, 5);
    other.game.warp(40);
    other.game.hidden();
    expect(other.game.screen).toBe('paused');
    expect(other.store.get()).toBe(other.game.score);
    // A fresh game reads it back.
    expect(new Game(1, other.store).best).toBe(other.game.score);
  });

  it('ends: NEW BEST, a guard against the run\'s last swipes, again, or the title', () => {
    const {game, store} = startRun(18, 3);
    game.warp(12);
    game.cam = game.goat.row - 0.1;
    run(game, EAGLE_TIME + DEATH_TIME.eagle + 0.3);
    expect(game.screen).toBe('over');
    expect(game.record).toBe(true);
    expect(game.previousBest).toBe(3);
    expect(store.get()).toBe(game.score);
    expect(game.key('ArrowUp')).toBe(true);
    expect(game.screen).toBe('over');
    run(game, OVER_GUARD);
    expect(game.key('ArrowUp')).toBe(true);
    expect(game.screen).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.record).toBe(false);
    game.warp(5);
    game.cam = game.goat.row - 0.1;
    run(game, EAGLE_TIME + DEATH_TIME.eagle + OVER_GUARD + 0.3);
    expect(game.screen).toBe('over');
    expect(game.record).toBe(false);
    expect(game.key('Escape')).toBe(true);
    expect(game.screen).toBe('title');
  });

  it('ends the run at once when hidden mid-fall', () => {
    const {game} = startRun(19);
    game.cam = game.goat.row - 0.1;
    game.key('ArrowRight');
    run(game, EAGLE_TIME + 0.3);
    expect(game.dying).not.toBeNull();
    game.hidden();
    expect(game.screen).toBe('over');
  });

  it('can be crossed with only the four hops and the band\'s latency (a bot, 20 seeds)', () => {
    expect(DELAY).toBe(0.3);
    const results = Array.from({length: 20}, (_, i) => {
      const game = new Game(i + 1, memoryStore());
      game.key('ArrowUp');
      return play(game, 150).score;
    });
    const through = results.filter((score) => score >= 150).length;
    console.log(`bot: ${through}/20 seeds reached row 150 (rows: ${results.join(', ')})`);
    expect(through).toBeGreaterThanOrEqual(18);
  }, 120000);
});

describe('texts', () => {
  it('have the same keys and placeholders in English and Brazilian Portuguese', () => {
    const {en, pt} = catalogsForTests;
    const flat = (o: object, prefix = ''): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v as string]]));
    const enEntries = flat(en);
    const ptEntries = new Map(flat(pt));
    expect([...ptEntries.keys()].sort()).toEqual(enEntries.map(([k]) => k).sort());
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [key, value] of enEntries) {
      expect(holes(ptEntries.get(key)!), key).toBe(holes(value));
      expect(ptEntries.get(key)!.split('\n').length, key).toBe(value.split('\n').length);
    }
    // Brazilian forms only.
    for (const value of ptEntries.values()) expect(value).not.toMatch(/\b(tu|teu|tua|ecrã|utilizador|premir|carrega)\b/i);
    expect(languageFor('pt-PT')).toBe('pt');
    expect(languageFor('pt-BR')).toBe('pt');
    expect(languageFor('fr-FR')).toBe('en');
    expect(stringsFor('pt-PT').play).toBe(pt.play);
    expect(stringsFor(undefined).play).toBe(en.play);
    expect(rows(en, 1, numberFormat('en'))).toBe('1 row');
    expect(rows(pt, 1250, numberFormat('pt'))).toBe('1.250 fileiras');
    expect(fill(en.overLineRecord, {rows: rows(en, 57, String), best: 52})).toBe('57 rows · previous best 52');
  });
});

