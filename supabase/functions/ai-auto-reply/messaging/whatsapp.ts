/**
 * WhatsApp messaging utilities
 * Sends messages via send-whatsapp-message Edge Function
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

/**
 * Sends a WhatsApp message to a conversation
 * 
 * Uses the send-whatsapp-message Edge Function which:
 * 1. Validates conversation exists
 * 2. Sends message via Baileys
 * 3. Logs message to database
 * 
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @param message - Message content to send
 * @returns Response from send-whatsapp-message function
 * @throws Error if message sending fails
 * 
 * @example
 * await sendWhatsAppMessage(supabase, conversation_id, "C'est confirmé ! ...");
 */
export async function sendWhatsAppMessage(
  supabase: SupabaseClient,
  conversationId: string,
  message: string
): Promise<any> {
  console.log('[whatsapp] Sending message to conversation:', conversationId);
  console.log('[whatsapp] Message length:', message.length, 'chars');

  const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
    body: {
      conversation_id: conversationId,
      message: message
    }
  });

  if (error) {
    console.error('[whatsapp] Error sending message:', error);
    throw new Error(`Failed to send WhatsApp message: ${error.message}`);
  }

  console.log('[whatsapp] Message sent successfully');
  return data;
}

/**
 * Sends a WhatsApp message with retry logic
 * Retries up to 3 times with exponential backoff
 * 
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @param message - Message content
 * @param maxRetries - Maximum number of retries (default: 3)
 * @returns Response from send-whatsapp-message function
 */
export async function sendWhatsAppMessageWithRetry(
  supabase: SupabaseClient,
  conversationId: string,
  message: string,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[whatsapp] Attempt ${attempt}/${maxRetries}`);
      return await sendWhatsAppMessage(supabase, conversationId, message);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[whatsapp] Attempt ${attempt} failed:`, lastError.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`[whatsapp] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Failed to send WhatsApp message after retries');
}

/**
 * Sends multiple WhatsApp messages sequentially
 * Useful for sending multiple parts of a conversation
 * 
 * @param supabase - Supabase client
 * @param conversationId - Conversation ID
 * @param messages - Array of messages to send
 * @param delayBetweenMs - Delay between messages in milliseconds (default: 500ms)
 */
export async function sendMultipleWhatsAppMessages(
  supabase: SupabaseClient,
  conversationId: string,
  messages: string[],
  delayBetweenMs: number = 500
): Promise<void> {
  console.log('[whatsapp] Sending', messages.length, 'messages');

  for (let i = 0; i < messages.length; i++) {
    await sendWhatsAppMessage(supabase, conversationId, messages[i]);
    
    // Add delay between messages (except after last message)
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
    }
  }

  console.log('[whatsapp] All messages sent');
}
