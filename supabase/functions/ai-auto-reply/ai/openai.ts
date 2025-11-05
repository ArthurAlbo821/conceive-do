/**
 * OpenAI API client
 * Handles all interactions with OpenAI API for AI responses
 */

import { OPENAI_CONFIG } from '../config.ts';
import type { 
  OpenAIRequestBody, 
  OpenAIResponse, 
  OpenAIMessage,
  OpenAITool,
  OpenAIResponseFormat,
  Message,
  AIMode
} from '../types.ts';

/**
 * Builds OpenAI request body based on AI mode
 * 
 * WORKFLOW mode:
 * - Enables function calling (create_appointment_summary)
 * - Returns plain text responses
 * 
 * WAITING mode:
 * - Uses JSON structured output (no function calling)
 * - Returns JSON with message, client_has_arrived, confidence
 * 
 * @param systemPrompt - System prompt string
 * @param conversationHistory - Array of messages
 * @param aiMode - AI mode (WORKFLOW or WAITING)
 * @param appointmentTool - Appointment tool for function calling (WORKFLOW mode only)
 * @returns OpenAI request body
 */
export function buildOpenAIRequest(
  systemPrompt: string,
  conversationHistory: OpenAIMessage[],
  aiMode: AIMode,
  appointmentTool?: OpenAITool
): OpenAIRequestBody {
  const requestBody: OpenAIRequestBody = {
    model: OPENAI_CONFIG.MODEL,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      ...conversationHistory
    ],
    temperature: OPENAI_CONFIG.TEMPERATURE,
    max_tokens: OPENAI_CONFIG.MAX_TOKENS
  };

  // WORKFLOW mode: Enable function calling
  if (aiMode === 'WORKFLOW' && appointmentTool) {
    requestBody.tools = [appointmentTool];
    requestBody.tool_choice = 'auto';
  }

  // WAITING mode: Use JSON structured output for arrival detection
  if (aiMode === 'WAITING') {
    requestBody.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'ai_waiting_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to send to the client'
            },
            client_has_arrived: {
              type: 'boolean',
              description: 'Whether the client has indicated they have arrived based on context analysis'
            },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Confidence level of the arrival detection'
            }
          },
          required: ['message', 'client_has_arrived', 'confidence'],
          additionalProperties: false
        }
      }
    };
  }

  return requestBody;
}

/**
 * Converts conversation messages to OpenAI format
 * 
 * @param messages - Array of conversation messages
 * @param enrichedLastMessage - Enriched version of last message (with temporal info)
 * @returns Array of OpenAI messages
 */
export function formatMessagesForOpenAI(
  messages: Message[],
  enrichedLastMessage?: string
): OpenAIMessage[] {
  return messages.map((msg, index) => {
    // Use enriched message for the last incoming message
    const isLastMessage = index === messages.length - 1 && msg.direction === 'incoming';
    
    return {
      role: msg.direction === 'incoming' ? 'user' : 'assistant',
      content: isLastMessage && enrichedLastMessage ? enrichedLastMessage : msg.content
    };
  });
}

/**
 * Calls OpenAI API
 * 
 * @param requestBody - OpenAI request body
 * @param apiKey - OpenAI API key
 * @returns OpenAI response
 * @throws Error if API call fails after retries
 */
export async function callOpenAI(
  requestBody: OpenAIRequestBody,
  apiKey: string
): Promise<OpenAIResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[openai] API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data: OpenAIResponse = await response.json();
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extracts the message content from OpenAI response
 * Handles both normal responses and JSON responses (WAITING mode)
 * 
 * @param response - OpenAI response
 * @returns Message content string, or empty string if structure is invalid
 */
export function extractMessageContent(response: OpenAIResponse): string {
  // Validate response is an object
  if (!response || typeof response !== 'object') {
    console.error('[openai] Invalid response: not an object');
    return '';
  }

  // Validate choices array exists and has at least one element
  if (!Array.isArray(response.choices) || response.choices.length === 0) {
    console.error('[openai] Invalid response: choices array is missing or empty');
    return '';
  }

  // Validate first choice has a message object
  const firstChoice = response.choices[0];
  if (!firstChoice || typeof firstChoice !== 'object' || !firstChoice.message) {
    console.error('[openai] Invalid response: first choice or message is missing');
    return '';
  }

  // Validate message.content is a string
  const content = firstChoice.message.content;
  if (typeof content !== 'string') {
    console.error('[openai] Invalid response: message.content is not a string');
    return '';
  }

  return content;
}

/**
 * Checks if OpenAI response contains a tool call
 * 
 * @param response - OpenAI response
 * @returns true if tool call present, false otherwise
 */
export function hasToolCall(response: OpenAIResponse): boolean {
  // Validate response structure first
  if (!response || typeof response !== 'object') {
    return false;
  }

  if (!Array.isArray(response.choices) || response.choices.length === 0) {
    return false;
  }

  const firstChoice = response.choices[0];
  if (!firstChoice || typeof firstChoice !== 'object') {
    return false;
  }
  
  return firstChoice.finish_reason === 'tool_calls' && 
         !!firstChoice.message?.tool_calls;
}

/**
 * Extracts tool call from OpenAI response
 *
 * @param response - OpenAI response
 * @returns Tool call object or null if none
 */
export function extractToolCall(response: OpenAIResponse) {
  if (!hasToolCall(response)) {
    return null;
  }

  // Additional validation for tool_calls array
  const toolCalls = response.choices[0]?.message?.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    console.error('[openai] Tool calls array is missing or empty');
    return null;
  }

  return toolCalls[0];
}

/**
 * Executes complete OpenAI request flow
 * Orchestrates: build request → format messages → call API → measure latency
 *
 * @param systemPrompt - System prompt string
 * @param messages - Conversation messages
 * @param enrichedLastMessage - Enriched last message with temporal info
 * @param aiMode - AI mode (WORKFLOW or WAITING)
 * @param appointmentTool - Appointment tool for function calling (WORKFLOW only)
 * @returns Object with response and latency in milliseconds
 *
 * @example
 * const { response, latencyMs } = await executeOpenAIRequest(
 *   systemPrompt,
 *   messages,
 *   enrichedMessage,
 *   'WORKFLOW',
 *   appointmentTool
 * );
 * console.log(`OpenAI responded in ${latencyMs}ms`);
 */
export async function executeOpenAIRequest(
  systemPrompt: string,
  messages: Message[],
  enrichedLastMessage: string | undefined,
  aiMode: AIMode,
  appointmentTool?: OpenAITool,
  apiKey?: string
): Promise<{ response: OpenAIResponse; latencyMs: number }> {
  // Get OpenAI API key from parameter or environment
  // Parameter takes precedence (for dependency injection in tests)
  const openaiApiKey = apiKey || Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  // Format conversation messages for OpenAI
  const formattedMessages = formatMessagesForOpenAI(messages, enrichedLastMessage);

  // Build request body based on AI mode
  const requestBody = buildOpenAIRequest(
    systemPrompt,
    formattedMessages,
    aiMode,
    appointmentTool
  );

  // Call OpenAI API and measure latency
  const startTime = Date.now();
  const response = await callOpenAI(requestBody, openaiApiKey);
  const latencyMs = Date.now() - startTime;

  return { response, latencyMs };
}
