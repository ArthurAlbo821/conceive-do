/**
 * AI mode determination
 * Decides whether AI should be in WORKFLOW or WAITING mode
 */

import { AI_MODES, type AIMode } from '../config.ts';
import type { Appointment } from '../types.ts';

/**
 * Determines which AI mode to use based on today's appointment status
 * 
 * WORKFLOW mode: No confirmed appointment today
 * - AI conducts full booking workflow (collect duration, extras, time, confirm)
 * - Uses function calling to create appointments
 * 
 * WAITING mode: Confirmed appointment TODAY
 * - AI makes client wait with friendly messages
 * - Detects client arrival through context analysis
 * - Uses JSON structured output (not function calling)
 * 
 * @param todayAppointment - Appointment for today if exists, null otherwise
 * @returns AI mode (WORKFLOW or WAITING)
 * 
 * @example
 * const mode = determineAIMode(todayAppointment);
 * if (mode === AI_MODES.WAITING) {
 *   console.log('Client has appointment today, make them wait');
 * } else {
 *   console.log('No appointment today, proceed with booking workflow');
 * }
 */
export function determineAIMode(todayAppointment: Appointment | null): AIMode {
  return todayAppointment ? AI_MODES.WAITING : AI_MODES.WORKFLOW;
}

/**
 * Checks if AI should be in WORKFLOW mode
 * 
 * @param todayAppointment - Appointment for today if exists
 * @returns true if WORKFLOW mode, false otherwise
 */
export function isWorkflowMode(todayAppointment: Appointment | null): boolean {
  return determineAIMode(todayAppointment) === AI_MODES.WORKFLOW;
}

/**
 * Checks if AI should be in WAITING mode
 * 
 * @param todayAppointment - Appointment for today if exists
 * @returns true if WAITING mode, false otherwise
 */
export function isWaitingMode(todayAppointment: Appointment | null): boolean {
  return determineAIMode(todayAppointment) === AI_MODES.WAITING;
}

/**
 * Gets a human-readable description of the current AI mode
 * 
 * @param todayAppointment - Appointment for today if exists
 * @returns Description string
 */
export function getAIModeDescription(todayAppointment: Appointment | null): string {
  if (todayAppointment) {
    return `WAITING (RDV confirmé aujourd'hui à ${todayAppointment.start_time})`;
  } else {
    return 'WORKFLOW (Pas de RDV aujourd\'hui)';
  }
}
