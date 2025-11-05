/**
 * Appointment time validation utilities
 * Server-side validation to prevent invalid appointment times
 */

import { APPOINTMENT_CONFIG } from '../config.ts';
import { toFranceTime, toFranceISODate } from '../utils/timezone.ts';
import { isTimeInAvailableRanges } from './calculator.ts';
import type { Availability, Appointment } from '../types.ts';

/**
 * Validates that an appointment time meets minimum lead time requirement
 * 
 * CRITICAL: Server-side validation to prevent appointments too close to current time
 * Client may manipulate data, so we always validate on the server
 * 
 * @param appointmentDateTime - Appointment date/time string in format "YYYY-MM-DDTHH:MM:SS"
 * @param currentDate - Current date in France timezone
 * @returns Object with isValid and minutesUntil
 * 
 * @example
 * const validation = validateMinimumLeadTime("2025-01-15T14:00:00", now);
 * if (!validation.isValid) {
 *   console.log('Too close! Only', validation.minutesUntil, 'minutes');
 * }
 */
export function validateMinimumLeadTime(
  appointmentDateTime: string,
  currentDate: Date
): {
  isValid: boolean;
  minutesUntil: number;
} {
  // Parse appointment time (already in France timezone format)
  let appointmentDate = new Date(appointmentDateTime);
  const now = currentDate;

  // Handle midnight-crossing appointments: if appointment time is in the past, it must be for tomorrow
  if (appointmentDate < now) {
    // Appointment time has already passed today, so it must be for tomorrow
    appointmentDate = new Date(appointmentDate.getTime() + 24 * 60 * 60 * 1000);
    console.log('[validator] Midnight-crossing appointment detected, adjusted to next day');
  }

  const minutesUntil = (appointmentDate.getTime() - now.getTime()) / (1000 * 60);

  return {
    isValid: minutesUntil >= APPOINTMENT_CONFIG.MIN_BOOKING_LEAD_TIME_MINUTES,
    minutesUntil
  };
}

/**
 * Validates that an appointment time falls within available ranges
 * 
 * This checks:
 * - Time is within user's availability windows
 * - Time is not occupied by existing appointment
 * - Time meets minimum lead time requirement
 * - Time is for today (not tomorrow or future dates)
 * 
 * @param appointmentTime - Time in HH:MM format
 * @param appointmentDate - Date in YYYY-MM-DD format
 * @param availableRanges - Available ranges string from computeAvailableRanges()
 * @param availabilities - User's availability schedule
 * @param appointments - Existing appointments
 * @param currentDate - Current date in France timezone
 * @returns Object with isValid, reason, and suggestion
 * 
 * @example
 * const validation = validateAppointmentTime(
 *   "14:30", 
 *   "2025-01-15",
 *   availableRanges,
 *   availabilities,
 *   appointments,
 *   now
 * );
 * if (!validation.isValid) {
 *   console.log('Invalid:', validation.reason);
 * }
 */
export function validateAppointmentTime(
  appointmentTime: string,
  appointmentDate: string,
  availableRanges: string,
  availabilities: Availability[],
  appointments: Appointment[],
  currentDate: Date
): {
  isValid: boolean;
  reason?: string;
  suggestion?: string;
} {
  const today = toFranceISODate(currentDate);

  // Check if appointment is for today
  if (appointmentDate !== today) {
    return {
      isValid: false,
      reason: 'appointment_not_today',
      suggestion: 'Désolée, que jour même.'
    };
  }

  // Build full datetime string for lead time validation
  const appointmentDateTime = `${appointmentDate}T${appointmentTime}:00`;
  const leadTimeValidation = validateMinimumLeadTime(appointmentDateTime, currentDate);

  if (!leadTimeValidation.isValid) {
    return {
      isValid: false,
      reason: 'too_close_to_current_time',
      suggestion: "Désolée bébé, j'ai besoin d'au moins 30min pour me préparer 😘"
    };
  }

  // Check if time falls within available ranges
  const isInRange = isTimeInAvailableRanges(
    appointmentTime,
    availableRanges,
    availabilities,
    appointments,
    currentDate
  );

  if (!isInRange) {
    return {
      isValid: false,
      reason: 'time_not_in_available_ranges',
      suggestion: `Désolée bébé, je suis dispo ${availableRanges}. Tu peux à quelle heure ?`
    };
  }

  return { isValid: true };
}

