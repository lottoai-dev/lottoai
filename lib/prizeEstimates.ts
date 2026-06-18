// lib/prizeEstimates.ts

export type PrizeEstimate = {
  label: string;
  amount: number;
  note?: string;
};

export const CILGIN_SAYISAL_PRIZES: Record<number, PrizeEstimate> = {
  6: { label: '6 Bilen', amount: 100_000_000, note: 'Büyük ikramiye' },
  5: { label: '5 Bilen', amount: 500_000, note: '' },
  4: { label: '4 Bilen', amount: 750, note: '' },
  3: { label: '3 Bilen', amount: 75, note: '' },
  2: { label: '2 Bilen', amount: 15, note: '' },
};

export const SUPER_LOTO_PRIZES: Record<number, PrizeEstimate> = {
  6: { label: '6 Bilen', amount: 50_000_000, note: 'Büyük ikramiye' },
  5: { label: '5 Bilen', amount: 250_000, note: '' },
  4: { label: '4 Bilen', amount: 500, note: '' },
  3: { label: '3 Bilen', amount: 50, note: '' },
  2: { label: '2 Bilen', amount: 12, note: '' },
};

export const SANS_TOPU_PRIZES: Record<number, PrizeEstimate> = {
  6: { label: '5+1 Bilen', amount: 5_000_000, note: 'Büyük ikramiye' },
  5: { label: '5 Bilen', amount: 45_000, note: '' },
  4: { label: '4 Bilen', amount: 300, note: '' },
  3: { label: '3 Bilen', amount: 60, note: '' },
  2: { label: '2 Bilen', amount: 12, note: '' },
};

export const ON_NUMARA_PRIZES: Record<number, PrizeEstimate> = {
  10: { label: '10 Bilen', amount: 1_500_000, note: 'Büyük ikramiye' },
  9: { label: '9 Bilen', amount: 20_000, note: '' },
  8: { label: '8 Bilen', amount: 1_200, note: '' },
  7: { label: '7 Bilen', amount: 200, note: '' },
  6: { label: '6 Bilen', amount: 40, note: '' },
};

export function getPrizeTable(gameName: string): Record<number, PrizeEstimate> | null {
  switch (gameName) {
    case 'Çılgın Sayısal Loto': return CILGIN_SAYISAL_PRIZES;
    case 'Süper Loto': return SUPER_LOTO_PRIZES;
    case 'Şans Topu': return SANS_TOPU_PRIZES;
    case 'On Numara': return ON_NUMARA_PRIZES;
    default: return null;
  }
}

export function formatPrize(amount: number, currency = 'TRY'): string {
  if (currency === 'USD') {
    if (amount >= 1e9) return `$${parseFloat((amount / 1e9).toFixed(2))} Milyar`;
    if (amount >= 1e6) return `$${parseFloat((amount / 1e6).toFixed(2))} Milyon`;
    if (amount >= 1e3) return `$${parseFloat((amount / 1e3).toFixed(2))} Bin`;
    return `$${amount}`;
  }
  if (amount >= 1e9) return `${parseFloat((amount / 1e9).toFixed(2))} Milyar TL`;
  if (amount >= 1e6) return `${parseFloat((amount / 1e6).toFixed(2))} Milyon TL`;
  if (amount >= 1e3) return `${parseFloat((amount / 1e3).toFixed(2))} Bin TL`;
  return `${amount} TL`;
}