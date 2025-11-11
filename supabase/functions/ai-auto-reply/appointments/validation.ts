/**
 * Appointment validation utilities
 * Validates enum values and detects duplicate appointments
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { APPOINTMENT_STATUS } from '../config.ts';
import type { DynamicEnums, AppointmentData } from '../types.ts';

/**
 * Validates appointment data against dynamic enums
 * 
 * CRITICAL: Prevents AI hallucinations by checking enum values
 * Even with strict schema, we validate server-side for security
 * 
 * @param appointmentData - Appointment data from AI function call
 * @param dynamicEnums - Valid enums from user catalog
 * @returns Validation result with isValid and error details
 * 
 * @example
 * const validation = validateAppointmentEnums(appointmentData, dynamicEnums);
 * if (!validation.isValid) {
 *   console.log('Invalid:', validation.invalidFields);
 * }
 */
export function validateAppointmentEnums(
  appointmentData: AppointmentData,
  dynamicEnums: DynamicEnums
): {
  isValid: boolean;
  invalidFields: string[];
  errors: string[];
} {
  const { durationEnum, extraEnum } = dynamicEnums;
  const invalidFields: string[] = [];
  const errors: string[] = [];

  // Validate duration
  if (!durationEnum.includes(appointmentData.duration)) {
    invalidFields.push('duration');
    errors.push(`Duration "${appointmentData.duration}" not in valid enums: ${durationEnum.join(', ')}`);
  }

  // Validate extras
  for (const extra of appointmentData.selected_extras) {
    if (extra !== 'aucun' && !extraEnum.includes(extra)) {
      invalidFields.push('selected_extras');
      errors.push(`Extra "${extra}" not in valid enums: ${extraEnum.join(', ')}`);
      break; // Only report once
    }
  }

  return {
    isValid: invalidFields.length === 0,
    invalidFields,
    errors
  };
}

/**
 * Checks for duplicate appointments
 * 
 * Duplicate detection rules:
 * - Same conversation_id + appointment_date + start_time
 * - Only checks pending and confirmed appointments (not cancelled)
 * 
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @param appointmentDate - Appointment date (YYYY-MM-DD)
 * @param startTime - Start time (HH:MM)
 * @returns Object with isDuplicate flag and existing appointment if found
 * 
 * @example
 * const duplicate = await checkDuplicateAppointment(supabase, conversation_id, "2025-01-15", "14:30");
 * if (duplicate.isDuplicate) {
 *   console.log('Duplicate found:', duplicate.existingAppointment);
 * }
 */
export async function checkDuplicateAppointment(
  supabase: SupabaseClient,
  conversationId: string,
  appointmentDate: string,
  startTime: string
): Promise<{
  isDuplicate: boolean;
  existingAppointment?: any;
}> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('appointment_date', appointmentDate)
    .eq('start_time', startTime)
    .in('status', [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED])
    .maybeSingle();

  if (error) {
    console.error('[validation] Error checking duplicates:', error);
    // Return false to allow creation on error (better than blocking legitimate appointments)
    return { isDuplicate: false };
  }

  if (data) {
    console.log('[validation] Duplicate appointment found:', data.id);
    return {
      isDuplicate: true,
      existingAppointment: data
    };
  }

  return { isDuplicate: false };
}

/**
 * Validates appointment data format
 * Checks date and time string formats
 * 
 * @param appointmentData - Appointment data to validate
 * @returns Validation result
 */
export function validateAppointmentFormat(
  appointmentData: AppointmentData
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(appointmentData.appointment_date)) {
    errors.push(`Invalid date format: ${appointmentData.appointment_date}. Expected YYYY-MM-DD`);
  }

  // Validate time format (HH:MM)
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(appointmentData.appointment_time)) {
    errors.push(`Invalid time format: ${appointmentData.appointment_time}. Expected HH:MM`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Complete validation pipeline
 * Runs all validations: format, enums, duplicates
 * 
 * @param appointmentData - Appointment data to validate
 * @param dynamicEnums - Valid enums
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @returns Complete validation result
 */
export async function validateAppointmentComplete(
  appointmentData: AppointmentData,
  dynamicEnums: DynamicEnums,
  supabase: SupabaseClient,
  conversationId: string
): Promise<{
  isValid: boolean;
  errors: string[];
  isDuplicate: boolean;
}> {
  const errors: string[] = [];

  // 1. Format validation
  const formatValidation = validateAppointmentFormat(appointmentData);
  if (!formatValidation.isValid) {
    errors.push(...formatValidation.errors);
    return { isValid: false, errors, isDuplicate: false };
  }

  // 2. Enum validation
  const enumValidation = validateAppointmentEnums(appointmentData, dynamicEnums);
  if (!enumValidation.isValid) {
    errors.push(...enumValidation.errors);
    return { isValid: false, errors, isDuplicate: false };
  }

  // 3. Duplicate check
  const duplicateCheck = await checkDuplicateAppointment(
    supabase,
    conversationId,
    appointmentData.appointment_date,
    appointmentData.appointment_time
  );

  if (duplicateCheck.isDuplicate) {
    errors.push('Duplicate appointment detected');
    return { isValid: false, errors, isDuplicate: true };
  }

  return { isValid: true, errors: [], isDuplicate: false };
}
