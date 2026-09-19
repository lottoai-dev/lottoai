// lib/prizeEstimates.ts

/** Ondalık virgül (tr): 684.35 → 684,35 */
function trDecimal(n: number): string {
  return String(parseFloat(n.toFixed(2))).replace('.', ',');
}

export function formatPrize(amount: number, currency = 'TRY'): string {
  if (currency === 'USD') {
    if (amount >= 1e9) return `$${trDecimal(amount / 1e9)} milyar`;
    if (amount >= 1e6) return `$${trDecimal(amount / 1e6)} milyon`;
    if (amount >= 1e3) return `$${trDecimal(amount / 1e3)} bin`;
    return `$${amount}`;
  }
  if (amount >= 1e9) return `${trDecimal(amount / 1e9)} milyar TL`;
  if (amount >= 1e6) return `${trDecimal(amount / 1e6)} milyon TL`;
  if (amount >= 1e3) return `${trDecimal(amount / 1e3)} bin TL`;
  return `${amount} TL`;
}
