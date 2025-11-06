/**
 * Appointment creation utilities
 * Creates appointments in database with price calculation and end time computation
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { APPOINTMENT_STATUS } from '../config.ts';
import type { AppointmentData, UserInformation, PriceMappings } from '../types.ts';

/**
 * Calculates end time from start time and duration
 * 
 * @param startTime - Start time in HH:MM format
 * @param durationMinutes - Duration in minutes
 * @returns End time in HH:MM format
 * 
 * @example
 * calculateEndTime("14:30", 60); // "15:30"
 * calculateEndTime("23:30", 60); // "00:30" (next day)
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  // Validate inputs
  if (!startTime || !/^\d{1,2}:\d{2}$/.test(startTime)) {
    throw new Error(`Invalid startTime format: ${startTime}. Expected HH:MM format.`);
  }
  if (durationMinutes < 0) {
    throw new Error(`Invalid durationMinutes: ${durationMinutes}. Must be non-negative.`);
  }
  
  const [hours, minutes] = startTime.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes) || hours > 23 || minutes > 59) {
    throw new Error(`Invalid time components in startTime: ${startTime}`);
  }
  
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + durationMinutes;
  
  const endHours = Math.floor(endMinutes / 60) % 24;
  const endMins = endMinutes % 60;
  
  return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
}

/**
 * Parses duration string to minutes
 *
 * @param duration - Duration string (e.g., "30min", "1h", "1h30")
 * @returns Number of minutes
 * @throws Error if duration format is invalid
 *
 * @example
 * parseDurationToMinutes("30min");  // 30
 * parseDurationToMinutes("1h");     // 60
 * parseDurationToMinutes("1h30");  // 90
 */
export function parseDurationToMinutes(duration: string): number {
  if (!duration || typeof duration !== 'string') {
    throw new Error(`Invalid duration: ${duration}. Must be a non-empty string.`);
  }

  const hourMatch = duration.match(/(\d+)h/);
  const minMatch = duration.match(/(\d+)(?!h)(?:min)?/);

  if (!hourMatch && !minMatch) {
    throw new Error(`Unable to parse duration: ${duration}. Expected formats: "30min", "1h", "1h30"`);
  }

  let minutes = 0;
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) minutes += parseInt(minMatch[1]);

  return minutes;
}

/**
 * Calculates total price (duration + extras)
 * 
 * @param duration - Duration string
 * @param selectedExtras - Array of selected extras
 * @param priceMappings - Price mappings for durations and extras
 * @returns Total price in CHF
 * @throws {Error} If duration or any extra is not found in price mappings
 * 
 * @example
 * const price = calculateTotalPrice("1h", ["Anal"], priceMappings);
 * // Returns duration price + extra price
 */
export function calculateTotalPrice(
  duration: string,
  selectedExtras: string[],
  priceMappings: PriceMappings
): number {
  const { durationToPriceMap, extraToPriceMap } = priceMappings;
  
  // Validate duration price exists - FAIL-FAST to prevent incorrect pricing
  if (!(duration in durationToPriceMap)) {
    const availableKeys = Object.keys(durationToPriceMap).join(', ');
    console.error('[pricing] ❌ Missing price mapping for duration:', {
      duration,
      availableKeys,
      durationToPriceMap
    });
    throw new Error(
      `Missing price mapping for duration "${duration}". Available durations: ${availableKeys}`
    );
  }
  
  // Base price from duration
  let totalPrice = durationToPriceMap[duration];
  
  // Add extras prices with validation
  for (const extra of selectedExtras) {
    if (extra !== 'aucun') {
      // Validate extra price exists - FAIL-FAST to prevent incorrect pricing
      if (!(extra in extraToPriceMap)) {
        const availableKeys = Object.keys(extraToPriceMap).join(', ');
        console.error('[pricing] ❌ Missing price mapping for extra:', {
          extra,
          availableKeys,
          extraToPriceMap
        });
        throw new Error(
          `Missing price mapping for extra "${extra}". Available extras: ${availableKeys}`
        );
      }
      totalPrice += extraToPriceMap[extra];
    }
  }
  
  return totalPrice;
}

/**
 * Determines service name based on selected prestations and extras
 *
 * @param userInfo - User information with prestations
 * @param selectedExtras - Selected extras
 * @returns Service name string
 *
 * @example
 * determineServiceName(userInfo, []); // "Toutes prestations"
 */
export function determineServiceName(
  userInfo: UserInformation,
  selectedExtras: string[]
): string {
  const actualExtras = selectedExtras.filter(e => e !== 'aucun');

  if (actualExtras.length > 0) {
    return `Toutes prestations + ${actualExtras.join(' + ')}`;
  }

  return 'Toutes prestations incluses';
}

/**
 * Creates an appointment in the database
 *
 * This function:
 * 1. Validates required fields
 * 2. Calculates duration, end time, and total price
 * 3. Creates the appointment record
 *
 * @param supabase - Supabase client
 * @param appointmentData - Appointment data from AI function call
 * @param conversationId - Conversation ID
 * @param userId - User ID
 * @param userInfo - User information
 * @param priceMappings - Price mappings
 * @returns Created appointment object
 * @throws Error if required fields are missing or creation fails
 */
export async function createAppointment(
  supabase: SupabaseClient,
  appointmentData: AppointmentData,
  conversationId: string,
  userId: string,
  userInfo: UserInformation,
  priceMappings: PriceMappings
): Promise<any> {
  // Validate required fields
  if (!appointmentData.appointment_date) {
    throw new Error('Missing required field: appointment_date');
  }
  if (!appointmentData.appointment_time) {
    throw new Error('Missing required field: appointment_time');
  }
  if (!appointmentData.duration) {
    throw new Error('Missing required field: duration');
  }
  if (!Array.isArray(appointmentData.selected_extras)) {
    throw new Error('Invalid field: selected_extras must be an array');
  }
  
  // Calculate duration in minutes
  const durationMinutes = parseDurationToMinutes(appointmentData.duration);
  

  // Calculate end time
  const endTime = calculateEndTime(appointmentData.appointment_time, durationMinutes);
  
  // Calculate total price
  const totalPrice = calculateTotalPrice(
    appointmentData.duration,
    appointmentData.selected_extras,
    priceMappings
  );
  
  // Determine service name
  const serviceName = determineServiceName(userInfo, appointmentData.selected_extras);
  
  // Build appointment object
  const appointmentToCreate = {
    conversation_id: conversationId,
    user_id: userId,
    appointment_date: appointmentData.appointment_date,
    start_time: appointmentData.appointment_time,
    end_time: endTime,
    duration_minutes: durationMinutes,
    service: serviceName,
    extras: appointmentData.selected_extras.filter(e => e !== 'aucun'),
    total_price: totalPrice,
    status: APPOINTMENT_STATUS.CONFIRMED,
    client_arrived: false,
    provider_ready_to_receive: false
  };
  
  console.log('[appointment] Creating appointment:', appointmentToCreate);
  
  // Insert into database
  const { data, error } = await supabase
    .from('appointments')
    .insert(appointmentToCreate)
    .select()
    .single();
  
  if (error) {
    console.error('[appointment] Error creating appointment:', error);
    throw error;
  }
  
  console.log('[appointment] Appointment created successfully:', data.id);
  return data;
}
