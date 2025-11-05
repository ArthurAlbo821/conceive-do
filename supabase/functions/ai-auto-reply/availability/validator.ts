/**
 * Appointment time validation utilities
 * Server-side validation to prevent invalid appointment times
 */

import { APPOINTMENT_CONFIG } from '../config.ts';
import { toFranceTime, toFranceISODate } from '../utils/timezone.ts';
import { isTimeInAvailableRanges } from './calculator.ts';
import type { Availability, Appointment } from '../types.ts';

/**
 * Parses a datetime string as France timezone and returns a UTC Date object
 * that corresponds to that France local time.
 * 
 * @param dateTimeString - DateTime string in format "YYYY-MM-DDTHH:MM:SS" (France time)
 * @returns UTC Date object corresponding to that France local time
 * 
 * @example
 * parseFranceDateTime("2025-01-15T14:30:00") 
 * // Returns UTC Date that represents 14:30 France time (13:30 UTC in winter, 12:30 UTC in summer)
 */
function parseFranceDateTime(dateTimeString: string): Date {
  // The string format is "YYYY-MM-DDTHH:MM:SS" and represents France local time
  // We need to construct a UTC Date that, when interpreted in Europe/Paris timezone,
  // gives us the same local time
  
  // Parse: Interpret the string as if it were in France timezone
  // ISO 8601 format with timezone: append +01:00 or +02:00 depending on DST
  // For simplicity, we can use a temporary approach: parse with Date constructor
  // and adjust for timezone offset difference
  
  // Parse components
  const [datePart, timePart] = dateTimeString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  
  // Create Date in local runtime timezone first
  const tempDate = new Date(year, month - 1, day, hour, minute, second || 0);
  
  // Get the offset difference between runtime timezone and France timezone
  // Use a reference UTC date to format in both timezones
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
  
  // Format this UTC date as France time to see what local time it represents
  const franceFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const franceStr = franceFormatter.format(utcDate);
  const [fDatePart, fTimePart] = franceStr.split(', ');
  const [fMonth, fDay, fYear] = fDatePart.split('/').map(Number);
  const [fHour, fMinute, fSecond] = fTimePart.split(':').map(Number);
  
  // Calculate the difference in minutes
  const targetMinutes = hour * 60 + minute;
  const actualMinutes = fHour * 60 + fMinute;
  const diffMinutes = targetMinutes - actualMinutes;
  
  // Adjust UTC date by this difference
  return new Date(utcDate.getTime() + diffMinutes * 60 * 1000);
}

/**
 * Validates that an appointment time meets minimum lead time requirement
 * 
 * CRITICAL: Server-side validation to prevent appointments too close to current time
 * Client may manipulate data, so we always validate on the server
 * 
 * IMPORTANT: This function treats times in the past as INVALID.
 * It does NOT automatically adjust past times to tomorrow. If the appointment
 * is intended for tomorrow, the appointmentDateTime string must explicitly
 * contain tomorrow's date.
 * 
 * @param appointmentDateTime - Appointment date/time string in format "YYYY-MM-DDTHH:MM:SS"
 *                              interpreted as France timezone (Europe/Paris)
 * @param currentDate - Current date (UTC Date)
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
  // Parse appointment time using France timezone-aware utility
  // This ensures the datetime string is correctly interpreted as France local time
  const appointmentDate = parseFranceDateTime(appointmentDateTime);
  const now = currentDate;

  // Calculate time difference in minutes
  const minutesUntil = (appointmentDate.getTime() - now.getTime()) / (1000 * 60);

  // EXPLICIT VALIDATION: Times in the past are invalid
  // We do NOT automatically adjust to tomorrow. If the client wants tomorrow,
  // they must provide tomorrow's date explicitly in appointmentDateTime.
  if (appointmentDate < now) {
    console.log('[validator] Appointment time is in the past:', {
      appointmentDateTime,
      appointmentDate: appointmentDate.toISOString(),
      currentDate: now.toISOString(),
      minutesUntil: minutesUntil.toFixed(2)
    });
    
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

  // Check for appointment conflicts
  const hasConflict = hasAppointmentConflict(
    appointmentTime,
    APPOINTMENT_CONFIG.APPOINTMENT_DURATION_MINUTES,
    appointmentDate,
    appointments
  );

  if (hasConflict) {
    return {
      isValid: false,
      reason: 'appointment_conflict',
      suggestion: `Désolée bébé, ce créneau est déjà pris. Tu peux choisir un autre ?`
    };
  }

  return { isValid: true };
}
} {
  // Validate input format for appointmentDate
  if (!isValidDateFormat(appointmentDate)) {
    return {
      isValid: false,
      reason: 'invalid_format',
      suggestion: 'Désolée bébé, la date doit être au format YYYY-MM-DD (ex: 2025-01-15).'
    };
  }

  // Validate input format for appointmentTime
  if (!isValidTimeFormat(appointmentTime)) {
    return {
      isValid: false,
      reason: 'invalid_format',
      suggestion: 'Désolée bébé, l\'heure doit être au format HH:mm en 24h (ex: 14:30).'
    };
  }

  const today = toFranceISODate(currentDate);

  // Check if appointment is for today
  if (appointmentDate !== today) {
    return {
      isValid: false,
      reason: 'appointment_not_today',
      suggestion: 'Désolée, rendez-vous le jour même uniquement.'
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
 * @param currentDate - Current date (UTC Date)
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
  // Validation 0: Check input format validity
  if (!isValidDateFormat(appointmentDate)) {
    return {
      isValid: false,
      errorCode: 'INVALID_DATE_FORMAT',
      errorMessage: `Invalid date format: ${appointmentDate}. Expected YYYY-MM-DD`,
      userMessage: 'Désolée bébé, le format de la date est incorrect. Utilise YYYY-MM-DD.'
    };
  }

  if (!isValidTimeFormat(appointmentTime)) {
    return {
      isValid: false,
      errorCode: 'INVALID_TIME_FORMAT',
      errorMessage: `Invalid time format: ${appointmentTime}. Expected HH:MM`,
      userMessage: 'Désolée bébé, le format de l\'heure est incorrect. Utilise HH:MM.'
    };
  }

  const today = toFranceISODate(currentDate);

  // Validation 1: Check if date is today
  if (appointmentDate !== today) {
    return {
      isValid: false,
      errorCode: 'NOT_TODAY',
      errorMessage: `Appointment date ${appointmentDate} is not today ${today}`,
      userMessage: 'Désolée, uniquement pour aujourd\'hui.'
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

  // Validation 3: Check for appointment conflicts
  const hasConflict = hasAppointmentConflict(
    appointmentTime,
    APPOINTMENT_CONFIG.APPOINTMENT_DURATION_MINUTES,
    appointmentDate,
    appointments
  );

  if (hasConflict) {
    return {
      isValid: false,
      errorCode: 'CONFLICT',
      errorMessage: `Appointment at ${appointmentTime} conflicts with an existing appointment`,
      userMessage: `Désolée bébé, j'ai déjà un rendez-vous à cette heure. Je suis dispo ${availableRanges}. Tu peux à quelle heure ?`
    };
  }

  // Validation 4: Check if time is in available ranges
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
