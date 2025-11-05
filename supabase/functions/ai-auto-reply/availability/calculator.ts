/**
 * Availability calculation utilities
 * Complex logic for computing available time ranges with midnight crossing support
 */

import { APPOINTMENT_CONFIG } from '../config.ts';
import { toFranceTime, toFranceISODate, getFranceDay, getFranceHours, getFranceMinutes } from '../utils/timezone.ts';
import type { Availability, Appointment } from '../types.ts';

/**
 * Computes available time ranges for TODAY only
 * 
 * This function handles complex scenarios:
 * - Multiple availability windows per day
 * - Existing appointments that block time slots
 * - Minimum booking lead time (30 minutes)
 * - Availability ranges that cross midnight (e.g., 18:30-2:00)
 * 
 * Algorithm:
 * 1. Find availabilities for today (day_of_week)
 * 2. Build set of occupied minutes from existing appointments
 * 3. For each availability window:
 *    - Convert to minutes from midnight
 *    - Skip minutes that are occupied or in the past
 *    - Group consecutive available minutes into ranges
 * 4. Format ranges as "HH:MM-HH:MM" strings
 * 
 * @param availabilities - User's availability schedule
 * @param appointments - Existing appointments
 * @param currentDate - Current date (UTC Date, will be interpreted in France timezone)
 * @returns Formatted string of available ranges (e.g., "14h-16h, 18h30-2h (jusqu'à demain matin)")
 * 
 * @example
 * const ranges = computeAvailableRanges(availabilities, appointments, now);
 * // "14h-16h, 18h30-23h"
 * // or "18h30-2h (jusqu'à demain matin)" for midnight-crossing
 */
export function computeAvailableRanges(
  availabilities: Availability[],
  appointments: Appointment[],
  currentDate: Date
): string {
  if (!availabilities || availabilities.length === 0) {
    return "Aucune dispo configurée";
  }

  // Extract components in France timezone
  const dayOfWeek = getFranceDay(currentDate);
  const dateStr = toFranceISODate(currentDate);

  // Find availabilities for today
  const todayAvails = availabilities.filter((a) => a.day_of_week === dayOfWeek);

  if (todayAvails.length === 0) {
    return "Pas dispo aujourd'hui";
  }

  // Get appointments for today
  const todayAppointments = appointments.filter((apt) => apt.appointment_date === dateStr);

  // Build array of all occupied minutes
  const occupiedMinutes = buildOccupiedMinutesSet(todayAppointments);

  // Current time in minutes + minimum booking lead time (in France timezone)
  const currentMinute = getFranceHours(currentDate) * 60 + getFranceMinutes(currentDate);
  const minimumAllowedMinute = currentMinute + APPOINTMENT_CONFIG.MIN_BOOKING_LEAD_TIME_MINUTES;

  // Build available ranges
  const ranges: string[] = [];

  for (const avail of todayAvails) {
    const [startH, startM] = avail.start_time.split(':').map(Number);
    const [endH, endM] = avail.end_time.split(':').map(Number);
    
    let availStartMinute = startH * 60 + startM;
    let availEndMinute = endH * 60 + endM;

    // Handle crossing midnight (e.g., 18:30 - 02:00)
    const crossesMidnight = availEndMinute <= availStartMinute;
    if (crossesMidnight) {
      availEndMinute += 24 * 60; // Add 24 hours
    }

    let rangeStart: number | null = null;

    for (let m = availStartMinute; m <= availEndMinute; m++) {
      const actualMinute = m % (24 * 60);
      // Consider slots as "past" if they're before current time + lead time
      const isPast = m < minimumAllowedMinute;
      const isPast = actualMinute < minimumAllowedMinute && m < 24 * 60;
      const isOccupied = occupiedMinutes.has(actualMinute);

      if (!isPast && !isOccupied) {
        // Available slot
        if (rangeStart === null) {
          rangeStart = m;
        }
      } else {
        // Not available
        if (rangeStart !== null) {
          // Close previous range
          const prevMinute = m - 1;
          ranges.push(formatTimeRange(rangeStart, prevMinute));
          rangeStart = null;
        }
      }
    }

    // Close last range if open
    if (rangeStart !== null) {
      ranges.push(formatTimeRange(rangeStart, availEndMinute));
    }
  }

  return ranges.length > 0 ? ranges.join(', ') : "Plus de créneaux dispo aujourd'hui";
}

/**
 * Builds a Set of occupied minutes from appointments
 * Each minute in an appointment duration is added to the set
 * 
 * @param appointments - Appointments for the day
 * @returns Set of occupied minutes (0-1439)
 * 
 * @example
 * const occupied = buildOccupiedMinutesSet([
 *   { start_time: "14:00", end_time: "15:00" }
 * ]);
 * // Set { 840, 841, 842, ..., 899 } (14:00-15:00 in minutes)
 */
export function buildOccupiedMinutesSet(appointments: Appointment[]): Set<number> {
  const occupiedMinutes = new Set<number>();
  for (const apt of appointments) {
    const [startH, startM] = apt.start_time.split(':').map(Number);
    const [endH, endM] = apt.end_time.split(':').map(Number);
    
    const startMinute = startH * 60 + startM;
    let endMinute = endH * 60 + endM;

    // Handle midnight crossing
    if (endMinute <= startMinute) {
      endMinute += 24 * 60;
    }

    // Mark all minutes in this appointment as occupied
    for (let m = startMinute; m < endMinute; m++) {
      occupiedMinutes.add(m % (24 * 60));
    }
    }
  }

  return occupiedMinutes;
}

