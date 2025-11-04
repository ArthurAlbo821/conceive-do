/**
 * Currency configuration for the application
 * All prices are displayed in Swiss Francs (CHF)
 */

export const CURRENCY = {
  code: 'CHF',
  symbol: 'CHF',
  position: 'before', // 'before' for "CHF 100" or 'after' for "100 CHF"
} as const;

/**
 * Formats a price with the configured currency
 * @param price - The numeric price value
 * @returns Formatted price string (e.g., "CHF 100" or "100 CHF")
 */
export function formatPrice(price: number): string {
  if (CURRENCY.position === 'before') {
    return `${CURRENCY.symbol} ${price}`;
  }
  return `${price} ${CURRENCY.symbol}`;
}
