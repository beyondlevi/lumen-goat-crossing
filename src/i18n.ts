import type {Cause} from './game';

/**
 * Every text the game shows. English is the default; Brazilian Portuguese for any pt-* (the
 * glasses run pt-PT). `{name}` is a placeholder, filled with [fill]; `\n` breaks a line.
 */
const en = {
  title1: 'GOAT',
  title2: 'CROSSING',
  tagline: 'ONE HOP AT A TIME',
  play: 'SWIPE UP TO PLAY',
  bestLine: 'Best: {rows}',
  firstRun: 'Your first crossing',
  titleHints: 'Index tap: how to play · Middle tap: exit',
  rowsOne: '1 row',
  rowsMany: '{count} rows',
  howTitle: 'HOW TO PLAY',
  howHop: 'Each swipe is one hop',
  howHopText: 'Up: forward, +1 for every new row.\nLeft, right: sideways. Down: back.',
  meadow: 'Meadow',
  meadowText: 'Safe. Rocks and trees block a cell.',
  road: 'Road',
  roadText: 'Cars and trucks: do not get hit.',
  river: 'River',
  riverText: 'Ride the logs. Water is deadly,\nand so is drifting off the edge.',
  rails: 'Rails',
  railsText: 'Blinking light: a train, very fast.',
  keepMoving: 'Keep moving',
  keepMovingText: 'Fall behind or wait too long:\nthe eagle carries you off.',
  howHint: 'Index tap or middle tap: back',
  hop: 'HOP',
  sideways: 'SIDEWAYS',
  back: 'BACK',
  best: 'BEST',
  warning: 'KEEP MOVING!',
  zoneRows: '{count} ROWS',
  snowName: 'SNOW',
  snowText: 'Ice floes drift faster.',
  paused: 'PAUSED',
  resume: 'RESUME',
  resumeHint: 'Index tap',
  quit: 'QUIT',
  quitHint: 'Middle tap',
  causes: {
    car: 'HIT BY A CAR',
    train: 'HIT BY THE TRAIN',
    splash: 'SPLASH!',
    swept: 'SWEPT AWAY',
    eagle: 'CARRIED OFF!',
  } as Record<Cause, string>,
  newBest: 'NEW BEST',
  overLine: '{rows} · best {best}',
  overLineRecord: '{rows} · previous best {best}',
  again: 'SWIPE UP: AGAIN',
  overHint: 'Middle tap: title',
};

export type Strings = typeof en;

const pt: Strings = {
  title1: 'GOAT',
  title2: 'CROSSING',
  tagline: 'UM PULO DE CADA VEZ',
  play: 'DESLIZE PARA CIMA',
  bestLine: 'Recorde: {rows}',
  firstRun: 'Sua primeira travessia',
  titleHints: 'Indicador: como jogar · Médio: sair',
  rowsOne: '1 fileira',
  rowsMany: '{count} fileiras',
  howTitle: 'COMO JOGAR',
  howHop: 'Cada deslize é um pulo',
  howHopText: 'Cima: avança, +1 a cada fileira nova.\nEsquerda, direita: de lado. Baixo: volta.',
  meadow: 'Campo',
  meadowText: 'Seguro. Pedras e árvores fecham a casa.',
  road: 'Estrada',
  roadText: 'Carros e caminhões: não seja atropelado.',
  river: 'Rio',
  riverText: 'Vá nos troncos. A água é fatal,\ne sair pela borda também.',
  rails: 'Trilhos',
  railsText: 'Luz piscando: vem um trem, bem rápido.',
  keepMoving: 'Não pare',
  keepMovingText: 'Ficou para trás ou parado demais:\na águia leva você embora.',
  howHint: 'Indicador ou médio: voltar',
  hop: 'PULAR',
  sideways: 'DE LADO',
  back: 'PARA TRÁS',
  best: 'RECORDE',
  warning: 'NÃO PARE!',
  zoneRows: '{count} FILEIRAS',
  snowName: 'NEVE',
  snowText: 'Os blocos de gelo correm mais.',
  paused: 'PAUSA',
  resume: 'CONTINUAR',
  resumeHint: 'Toque do indicador',
  quit: 'SAIR',
  quitHint: 'Toque do médio',
  causes: {
    car: 'ATROPELADO!',
    train: 'PEGO PELO TREM!',
    splash: 'TCHIBUM!',
    swept: 'LEVADO PELO RIO',
    eagle: 'LEVADO PELA ÁGUIA!',
  },
  newBest: 'NOVO RECORDE',
  overLine: '{rows} · recorde {best}',
  overLineRecord: '{rows} · recorde anterior {best}',
  again: 'DE NOVO: PARA CIMA',
  overHint: 'Médio: tela inicial',
};

const catalogs: Record<'en' | 'pt', Strings> = {en, pt};

/** The base language used for [language] (a BCP 47 tag): Portuguese for any pt-*, else English. */
export function languageFor(language: string | undefined): 'en' | 'pt' {
  return (language ?? 'en').toLowerCase().split('-')[0] === 'pt' ? 'pt' : 'en';
}

/** The strings for [language]. */
export function stringsFor(language: string | undefined): Strings {
  return catalogs[languageFor(language)];
}

/** Formats a number for [language]: 1,250 in English, 1.250 in Brazilian Portuguese. */
export function numberFormat(language: string | undefined): (n: number) => string {
  const format = new Intl.NumberFormat(languageFor(language) === 'pt' ? 'pt-BR' : 'en-US');
  return (n) => format.format(n);
}

/** Fills `{name}` placeholders. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

/** "1 row", "52 rows", in the language of [s]. */
export function rows(s: Strings, count: number, format: (n: number) => string): string {
  return count === 1 ? s.rowsOne : fill(s.rowsMany, {count: format(count)});
}

export const catalogsForTests = {en, pt};
