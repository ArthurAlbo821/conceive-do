/**
 * Appointment confirmation message builder
 * Builds confirmation messages to send to clients after appointment creation
 */

import type { UserInformation } from '../types.ts';

/**
 * Formats a date reference for display in messages
 * 
 * @param appointmentDate - Date in YYYY-MM-DD format
 * @returns Formatted day reference ("Aujourd'hui", "Demain", or formatted date)
 */
function formatDayReference(appointmentDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const apptDate = new Date(appointmentDate + 'T00:00:00');
  
  if (apptDate.getTime() === today.getTime()) {
    return "Aujourd'hui";
  } else if (apptDate.getTime() === tomorrow.getTime()) {
    return "Demain";
  } else {
    // Format as "le 15 janvier" for other dates
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `le ${apptDate.toLocaleDateString('fr-FR', options)}`;
  }
}

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
 * @throws {Error} If duration or any extra is not found in price mappings
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
  
  // Determine day text based on appointmentDate
  const dayText = formatDayReference(appointmentDate);
  
  // Format time (remove leading zero if present)
  const formattedTime = startTime.replace(/^0/, '');
  
  // Validate duration price exists - FAIL-FAST to prevent incorrect pricing in confirmation
  if (!(duration in durationToPriceMap)) {
    const availableKeys = Object.keys(durationToPriceMap).join(', ');
    console.error('[confirmation] ❌ Missing price mapping for duration:', {
      duration,
      availableKeys,
      appointmentDate,
      startTime,
      durationToPriceMap
    });
    throw new Error(
      `Cannot build confirmation: missing price for duration "${duration}". Available: ${availableKeys}`
    );
  }
  
  // Base price from duration
  const durationPrice = durationToPriceMap[duration];
  
  // Build price breakdown
  let priceBreakdown = `${duration} (CHF ${durationPrice})`;
  
  // Add extras to breakdown with validation
  const actualExtras = selectedExtras.filter(e => e !== 'aucun');
  if (actualExtras.length > 0) {
    const extrasText = actualExtras
      .map(extra => {
        // Validate extra price exists - FAIL-FAST to prevent incorrect pricing
        if (!(extra in extraToPriceMap)) {
          const availableKeys = Object.keys(extraToPriceMap).join(', ');
          console.error('[confirmation] ❌ Missing price mapping for extra:', {
            extra,
            availableKeys,
            appointmentDate,
            startTime,
            extraToPriceMap
          });
          throw new Error(
            `Cannot build confirmation: missing price for extra "${extra}". Available: ${availableKeys}`
          );
        }
        return `${extra} (+CHF ${extraToPriceMap[extra]})`;
      })
      .join(' + ');
    priceBreakdown += ` + ${extrasText}`;
  }
  
  // Build full message
  const message = `C'est confirmé ! ${dayText} ${formattedTime}, ${priceBreakdown} = CHF ${totalPrice}.

Mon adresse: ${userInfo.adresse}`;
  
  return message;
}

/**
 * Builds a simple confirmation message (alternative format)
 * 
 * @param appointmentDate - Date in YYYY-MM-DD format
 * @param startTime - Start time
 * @param duration - Duration
 * @param totalPrice - Total price
 * @param address - Address
 * @returns Simple confirmation message
 */
export function buildSimpleConfirmation(
  appointmentDate: string,
  startTime: string,
  duration: string,
  totalPrice: number,
  address: string
): string {
  const dayText = formatDayReference(appointmentDate);
  const formattedTime = startTime.replace(/^0/, '');
  
  return `C'est confirmé ! ${dayText} ${formattedTime}, ${duration}, CHF ${totalPrice}.

Mon adresse: ${address}`;
}
