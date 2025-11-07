/**
 * Conversation data fetching utilities
 * Retrieves conversation messages and checks for today's appointments
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { CONVERSATION_CONFIG, APPOINTMENT_STATUS } from '../config.ts';
import { toFranceTime, toFranceISODate } from '../utils/timezone.ts';
import type { Message, Appointment } from '../types.ts';

/**
 * Fetches conversation messages for AI context
 * Returns the most recent N messages (configured in CONVERSATION_CONFIG)
 * Messages are returned in chronological order (oldest first)
 * 
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @returns Array of messages in chronological order
 * @throws Error if messages cannot be fetched
 * 
 * @example
 * const messages = await fetchConversationMessages(supabase, conversation_id);
 * // [
 * //   { direction: 'incoming', content: 'Salut', timestamp: '...' },
 * //   { direction: 'outgoing', content: 'Hey', timestamp: '...' },
 * //   ...
 * // ]
 */
export async function fetchConversationMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('direction, content, timestamp')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(CONVERSATION_CONFIG.MAX_HISTORY_MESSAGES);

  if (error) {
    console.error('[data] Error fetching messages:', error);
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  // Reverse to have chronological order (oldest first)
  const messages = (data || []) as Message[];
  return messages.reverse();
}

/**
 * Checks if there's a confirmed appointment TODAY for this conversation
 * This is used to determine AI mode (WORKFLOW vs WAITING)
 * 
 * IMPORTANT: Returns the appointment if found, null if not found
 * - If appointment exists → AI enters WAITING mode (make client wait)
 * - If no appointment → AI enters WORKFLOW mode (book appointment)
 * 
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @returns Appointment object if found today, null otherwise
 * @throws Error if appointment check fails
 * 
 * @example
 * const todayAppt = await checkTodayAppointment(supabase, conversation_id);
 * if (todayAppt) {
 *   // AI mode: WAITING
 *   console.log('Appointment at', todayAppt.start_time);
 * } else {
 *   // AI mode: WORKFLOW
 *   console.log('No appointment today, proceed with booking');
 * }
 */
export async function checkTodayAppointment(
  supabase: SupabaseClient,
  conversationId: string
): Promise<Appointment | null> {
  // Get today's date in France timezone
  const today = toFranceISODate(toFranceTime(new Date()));

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('appointment_date', today)
    .eq('status', APPOINTMENT_STATUS.CONFIRMED)
    .maybeSingle();
  if (error) {
    console.error('[data] Error checking today appointment:', error);
    throw new Error(`Failed to check today's appointment: ${error.message}`);
  }

  if (data) {
    console.log('[data] Found confirmed appointment TODAY at', data.start_time);
  } else {
    console.log('[data] No confirmed appointment today');
  }

  return data as Appointment | null;
}

/**
 * Checks if a conversation exists and retrieves its contact phone
 * Used for security validation before sending messages
 *
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @returns Object with contact_phone if conversation exists, null otherwise
 *
 * @example
 * const conversation = await getConversationContactPhone(supabase, conversation_id);
 * if (conversation) {
 *   console.log('Contact phone:', conversation.contact_phone);
 * }
 */
export async function getConversationContactPhone(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{ contact_phone: string } | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('contact_phone')
    .eq('id', conversationId)
    .single();
  if (error) {
    console.error('[data] Error fetching conversation:', error);
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  return data as { contact_phone: string };
}

/**
 * Retrieves conversation contact information (phone and name)
 * Used for appointment creation
 *
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @returns Object with contact_phone and contact_name
 *
 * @example
 * const { contact_phone, contact_name } = await getConversationContact(supabase, conversation_id);
 */
export async function getConversationContact(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{ contact_phone: string; contact_name: string | null }> {
  const { data, error } = await supabase
    .from('conversations')
    .select('contact_phone, contact_name')
    .eq('id', conversationId)
    .single();
  if (error) {
    console.error('[data] Error fetching conversation contact:', error);
    throw new Error(`Failed to fetch conversation contact: ${error.message}`);
  }

  return data as { contact_phone: string; contact_name: string | null };
}

/**
 * Fetches all conversation data needed for AI processing
 * Convenience function that fetches everything in parallel
 * 
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @returns Object with messages and todayAppointment
 * @throws Error if messages cannot be fetched
 * 
 * @example
 * const { messages, todayAppointment } = await fetchAllConversationData(supabase, conversation_id);
 */
export async function fetchAllConversationData(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{
  messages: Message[];
  todayAppointment: Appointment | null;
}> {
  // Fetch in parallel for better performance
  const [messages, todayAppointment] = await Promise.all([
    fetchConversationMessages(supabase, conversationId),
    checkTodayAppointment(supabase, conversationId)
  ]);

  return {
    messages,
    todayAppointment
  };
}
