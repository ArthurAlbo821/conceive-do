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
  const [hours, minutes] = startTime.split(':').map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + durationMinutes;
  
  const endHours = Math.floor(endMinutes / 60) % 24;
  const endMins = endMinutes % 60;
  
  return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
}

/**
 * Converts duration string to minutes
 * 
 * @param duration - Duration string (e.g., "30min", "1h", "1h30")
 * @returns Duration in minutes
 * 
 * @example
 * parseDurationToMinutes("30min"); // 30
 * parseDurationToMinutes("1h");    // 60
 * parseDurationToMinutes("1h30");  // 90
 */
export function parseDurationToMinutes(duration: string): number {
  const hourMatch = duration.match(/(\d+)h/);
  const minMatch = duration.match(/(\d+)min/);
  
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
  
  // Base price from duration
  let totalPrice = durationToPriceMap[duration] || 0;
  
  // Add extras prices
  for (const extra of selectedExtras) {
    if (extra !== 'aucun') {
      totalPrice += extraToPriceMap[extra] || 0;
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
 * determineServiceName(userInfo, ["Anal"]); // "Toutes prestations + Anal"
 */
export function determineServiceName(
  userInfo: UserInformation,
  selectedExtras: string[]
): string {
  // Base service: all prestations are included
  let serviceName = 'Toutes prestations';
  
  // Add extras to service name if any
  const actualExtras = selectedExtras.filter(e => e !== 'aucun');
  if (actualExtras.length > 0) {
    serviceName += ` + ${actualExtras.join(', ')}`;
  }
  
  return serviceName;
}

/**
 * Creates appointment in database
 * 
 * This function:
 * 1. Calculates duration in minutes
 * 2. Computes end time
 * 3. Calculates total price
 * 4. Determines service name
 * 5. Inserts into appointments table
 * 
 * @param supabase - Supabase client
 * @param appointmentData - Appointment data from AI
 * @param conversationId - Conversation ID
 * @param userId - User ID (provider)
 * @param userInfo - User information for pricing
 * @param priceMappings - Price mappings
 * @returns Created appointment object or null if error
 * 
 * @example
 * const appointment = await createAppointment(
 *   supabase,
 *   appointmentData,
 *   conversation_id,
 *   user_id,
 *   userInfo,
 *   priceMappings
 * );
 */
export async function createAppointment(
  supabase: SupabaseClient,
  appointmentData: AppointmentData,
  conversationId: string,
  userId: string,
  userInfo: UserInformation,
  priceMappings: PriceMappings
): Promise<any> {
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
