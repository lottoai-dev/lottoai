// lib/games.ts
import { getLocales } from 'expo-localization';

export type GameId = 'cilgin' | 'superloto' | 'sanstopu' | 'onnumara';

export type Game = {
  id: GameId;
  name: string;
  icon: string;
  count: number;
  max: number;
  bonus: { count: number; max: number } | null;
  superStar?: { max: number };
  drawDays: number[];
  drawHour: number;
  drawMinute: number;
  drawDaysLabel: string;
  drawDaysLong: string;
  notifyBeforeHour: number;
  notifyBeforeMinute: number;
  notifyAfterHour: number;
  notifyAfterMinute: number;
  url: string;
  colors: {
    main: string;
    bonus: string;
    gradient: [string, string];
    superstar?: string;
  };
  country: 'TR' | 'US';
  currency: 'TRY' | 'USD';
  locale: 'tr-TR' | 'en-US';
};

export const GAMES: Game[] = [
  {
    id: 'cilgin',
    name: 'Çılgın Sayısal Loto',
    icon: '🎱',
    count: 6,
    max: 90,
    bonus: null,
    superStar: { max: 90 },
    drawDays: [1, 3, 6],
    drawHour: 21,
    drawMinute: 30,
    drawDaysLabel: 'Pzt, Çar, Cmt',
    drawDaysLong: 'Pazartesi, Çarşamba, Cumartesi',
    notifyBeforeHour: 20,
    notifyBeforeMinute: 0,
    notifyAfterHour: 22,
    notifyAfterMinute: 0,
    url: 'https://www.millipiyangoonline.com/sayisal-loto/sonuclar',
    colors: {
      main: '#ea0028',
      bonus: '#159ad5',
      superstar: '#ffe103',
      gradient: ['#ea0028', '#b8001f'],
    },
    country: 'TR',
    currency: 'TRY',
    locale: 'tr-TR',
  },
  {
    id: 'superloto',
    name: 'Süper Loto',
    icon: '⚡',
    count: 6,
    max: 60,
    bonus: null,
    drawDays: [2, 4, 0],
    drawHour: 21,
    drawMinute: 30,
    drawDaysLabel: 'Sal, Per, Paz',
    drawDaysLong: 'Salı, Perşembe, Pazar',
    notifyBeforeHour: 20,
    notifyBeforeMinute: 0,
    notifyAfterHour: 22,
    notifyAfterMinute: 0,
    url: 'https://www.millipiyangoonline.com/super-loto/sonuclar',
    colors: {
      main: '#ff5100',
      bonus: '#ff5100',
      gradient: ['#ff5100', '#cc4100'],
    },
    country: 'TR',
    currency: 'TRY',
    locale: 'tr-TR',
  },
  {
    id: 'sanstopu',
    name: 'Şans Topu',
    icon: '🍀',
    count: 5,
    max: 34,
    bonus: { count: 1, max: 14 },
    drawDays: [3, 0],
    drawHour: 20,
    drawMinute: 0,
    drawDaysLabel: 'Çar, Paz',
    drawDaysLong: 'Çarşamba, Pazar',
    notifyBeforeHour: 18,
    notifyBeforeMinute: 30,
    notifyAfterHour: 20,
    notifyAfterMinute: 30,
    url: 'https://www.millipiyangoonline.com/sans-topu/sonuclar',
    colors: {
      main: '#e10098',
      bonus: '#159ad5',
      gradient: ['#e10098', '#b3007a'],
    },
    country: 'TR',
    currency: 'TRY',
    locale: 'tr-TR',
  },
  {
    id: 'onnumara',
    name: 'On Numara',
    icon: '🔟',
    count: 10,
    max: 80,
    bonus: null,
    drawDays: [1, 5],
    drawHour: 20,
    drawMinute: 0,
    drawDaysLabel: 'Pzt, Cum',
    drawDaysLong: 'Pazartesi, Cuma',
    notifyBeforeHour: 18,
    notifyBeforeMinute: 30,
    notifyAfterHour: 20,
    notifyAfterMinute: 30,
    url: 'https://www.millipiyangoonline.com/on-numara/sonuclar',
    colors: {
      main: '#a15db4',
      bonus: '#a15db4',
      gradient: ['#a15db4', '#7a4689'],
    },
    country: 'TR',
    currency: 'TRY',
    locale: 'tr-TR',
  },
];

export const GAME_ACCENT: Record<string, string> = Object.fromEntries(
  GAMES.map((g) => [g.id, g.colors.main]),
);

export function getGameAccentColor(id: string): string {
  return GAME_ACCENT[id] ?? '#1C9E73';
}

export function getGameById(id: GameId): Game {
  return GAMES.find((g) => g.id === id) ?? GAMES[0];
}

export function getGameByName(name: string): Game | undefined {
  return GAMES.find((g) => g.name === name);
}

export const GAME_COLORS = Object.fromEntries(
  GAMES.map((g) => [
    g.name,
    {
      main: g.colors.main,
      bonus: g.colors.bonus,
      gradient: g.colors.gradient,
      superstar: g.colors.superstar ?? g.colors.main,
    },
  ])
) as Record<string, { main: string; bonus: string; gradient: [string, string]; superstar: string }>;

export function getGameColor(gameName: string): string {
  return getGameByName(gameName)?.colors.main ?? '#1C9E73';
}

export function getGameGradient(gameName: string): [string, string] {
  return getGameByName(gameName)?.colors.gradient ?? ['#1C9E73', '#157E5C'];
}

export function getBonusColor(gameName: string): string {
  return getGameByName(gameName)?.colors.bonus ?? '#C29A2B';
}

// Ülkeye göre oyunları filtrele
export function getGamesByCountry(country: 'TR' | 'US'): Game[] {
  return GAMES.filter((g) => g.country === country);
}

// Cihazın yerel ayarlarından ülkeyi otomatik tespit et
export function getDefaultCountry(): 'TR' | 'US' {
  const locales = getLocales();
  const languageTag = locales[0]?.languageTag ?? 'en-US';
  if (languageTag.startsWith('tr') || languageTag.startsWith('TR')) return 'TR';
  return 'US';
}

// Ülkeye göre gün isimlerini çevir
const DAY_LABELS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAY_LABELS_US = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function getDayLabel(dayIndex: number, locale: 'tr-TR' | 'en-US'): string {
  if (locale === 'en-US') return DAY_LABELS_US[dayIndex];
  return DAY_LABELS_TR[dayIndex];
}