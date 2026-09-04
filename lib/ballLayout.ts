import { spacing } from '../constants/theme';

/** Top boyutu Sayısal Loto (6 sayı) ile aynı: ekrana göre 30–42px. */
export function mainBallLayout(
  count: number,
  screenWidth: number,
): { size: number; gap: number; nowrap: boolean } {
  const available = screenWidth - spacing.xl * 2 - (spacing.xl + 4) - spacing.xl;
  const sayisalGap = 6;
  const sayisalCount = 6;
  const size = Math.max(
    30,
    Math.min(42, Math.floor((available - sayisalGap * (sayisalCount - 1)) / sayisalCount)),
  );

  if (count < 6) return { size, gap: 10, nowrap: true };
  if (count > 6) return { size, gap: 6, nowrap: false };
  return { size, gap: 6, nowrap: true };
}
