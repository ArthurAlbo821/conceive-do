/**
 * AI event logging utilities
 * Logs AI-related events to database for debugging and analytics
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

/**
 * Logs an AI event to the database
 * 
 * Events are stored in the ai_events table for:
 * - Debugging: Track AI behavior and decisions
 * - Analytics: Measure performance, success rates
 * - Auditing: Record all AI actions
 * 
 * @param supabase - Supabase client
 * @param userId - User ID (provider)
 * @param conversationId - Conversation ID
 * @param eventType - Type of event (e.g., 'temporal_enriched', 'ai_response', 'appointment_created')
 * @param description - Human-readable description
 * @param metadata - Additional metadata (optional)
 * @returns Created event object or null if error
 * 
 * @example
 * await logAIEvent(supabase, user_id, conversation_id, 
 *   'ai_response', 
 *   'AI generated response', 
 *   { ai_mode: 'WORKFLOW', latency_ms: 1234 }
 * );
 */
export async function logAIEvent(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  eventType: string,
  description: string,
  metadata?: Record<string, any>
): Promise<any> {
  const event = {
    user_id: userId,
    conversation_id: conversationId,
    event_type: eventType,
    description: description,
    metadata: metadata || {}
  };

  const { data, error } = await supabase
    .from('ai_events')
    .insert(event)
    .select()
    .single();

  if (error) {
    console.error('[logging] Error logging AI event:', error);
    // Don't throw - logging failures should not break the main flow
    return null;
  }

  return data;
}

/**
 * Logs temporal parsing event
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param originalMessage - Original message text
 * @param enrichedMessage - Enriched message with temporal info
 * @param entitiesCount - Number of temporal entities found
 * @param parsingMethod - Method used (duckling or chrono)
 */
export async function logTemporalParsing(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  originalMessage: string,
  enrichedMessage: string,
  entitiesCount: number,
  parsingMethod: string
): Promise<void> {
  await logAIEvent(
    supabase,
    userId,
    conversationId,
    'temporal_enriched',
    `Temporal entities detected and enriched (${parsingMethod})`,
    {
      original_message: originalMessage,
      enriched_message: enrichedMessage,
      entities_count: entitiesCount,
      parsing_method: parsingMethod
    }
  );
}

/**
 * Logs OpenAI API call event
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param aiMode - AI mode (WORKFLOW or WAITING)
 * @param latencyMs - API latency in milliseconds
 * @param tokensUsed - Tokens used by the API call
 * @param finishReason - Finish reason from OpenAI
 */
export async function logOpenAICall(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  aiMode: string,
  latencyMs: number,
  tokensUsed: any,
  finishReason: string
): Promise<void> {
  await logAIEvent(
    supabase,
    userId,
    conversationId,
    'openai_call',
    `OpenAI API called in ${aiMode} mode`,
    {
      ai_mode: aiMode,
      latency_ms: latencyMs,
      tokens_used: tokensUsed,
      finish_reason: finishReason
    }
  );
}

/**
 * Logs appointment creation event
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param appointmentId - Created appointment ID
 * @param appointmentData - Appointment data
 */
export async function logAppointmentCreation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  appointmentId: string,
  appointmentData: any
): Promise<void> {
  await logAIEvent(
    supabase,
    userId,
    conversationId,
    'appointment_created',
    'Appointment created successfully',
    {
      appointment_id: appointmentId,
      appointment_date: appointmentData.appointment_date,
      start_time: appointmentData.appointment_time,
      duration: appointmentData.duration,
      total_price: appointmentData.total_price
    }
  );
}

/**
 * Logs arrival detection event
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param clientHasArrived - Whether client arrival was detected
 * @param confidence - Confidence level
 */
export async function logArrivalDetection(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  clientHasArrived: boolean,
  confidence: string
): Promise<void> {
  await logAIEvent(
    supabase,
    userId,
    conversationId,
    'arrival_detection',
    clientHasArrived ? 'Client arrival detected' : 'No arrival detected',
    {
      client_has_arrived: clientHasArrived,
      confidence: confidence
    }
  );
}

/**
 * Logs validation error event
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param validationType - Type of validation that failed
 * @param errors - Array of error messages
 */
export async function logValidationError(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  validationType: string,
  errors: string[]
): Promise<void> {
  await logAIEvent(
    supabase,
    userId,
    conversationId,
    'validation_error',
    `Validation failed: ${validationType}`,
    {
      validation_type: validationType,
      errors: errors
    }
  );
}

/**
 * Logs general error event
 * 
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param errorMessage - Error message
 * @param errorStack - Error stack trace (optional)
 */
export async function logError(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  errorMessage: string,
  errorStack?: string
): Promise<void> {
  await logAIEvent(
    supabase,
    userId,
    conversationId,
    'error',
    errorMessage,
    {
      error_stack: errorStack
    }
  );
}
