const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "1,234 VC". Coins are integers; VC is the virtual unit players earn. */
export function formatCoins(amount: number): string {
  return `${integer.format(amount)} VC`;
}

/** "+10 VC" / "-5 VC" for ledger rows. */
export function formatSignedCoins(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${integer.format(Math.abs(amount))} VC`;
}

export function formatCount(value: number): string {
  return integer.format(value);
}
