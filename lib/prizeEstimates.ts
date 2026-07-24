// lib/prizeEstimates.ts

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
