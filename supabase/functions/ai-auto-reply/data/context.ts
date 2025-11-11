/**
 * Context building utilities
 * Formats user data and current datetime for AI prompts
 */

import { DAYS_FR, USER_TIMEZONE } from '../config.ts';
import { getFranceDay, getFranceDate, getFranceMonth, getFranceYear, getFranceHours, getFranceMinutes } from '../utils/timezone.ts';
import type { UserInformation, UserContext, CurrentDateTime } from '../types.ts';

/**
 * Builds user context from user information
 * Formats prestations, extras, taboos, tarifs, and address for AI prompts
 * 
 * This function handles cases where data might be missing or malformed:
 * - Empty arrays → "Non spécifié" or "Aucun"
 * - Objects instead of arrays → extracts name/price fields
 * 
 * @param userInfo - User information object from database
 * @returns Formatted user context for AI prompt
 * 
 * @example
 * const context = buildUserContext(userInfo);
 * // {
 * //   prestations: "GFE, Massage, PSE",
 * //   extras: "Anal (CHF 50), Duo (CHF 100)",
 * //   taboos: "Greek, Scatologie",
 * //   tarifs: "30min - CHF 100, 1h - CHF 150, 2h - CHF 250",
 * //   adresse: "Rue de Genève 42, 1003 Lausanne"
 * // }
 */
export function buildUserContext(userInfo: UserInformation): UserContext {
  const prestations = Array.isArray(userInfo.prestations)
    ? userInfo.prestations.map((p) => (typeof p === 'object' ? (p.name || 'Sans nom') : p)).join(', ')
    : 'Non spécifié';

  // Format extras (array of objects with name and price)
  const extras = Array.isArray(userInfo.extras) && userInfo.extras.length > 0
    ? userInfo.extras.map((e) => `${e.name || 'Sans nom'} (CHF ${e.price || 'prix non spécifié'})`).join(', ')
    : 'Aucun';

  // Format taboos (array of objects or strings)
  const taboos = Array.isArray(userInfo.taboos) && userInfo.taboos.length > 0
    ? userInfo.taboos.map((t) => (typeof t === 'object' ? (t.name || 'Sans nom') : t)).join(', ')
    : 'Aucun';

  // Format tarifs (array of objects with duration and price)
  const tarifs = Array.isArray(userInfo.tarifs)
    ? userInfo.tarifs.map((t) => `${t.duration || '?'} - CHF ${t.price || '?'}`).join(', ')
    : 'Non spécifié';

  // Address (simple string)
  const adresse = userInfo.adresse || 'Non spécifiée';

  return {
    prestations,
    extras,
    taboos,
    tarifs,
    adresse
  };
}

/**
 * Builds current date and time context for AI prompts
 * Decomposes a Date into all useful parts for the AI
 * 
 * @param now - Current date (UTC Date)
 * @returns Current datetime context with all components in France timezone
 * 
 * @example
 * const now = new Date();
 * const context = buildCurrentDateTime(now);
 * // {
 * //   fullDate: "jeudi 14 novembre 2024",
 * //   time: "14:30",
 * //   dayOfWeek: "Jeudi",
 * //   date: 14,
 * //   month: 11,
 * //   year: 2024,
 * //   hour: 14,
 * //   minute: 30
 * // }
 */
export function buildCurrentDateTime(now: Date): CurrentDateTime {
  // Use Intl API with France timezone for all formatting
  return {
    fullDate: now.toLocaleDateString('fr-FR', {
      timeZone: USER_TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    time: now.toLocaleTimeString('fr-FR', {
      timeZone: USER_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit'
    }),
    dayOfWeek: DAYS_FR[getFranceDay(now)],
    date: getFranceDate(now),
    month: getFranceMonth(now),
    year: getFranceYear(now),
    hour: getFranceHours(now),
    minute: getFranceMinutes(now)
  };
}

/**
 * Formats a day of week number to French day name
 * 
 * @param dayNumber - Day of week (0 = Sunday, 6 = Saturday)
 * @returns French day name
 * 
 * @example
 * formatDayName(0); // "Dimanche"
 * formatDayName(1); // "Lundi"
 */
export function formatDayName(dayNumber: number): string {
  return DAYS_FR[dayNumber];
}

/**
 * Formats availabilities for AI prompt
 * Converts array of availability objects to human-readable text
 * 
 * @param availabilities - Array of availability objects
 * @returns Formatted string for AI prompt
 * 
 * @example
 * const text = formatAvailabilitiesForPrompt(availabilities);
 * // "- Lundi : 09:00 - 17:00\n- Mardi : 09:00 - 17:00\n..."
 */
export function formatAvailabilitiesForPrompt(
  availabilities: Array<{ day_of_week: number; start_time: string; end_time: string }>
): string {
  return availabilities
    .map((a) => `- ${DAYS_FR[a.day_of_week] || 'Jour invalide'} : ${a.start_time} - ${a.end_time}`)
    .join('\n');
}

/**
 * Calculates minutes from midnight for a given time
 * Helper function for availability calculations
 * 
 * @param time - Time string in HH:MM format
 * @returns Minutes from midnight (0-1439)
 * 
 * @example
 * getMinutesFromMidnight("14:30"); // 870 (14*60 + 30)
 * getMinutesFromMidnight("00:00"); // 0
 */
export function getMinutesFromMidnight(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Formats minutes from midnight to time string
 * Helper function for availability calculations
 * 
 * @param minutes - Minutes from midnight (can exceed 1440 for next day)
 * @returns Time string in HH:MM format
 * 
 * @example
 * formatTimeFromMinutes(870);  // "14:30"
 * formatTimeFromMinutes(1500); // "01:00" (next day)
 */
export function formatTimeFromMinutes(minutes: number): string {
  const actualMinutes = minutes % (24 * 60);
  const hours = Math.floor(actualMinutes / 60);
  const mins = actualMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Checks if a time range crosses midnight
 * 
 * @param startTime - Start time in HH:MM format
 * @param endTime - End time in HH:MM format
 * @returns true if range crosses midnight (e.g., 22:00 - 02:00)
 * 
 * @example
 * crossesMidnight("22:00", "02:00"); // true
 * crossesMidnight("09:00", "17:00"); // false
 */
export function crossesMidnight(startTime: string, endTime: string): boolean {
  const startMinutes = getMinutesFromMidnight(startTime);
  const endMinutes = getMinutesFromMidnight(endTime);
  return endMinutes < startMinutes;
}
