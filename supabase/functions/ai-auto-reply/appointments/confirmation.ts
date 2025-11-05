/**
 * Appointment confirmation message builder
 * Builds confirmation messages to send to clients after appointment creation
 */

import type { UserInformation } from '../types.ts';

/**
 * Builds confirmation message for client
 * 
 * The message includes:
 * - Appointment confirmed with emoji
 * - Time and duration
 * - Total price breakdown (duration + extras)
 * - Address
 * 
 * Format is friendly and concise, matching the escort's tone
 * 
 * @param appointmentDate - Date in YYYY-MM-DD format
 * @param startTime - Start time in HH:MM format
 * @param duration - Duration string (e.g., "1h")
 * @param selectedExtras - Array of selected extras
 * @param totalPrice - Total price in CHF
 * @param userInfo - User information (for address)
 * @param priceMappings - Price mappings to show breakdown
 * @returns Confirmation message string
 * 
 * @example
 * const message = buildConfirmationMessage(
 *   "2025-01-15",
 *   "14:30",
 *   "1h",
 *   ["Anal"],
 *   200,
 *   userInfo,
 *   priceMappings
 * );
 * // "C'est confirmé ! Aujourd'hui 14h30, 1h (CHF 150) + Anal (+CHF 50) = CHF 200.
 * //  Mon adresse: Rue de Genève 42, 1003 Lausanne"
 */
export function buildConfirmationMessage(
  appointmentDate: string,
  startTime: string,
  duration: string,
  selectedExtras: string[],
  totalPrice: number,
  userInfo: UserInformation,
  priceMappings: { durationToPriceMap: Record<string, number>; extraToPriceMap: Record<string, number> }
): string {
  const { durationToPriceMap, extraToPriceMap } = priceMappings;
  
  // Format time (remove leading zero if present)
  const formattedTime = startTime.replace(/^0/, '');
  
  // Base price from duration
  const durationPrice = durationToPriceMap[duration] || 0;
  
  // Build price breakdown
  let priceBreakdown = `${duration} (CHF ${durationPrice})`;
  
  // Add extras to breakdown
  const actualExtras = selectedExtras.filter(e => e !== 'aucun');
  if (actualExtras.length > 0) {
    const extrasText = actualExtras
      .map(extra => `${extra} (+CHF ${extraToPriceMap[extra] || 0})`)
      .join(' + ');
    priceBreakdown += ` + ${extrasText}`;
  }
  
  // Build full message
  const message = `C'est confirmé ! Aujourd'hui ${formattedTime}, ${priceBreakdown} = CHF ${totalPrice}.

Mon adresse: ${userInfo.adresse}`;
  
  return message;
}

/**
 * Builds a simple confirmation message (alternative format)
 * 
 * @param startTime - Start time
 * @param duration - Duration
 * @param totalPrice - Total price
 * @param address - Address
 * @returns Simple confirmation message
 */
export function buildSimpleConfirmation(
  startTime: string,
  duration: string,
  totalPrice: number,
  address: string
): string {
  const formattedTime = startTime.replace(/^0/, '');
  
  return `C'est confirmé ! Aujourd'hui ${formattedTime}, ${duration}, CHF ${totalPrice}.

Mon adresse: ${address}`;
}
