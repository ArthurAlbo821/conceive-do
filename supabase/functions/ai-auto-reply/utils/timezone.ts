/**
 * Timezone utilities for France (Europe/Paris)
 * All times in the system are stored and displayed in France timezone
 */

import { USER_TIMEZONE } from '../config.ts';

/**
 * Converts a UTC Date to France timezone (Europe/Paris)
 * 
 * IMPORTANT: This function returns a Date object that REPRESENTS France time,
 * but the Date object itself doesn't have timezone info (it's "naive").
 * The returned Date should be interpreted as France local time.
 * 
 * @param utcDate - A Date object in UTC
 * @returns A Date object representing the same instant in France timezone
 * 
 * @example
 * const utcNow = new Date(); // 2025-01-15T10:00:00Z (UTC)
 * const franceNow = toFranceTime(utcNow); // 2025-01-15T11:00:00 (France = UTC+1)
 */
export function toFranceTime(utcDate: Date): Date {
  // Use Intl API to get France time string
  const franceTimeString = utcDate.toLocaleString('en-US', {
    timeZone: USER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Parse: "MM/DD/YYYY, HH:MM:SS" format from en-US locale
  const [datePart, timePart] = franceTimeString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');

  // Create date object representing France time (without timezone info)
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

/**
 * Gets the current time in France timezone
 * 
 * @returns Current Date in France timezone
 * 
 * @example
 * const now = getCurrentFranceTime();
 */
export function getCurrentFranceTime(): Date {
  return toFranceTime(new Date());
}

/**
 * Formats a Date as France timezone ISO date string (YYYY-MM-DD)
 * 
 * @param date - Date to format
 * @returns ISO date string (YYYY-MM-DD)
 * 
 * @example
 * const date = toFranceTime(new Date());
 * const isoDate = toFranceISODate(date); // "2025-01-15"
 */
export function toFranceISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Formats a Date as France timezone time string (HH:MM)
 * 
 * @param date - Date to format
 * @returns Time string (HH:MM)
 * 
 * @example
 * const date = toFranceTime(new Date());
 * const time = toFranceTimeString(date); // "14:30"
 */
export function toFranceTimeString(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
