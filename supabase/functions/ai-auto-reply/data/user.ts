/**
 * User data fetching utilities
 * Retrieves user information, availabilities, and appointments from database
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { APPOINTMENT_CONFIG, APPOINTMENT_STATUS } from '../config.ts';
import { toFranceTime, toFranceISODate } from '../utils/timezone.ts';
import type { UserInformation, Availability, Appointment } from '../types.ts';

/**
 * Fetches user information (prestations, extras, tarifs, etc.)
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @returns User information object
 * @throws Error if user information not found
 * 
 * @example
 * const userInfo = await fetchUserInfo(supabase, user_id);
 * // { prestations: [...], extras: [...], tarifs: [...], adresse: "...", ... }
 */
export async function fetchUserInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<UserInformation> {
  const { data, error } = await supabase
    .from('user_informations')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('[data] Error fetching user informations:', error);
    throw new Error('User informations not found');
  }

  return data as UserInformation;
}

/**
 * Fetches active availabilities for a user
 * Returns availabilities ordered by day_of_week and start_time
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @returns Array of active availabilities (empty array if none)
 * 
 * @example
 * const availabilities = await fetchAvailabilities(supabase, user_id);
 * // [{ day_of_week: 1, start_time: "09:00", end_time: "17:00", ... }, ...]
 */
export async function fetchAvailabilities(
  supabase: SupabaseClient,
  userId: string
): Promise<Availability[]> {
  const { data, error } = await supabase
    .from('availabilities')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[data] Error fetching availabilities:', error);
    return [];
  }

  return (data || []) as Availability[];
}

/**
 * Fetches upcoming appointments for a user
 * Returns appointments for the next N days (configured in APPOINTMENT_CONFIG)
 * Only includes pending and confirmed appointments
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @returns Array of upcoming appointments (empty array if none)
 * 
 * @example
 * const appointments = await fetchAppointments(supabase, user_id);
 * // [{ appointment_date: "2025-01-15", start_time: "14:00", ... }, ...]
 */
export async function fetchAppointments(
  supabase: SupabaseClient,
  userId: string
): Promise<Appointment[]> {
  // Calculate date range in France timezone
  const todayFrance = toFranceTime(new Date());
  const today = toFranceISODate(todayFrance);

  const nextWeekDate = new Date(todayFrance.getTime() + APPOINTMENT_CONFIG.APPOINTMENT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const nextWeek = toFranceISODate(toFranceTime(nextWeekDate));

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .gte('appointment_date', today)
    .lte('appointment_date', nextWeek)
    .in('status', [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED])
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[data] Error fetching appointments:', error);
    return [];
  }

  return (data || []) as Appointment[];
}

/**
 * Fetches all user data needed for AI conversation
 * Convenience function that fetches everything in parallel
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @returns Object with userInfo, availabilities, and appointments
 * @throws Error if user information not found
 * 
 * @example
 * const { userInfo, availabilities, appointments } = await fetchAllUserData(supabase, user_id);
 */
export async function fetchAllUserData(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  userInfo: UserInformation;
  availabilities: Availability[];
  appointments: Appointment[];
}> {
  // Fetch in parallel for better performance
  const [userInfo, availabilities, appointments] = await Promise.all([
    fetchUserInfo(supabase, userId),
    fetchAvailabilities(supabase, userId),
    fetchAppointments(supabase, userId)
  ]);

  console.log('[data] Found', availabilities.length, 'availabilities and', appointments.length, 'upcoming appointments');

  return {
    userInfo,
    availabilities,
    appointments
  };
}