/**
 * Formats a time range from start/end minutes
 * Handles midnight crossing with special suffix
 * 
 * @param startMinute - Start minute (can exceed 1440 for next day)
 * @param endMinute - End minute (can exceed 1440 for next day)
 * @returns Formatted time range string
 * 
 * @example
 * formatTimeRange(840, 960);  // "14h-16h"
 * formatTimeRange(1110, 120); // "18h30-2h (jusqu'à demain matin)"
 */
export function formatTimeRange(startMinute: number, endMinute: number): string {
  const actualStart = startMinute % (24 * 60);
  const actualEnd = endMinute % (24 * 60);
  
  const startH = Math.floor(actualStart / 60);
  const startM = actualStart % 60;
  const endH = Math.floor(actualEnd / 60);
  const endM = actualEnd % 60;

  const formatTime = (h: number, m: number) => 
    m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;

  // Indicate if range crosses midnight
  const crossesMidnight = endMinute > 24 * 60;
  const rangeStr = `${formatTime(startH, startM)}-${formatTime(endH, endM)}`;
  
  return crossesMidnight ? `${rangeStr} (jusqu'à demain matin)` : rangeStr;
}

/**
 * Checks if a specific time falls within available ranges
 * Used for server-side validation of appointment requests
 * 
 * @param time - Time to check in HH:MM format
 * @param availableRanges - Available ranges string from computeAvailableRanges()
 * @param availabilities - User's availability schedule
 * @param appointments - Existing appointments
 * @param currentDate - Current date (UTC Date, will be interpreted in France timezone)
 * @returns true if time is available, false otherwise
 * 
 * @example
 * const isAvailable = isTimeInAvailableRanges(
 *   "14:30", 
 *   "14h-16h, 18h30-23h",
 *   availabilities,
 *   appointments,
 *   now
 * );
 * // true (14:30 is within 14h-16h range)
 */
export function isTimeInAvailableRanges(
  time: string,
  availableRanges: string,
  availabilities: Availability[],
  appointments: Appointment[],
  currentDate: Date
): boolean {
  // Special cases
  if (availableRanges === "Aucune dispo configurée" || 
      availableRanges === "Pas dispo aujourd'hui" ||
      availableRanges === "Plus de créneaux dispo aujourd'hui") {
    return false;
  }

  const [hours, minutes] = time.split(':').map(Number);
  const timeMinutes = hours * 60 + minutes;

  // Build occupied set and check lead time (in France timezone)
  const currentMinute = getFranceHours(currentDate) * 60 + getFranceMinutes(currentDate);
  const minimumAllowedMinute = currentMinute + APPOINTMENT_CONFIG.MIN_BOOKING_LEAD_TIME_MINUTES;

  if (timeMinutes < minimumAllowedMinute) {
    return false; // Too close to current time
  }

  const occupiedMinutes = buildOccupiedMinutesSet(
    appointments.filter(apt => apt.appointment_date === toFranceISODate(currentDate))
  );

  if (occupiedMinutes.has(timeMinutes)) {
    return false; // Time is occupied
  }

  // Check if time falls within any availability window (in France timezone)
  const dayOfWeek = getFranceDay(currentDate);
  const todayAvails = availabilities.filter(a => a.day_of_week === dayOfWeek);

  for (const avail of todayAvails) {
    const [startH, startM] = avail.start_time.split(':').map(Number);
    const [endH, endM] = avail.end_time.split(':').map(Number);
    
    const startMinute = startH * 60 + startM;
    let endMinute = endH * 60 + endM;

    // Handle midnight crossing
    const crossesMidnight = endMinute <= startMinute;
    if (crossesMidnight) {
      // Time is in range if it's >= start OR <= end
      if (timeMinutes >= startMinute || timeMinutes <= endMinute) {
        return true;
      }
    } else {
      // Normal range: time must be >= start AND <= end
      if (timeMinutes >= startMinute && timeMinutes <= endMinute) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Gets the next available time slot after current time + lead time
 * Useful for suggesting alternatives when requested time is not available
 * 
 * @param availabilities - User's availability schedule
 * @param appointments - Existing appointments
 * @param currentDate - Current date (UTC Date, will be interpreted in France timezone)
 * @returns Next available time in HH:MM format, or null if none available today
 */
export function getNextAvailableSlot(
  availabilities: Availability[],
  appointments: Appointment[],
  currentDate: Date
): string | null {
  const ranges = computeAvailableRanges(availabilities, appointments, currentDate);
  
  if (ranges === "Aucune dispo configurée" || 
      ranges === "Pas dispo aujourd'hui" ||
      ranges === "Plus de créneaux dispo aujourd'hui") {
    return null;
  }

  // Parse first range and return its start time
  const firstRange = ranges.split(',')[0].trim();
  const startTime = firstRange.split('-')[0];
  
  // Convert back to HH:MM format
  const hourMatch = startTime.match(/(\d+)h(\d*)/);
  if (hourMatch) {
    const hours = hourMatch[1].padStart(2, '0');
    const minutes = hourMatch[2] ? hourMatch[2].padStart(2, '0') : '00';
    return `${hours}:${minutes}`;
  }

  return null;
}
