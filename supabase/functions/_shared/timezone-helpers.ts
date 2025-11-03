/**
 * Timezone utility functions for handling France timezone (Europe/Paris)
 *
 * France uses:
 * - CET (Central European Time) = UTC+1 in winter
 * - CEST (Central European Summer Time) = UTC+2 in summer
 */

import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

const FRANCE_TIMEZONE = 'Europe/Paris';

/**
 * Converts a date to France timezone
 * @param date - The date to convert (can be UTC or any timezone)
 * @returns Date object representing the same moment in France timezone
 */
export function toFranceTime(date: Date): Date {
  return utcToZonedTime(date, FRANCE_TIMEZONE);
}

/**
 * Parses a date string as France timezone and converts to UTC
 * @param dateString - Date string in format "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"
 * @returns Date object in UTC
 */
export function parseFranceTimeToUtc(dateString: string): Date {
  return zonedTimeToUtc(dateString, FRANCE_TIMEZONE);
}

/**
 * Combines date and time strings (in France timezone) into a UTC Date object
 * @param dateStr - Date in format "YYYY-MM-DD"
 * @param timeStr - Time in format "HH:mm" or "HH:mm:ss"
 * @returns Date object in UTC
 */
export function combineFranceDateTime(dateStr: string, timeStr: string): Date {
  const dateTimeStr = `${dateStr}T${timeStr}`;
  return parseFranceTimeToUtc(dateTimeStr);
}

/**
 * Gets current date in France timezone as "YYYY-MM-DD" string
 * @returns Date string in France timezone
 */
export function getCurrentFranceDate(): string {
  const now = new Date();
  const franceMoment = toFranceTime(now);
  return format(franceMoment, 'yyyy-MM-dd', { timeZone: FRANCE_TIMEZONE });
}

/**
 * Gets current time in France timezone as "HH:mm" string
 * @returns Time string in France timezone
 */
export function getCurrentFranceTime(): string {
  const now = new Date();
  const franceMoment = toFranceTime(now);
  return format(franceMoment, 'HH:mm', { timeZone: FRANCE_TIMEZONE });
}

/**
 * Formats a Date object as France timezone date string
 * @param date - The date to format
 * @param formatStr - Format string (default: "yyyy-MM-dd")
 * @returns Formatted date string
 */
export function formatInFranceTime(date: Date, formatStr: string = 'yyyy-MM-dd'): string {
  return format(date, formatStr, { timeZone: FRANCE_TIMEZONE });
}

/**
 * Legacy compatibility: toFranceTime function that was previously defined inline
 * This maintains the same behavior as the original implementation
 */
export function toFranceTimeLegacy(date: Date): Date {
  // Get UTC components
  const utcTime = date.getTime();
  const utcOffset = date.getTimezoneOffset() * 60000;

  // Convert to France timezone offset
  // Note: This is a simplified version. Use toFranceTime() for accurate handling
  const franceDate = new Date(utcTime);
  const franceStr = franceDate.toLocaleString('en-US', { timeZone: FRANCE_TIMEZONE });
  return new Date(franceStr);
}
