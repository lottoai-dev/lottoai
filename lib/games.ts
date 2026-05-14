// lib/games.ts
export type GameId = 'cilgin' | 'superloto' | 'sanstopu' | 'onnumara';

export type Game = {
  id: GameId;
  name: string;
  icon: string;
  count: number;
  max: number;
  bonus: { count: number; max: number } | null;
  superStar?: { max: number }; // YENİ: opsiyonel, sadece Çılgın Sayısal Loto'da var
  drawDays: number[];    // 0=Pazar, 1=Pazartesi, ...
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
  };
};

export const GAMES: Game[] = [
  {
    id: 'cilgin',
    name: 'Çılgın Sayısal Loto',
    icon: '🎱',
    count: 6,
    max: 90,
    bonus: null,
    superStar: { max: 90 }, // YENİ
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
      main: '#E53935',
      bonus: '#1E88E5',
      gradient: ['#E53935', '#B71C1C'],
    },
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
      main: '#FF6D00',
      bonus: '#FF6D00',
      gradient: ['#FF6D00', '#E65100'],
    },
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
      main: '#E91E8C',
      bonus: '#00BCD4',
      gradient: ['#E91E8C', '#880E4F'],
    },
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
      main: '#7B1FA2',
      bonus: '#7B1FA2',
      gradient: ['#7B1FA2', '#4A148C'],
    },
  },
];

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
      superstar: g.colors.main, // SüperStar için ana rengi kullan
    },
  ])
) as Record<string, { main: string; bonus: string; gradient: [string, string]; superstar: string }>;

export function getGameColor(gameName: string): string {
  return getGameByName(gameName)?.colors.main ?? '#6C63FF';
}

export function getGameGradient(gameName: string): [string, string] {
  return getGameByName(gameName)?.colors.gradient ?? ['#6C63FF', '#4834d4'];
}

export function getBonusColor(gameName: string): string {
  return getGameByName(gameName)?.colors.bonus ?? '#FF6B6B';
}