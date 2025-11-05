/**
 * Timezone utilities for France (Europe/Paris)
 * All times in the system are stored and displayed in France timezone
 */

import { USER_TIMEZONE } from '../config.ts';

/**
 * Identity function that returns the UTC Date as-is.
 * 
 * IMPORTANT: This function no longer creates a "naive" Date.
 * Instead, it returns the UTC Date unchanged. Use the timezone-aware
 * helper functions (getFranceDay, getFranceHours, etc.) to extract
 * components in France timezone.
 * 
 * @param utcDate - A Date object in UTC
 * @returns The same Date object (UTC)
 * 
 * @example
 * const utcNow = new Date(); // 2025-01-15T10:00:00Z (UTC)
 * const franceNow = toFranceTime(utcNow); // Same Date, use helpers to get France components
 */
export function toFranceTime(utcDate: Date): Date {
  // Return UTC Date as-is. Components should be extracted using timezone-aware helpers.
  return utcDate;
}

/**
 * Gets the current time
 * 
 * @returns Current Date (UTC)
 * 
 * @example
 * const now = getCurrentFranceTime();
 */
export function getCurrentFranceTime(): Date {
  return new Date();
}

/**
 * Helper function to extract France timezone components from a Date
 * Uses Intl API to correctly interpret the Date in Europe/Paris timezone
 * 
 * @param date - Date to extract components from (UTC Date)
 * @returns Object with year, month, day, hour, minute, second in France timezone
 */
function getFranceComponents(date: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  // Use Intl API to get France time string
  const franceTimeString = date.toLocaleString('en-US', {
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

  return { year, month, day, hour, minute, second };
}

/**
 * Gets the day of week for a Date in France timezone
 * 
 * @param date - UTC Date
 * @returns Day of week (0 = Sunday, 6 = Saturday) in France timezone
 * 
 * @example
 * const day = getFranceDay(new Date());
 */
export function getFranceDay(date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: USER_TIMEZONE,
    weekday: 'short'
  });
  const dayStr = formatter.format(date);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(dayStr);
}

/**
 * Gets the hours for a Date in France timezone
 * 
 * @param date - UTC Date
 * @returns Hours (0-23) in France timezone
 * 
 * @example
 * const hours = getFranceHours(new Date());
 */
export function getFranceHours(date: Date): number {
  const { hour } = getFranceComponents(date);
  return parseInt(hour, 10);
}

/**
 * Gets the minutes for a Date in France timezone
 * 
 * @param date - UTC Date
 * @returns Minutes (0-59) in France timezone
 * 
 * @example
 * const minutes = getFranceMinutes(new Date());
 */
export function getFranceMinutes(date: Date): number {
  const { minute } = getFranceComponents(date);
  return parseInt(minute, 10);
}

/**
 * Gets the date (day of month) for a Date in France timezone
 * 
 * @param date - UTC Date
 * @returns Date (1-31) in France timezone
 * 
 * @example
 * const dayOfMonth = getFranceDate(new Date());
 */
export function getFranceDate(date: Date): number {
  const { day } = getFranceComponents(date);
  return parseInt(day, 10);
}

/**
 * Gets the month for a Date in France timezone
 * 
 * @param date - UTC Date
 * @returns Month (1-12, NOT 0-11) in France timezone
 * 
 * @example
 * const month = getFranceMonth(new Date());
 */
export function getFranceMonth(date: Date): number {
  const { month } = getFranceComponents(date);
  return parseInt(month, 10);
}

/**
 * Gets the year for a Date in France timezone
 * 
 * @param date - UTC Date
 * @returns Full year in France timezone
 * 
 * @example
 * const year = getFranceYear(new Date());
 */
export function getFranceYear(date: Date): number {
  const { year } = getFranceComponents(date);
  return parseInt(year, 10);
}

/**
 * Formats a Date as France timezone ISO date string (YYYY-MM-DD)
 * 
 * @param date - Date to format (UTC Date)
 * @returns ISO date string (YYYY-MM-DD) in France timezone
 * 
 * @example
 * const isoDate = toFranceISODate(new Date()); // "2025-01-15"
 */
export function toFranceISODate(date: Date): string {
  const { year, month, day } = getFranceComponents(date);
  return `${year}-${month}-${day}`;
}

/**
 * Formats a Date as France timezone time string (HH:MM)
 * 
 * @param date - Date to format (UTC Date)
 * @returns Time string (HH:MM) in France timezone
 * 
 * @example
 * const time = toFranceTimeString(new Date()); // "14:30"
 */
export function toFranceTimeString(date: Date): string {
  const { hour, minute } = getFranceComponents(date);
  return `${hour}:${minute}`;
}