/**
 * Validates appointment time with detailed error messages
 * More comprehensive than validateAppointmentTime, includes all edge cases
 * 
 * @param appointmentTime - Time in HH:MM format
 * @param appointmentDate - Date in YYYY-MM-DD format
 * @param availableRanges - Available ranges string
 * @param availabilities - User's availability schedule
 * @param appointments - Existing appointments
 * @param currentDate - Current date in France timezone
 * @returns Validation result with detailed error info
 */
export function validateAppointmentTimeDetailed(
  appointmentTime: string,
  appointmentDate: string,
  availableRanges: string,
  availabilities: Availability[],
  appointments: Appointment[],
  currentDate: Date
): {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
  userMessage?: string;
  minutesUntil?: number;
} {
  const today = toFranceISODate(currentDate);

  // Validation 1: Check if date is today
  if (appointmentDate !== today) {
    return {
      isValid: false,
      errorCode: 'NOT_TODAY',
      errorMessage: `Appointment date ${appointmentDate} is not today ${today}`,
      userMessage: 'Désolée, que jour même.'
    };
  }

  // Validation 2: Check minimum lead time
  const appointmentDateTime = `${appointmentDate}T${appointmentTime}:00`;
  const leadTimeValidation = validateMinimumLeadTime(appointmentDateTime, currentDate);

  if (!leadTimeValidation.isValid) {
    return {
      isValid: false,
      errorCode: 'TOO_CLOSE',
      errorMessage: `Appointment is only ${leadTimeValidation.minutesUntil.toFixed(0)} minutes away, minimum is ${APPOINTMENT_CONFIG.MIN_BOOKING_LEAD_TIME_MINUTES}`,
      userMessage: "Désolée bébé, j'ai besoin d'au moins 30min pour me préparer 😘",
      minutesUntil: leadTimeValidation.minutesUntil
    };
  }

  // Validation 3: Check if time is in available ranges
  const isInRange = isTimeInAvailableRanges(
    appointmentTime,
    availableRanges,
    availabilities,
    appointments,
    currentDate
  );

  if (!isInRange) {
    return {
      isValid: false,
      errorCode: 'NOT_AVAILABLE',
      errorMessage: `Time ${appointmentTime} is not within available ranges: ${availableRanges}`,
      userMessage: `Désolée bébé, je suis dispo ${availableRanges}. Tu peux à quelle heure ?`
    };
  }

  return { isValid: true };
}

/**
 * Quick check if a time string is valid format (HH:MM)
 * 
 * @param time - Time string to validate
 * @returns true if format is valid, false otherwise
 */
export function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Quick check if a date string is valid format (YYYY-MM-DD)
 * 
 * @param date - Date string to validate
 * @returns true if format is valid, false otherwise
 */
export function isValidDateFormat(date: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return dateRegex.test(date);
}

/**
 * Checks if an appointment would conflict with existing appointments
 * 
 * @param startTime - Proposed start time (HH:MM)
 * @param durationMinutes - Duration in minutes
 * @param appointmentDate - Date (YYYY-MM-DD)
 * @param appointments - Existing appointments
 * @returns true if there's a conflict, false otherwise
 */
export function hasAppointmentConflict(
  startTime: string,
  durationMinutes: number,
  appointmentDate: string,
  appointments: Appointment[]
): boolean {
  const [startH, startM] = startTime.split(':').map(Number);
  const startMinute = startH * 60 + startM;
  const endMinute = startMinute + durationMinutes;

  // Get appointments for the same date
  const sameDay = appointments.filter(apt => apt.appointment_date === appointmentDate);

  for (const apt of sameDay) {
    const [aptStartH, aptStartM] = apt.start_time.split(':').map(Number);
    const [aptEndH, aptEndM] = apt.end_time.split(':').map(Number);
    
    const aptStartMinute = aptStartH * 60 + aptStartM;
    const aptEndMinute = aptEndH * 60 + aptEndM;

    // Check for overlap: proposed [start, end) overlaps with existing [aptStart, aptEnd)
    if (startMinute < aptEndMinute && endMinute > aptStartMinute) {
      return true; // Conflict detected
    }
  }

  return false;
}
