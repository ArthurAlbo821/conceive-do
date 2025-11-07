/**
 * Conversation Context Analyzer
 * 
 * Analyzes conversation history to determine if client's message is responding to:
 * - DURATION question (e.g., "How long?" → "1h" means duration)
 * - TIME question (e.g., "What time?" → "1h" or "in 1h" means appointment time)
 * - UNKNOWN (ambiguous context)
 * 
 * This prevents Duckling from incorrectly parsing duration responses as time values.
 * 
 * Example problem:
 * - AI: "How long do you want to come for?"
 * - Client: "1h"
 * - Duckling thinks: "1h" = 13:00 (time) ❌
 * - Should be: "1h" = 1 hour (duration) ✓
 * 
 * Solution:
 * - Analyze last 5 messages
 * - Detect if AI asked about duration or time
 * - Return context type
 * - Skip temporal enrichment if DURATION context
 */

import type { Message } from '../types.ts';

/**
 * Context type returned by analysis
 */
export type ContextType = 'DURATION' | 'TIME' | 'UNKNOWN';

/**
 * Result of context analysis
 */
export interface ContextAnalysisResult {
  contextType: ContextType;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
  latencyMs: number;
}

/**
 * Type guard to check if value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates and returns a ContextType or null if invalid
 */
function validateContextType(value: unknown): ContextType | null {
  const validTypes: ContextType[] = ['DURATION', 'TIME', 'UNKNOWN'];
  if (typeof value === 'string' && validTypes.includes(value as ContextType)) {
    return value as ContextType;
  }
  return null;
}

/**
 * Validates and returns confidence level or null if invalid
 */
function validateConfidence(value: unknown): 'high' | 'medium' | 'low' | null {
  const validLevels = ['high', 'medium', 'low'];
  if (typeof value === 'string' && validLevels.includes(value)) {
    return value as 'high' | 'medium' | 'low';
  }
  return null;
}

/**
 * Analyzes conversation context to determine message intent
 * 
 * @param messages - Recent conversation history (chronological order, oldest first)
 * @param currentMessage - Current client message to analyze
 * @param openaiApiKey - OpenAI API key
 * @returns Context analysis result
 * 
 * @example
 * const result = await analyzeConversationContext(messages, "1h", apiKey);
 * if (result.contextType === 'DURATION') {
 *   // Don't enrich - it's a duration, not a time
 * }
 */
export async function analyzeConversationContext(
  messages: Message[],
  currentMessage: string,
  openaiApiKey: string
): Promise<ContextAnalysisResult> {
  const startTime = Date.now();

  console.log('[context-analyzer] 🔍 Analyzing conversation context...');
  console.log('[context-analyzer] Current message:', currentMessage);
  console.log('[context-analyzer] History length:', messages.length);

  // Edge cases: Not enough context
  if (messages.length < 2) {
    console.log('[context-analyzer] ⚠️ Not enough history (<2 messages), returning UNKNOWN');
    return {
      contextType: 'UNKNOWN',
      confidence: 'low',
      reasoning: 'Insufficient conversation history',
      latencyMs: Date.now() - startTime
    };
  }

  // Edge cases: First message of conversation
  const hasAnyOutgoingMessage = messages.some(m => m.direction === 'outgoing');
  if (!hasAnyOutgoingMessage) {
    console.log('[context-analyzer] ⚠️ No AI messages in history, returning UNKNOWN');
    return {
      contextType: 'UNKNOWN',
      confidence: 'low',
      reasoning: 'No AI messages in history yet',
      latencyMs: Date.now() - startTime
    };
  }

  // Get last 5 messages for context (limit to reduce cost)
  const recentMessages = messages.slice(-5);
  console.log('[context-analyzer] Using', recentMessages.length, 'recent messages');

  // Build prompt for OpenAI
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(recentMessages, currentMessage);

  try {
    // Call OpenAI for analysis
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.0,  // Deterministic
        max_tokens: 150,   // Enough space for complete JSON response
        response_format: { type: 'json_object' }  // Structured output
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[context-analyzer] ❌ OpenAI API error:', response.status, errorText);
      
      // Fallback to UNKNOWN on error
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'API error: ' + errorText.substring(0, 100),
        latencyMs: Date.now() - startTime
      };
    }

    // Parse and validate OpenAI response with comprehensive error handling
    let data: unknown;
    try {
      data = await response.json();
    } catch (parseError) {
      const latencyMs = Date.now() - startTime;
      console.error('[context-analyzer] ❌ Failed to parse JSON response:', parseError);
      console.log('[context-analyzer] Latency:', latencyMs, 'ms');
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'Failed to parse API response',
        latencyMs
      };
    }

    // Validate response structure
    if (!isObject(data)) {
      const latencyMs = Date.now() - startTime;
      console.error('[context-analyzer] ❌ Response is not an object:', typeof data);
      console.log('[context-analyzer] Latency:', latencyMs, 'ms');
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'Invalid API response structure',
        latencyMs
      };
    }

    if (!Array.isArray(data.choices) || data.choices.length === 0) {
      const latencyMs = Date.now() - startTime;
      console.error('[context-analyzer] ❌ Response missing choices array:', data);
      console.log('[context-analyzer] Latency:', latencyMs, 'ms');
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'Invalid API response: missing choices',
        latencyMs
      };
    }

    const firstChoice = data.choices[0];
    if (!isObject(firstChoice) || !isObject(firstChoice.message)) {
      const latencyMs = Date.now() - startTime;
      console.error('[context-analyzer] ❌ Invalid choice structure:', firstChoice);
      console.log('[context-analyzer] Latency:', latencyMs, 'ms');
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'Invalid API response: malformed choice',
        latencyMs
      };
    }

    const content = firstChoice.message.content;
    if (typeof content !== 'string') {
      const latencyMs = Date.now() - startTime;
      console.error('[context-analyzer] ❌ Message content is not a string:', typeof content);
      console.log('[context-analyzer] Latency:', latencyMs, 'ms');
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'Invalid API response: content not a string',
        latencyMs
      };
    }

    // Parse the content JSON
    let parsedResult: unknown;
    try {
      parsedResult = JSON.parse(content);
    } catch (contentParseError) {
      const latencyMs = Date.now() - startTime;
      console.error('[context-analyzer] ❌ Failed to parse content JSON:', contentParseError);
      console.log('[context-analyzer] Content was:', content.substring(0, 200));
      
      // Try to extract context_type using regex as fallback
      console.log('[context-analyzer] Attempting to extract context_type from incomplete JSON...');
      const match = content.match(/"context_type"\s*:\s*"(DURATION|TIME|UNKNOWN)"/);
      
      if (match && match[1]) {
        const extractedType = match[1] as ContextType;
        console.log('[context-analyzer] ✅ Extracted context_type:', extractedType);
        console.log('[context-analyzer] Latency:', latencyMs, 'ms');
        return {
          contextType: extractedType,
          confidence: 'medium',
          reasoning: 'Extracted from incomplete JSON response',
          latencyMs
        };
      }
      
      console.log('[context-analyzer] ❌ Could not extract context_type from content');
      console.log('[context-analyzer] Latency:', latencyMs, 'ms');
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'Failed to parse AI response content',
        latencyMs
      };
    }

    // Validate parsed result structure
    if (!isObject(parsedResult)) {
      const latencyMs = Date.now() - startTime;
      console.error('[context-analyzer] ❌ Parsed result is not an object:', typeof parsedResult);
      console.log('[context-analyzer] Latency:', latencyMs, 'ms');
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'Invalid AI response format',
        latencyMs
      };
    }

    // Validate and extract context_type
    const contextType = validateContextType(parsedResult.context_type);
    if (!contextType) {
      const latencyMs = Date.now() - startTime;
      console.error('[context-analyzer] ❌ Invalid context_type:', parsedResult.context_type);
      console.log('[context-analyzer] Latency:', latencyMs, 'ms');
      return {
        contextType: 'UNKNOWN',
        confidence: 'low',
        reasoning: 'Invalid context_type value in response',
        latencyMs
      };
    }

    // Validate and extract confidence
    const confidence = validateConfidence(parsedResult.confidence);
    if (!confidence) {
      const latencyMs = Date.now() - startTime;
      console.warn('[context-analyzer] ⚠️ Invalid confidence:', parsedResult.confidence, '- defaulting to "low"');
    }

    // Extract reasoning (should be a string)
    const reasoning = typeof parsedResult.reasoning === 'string' 
      ? parsedResult.reasoning 
      : 'No reasoning provided';

    const latencyMs = Date.now() - startTime;
    
    console.log('[context-analyzer] ✅ Analysis result:', contextType);
    console.log('[context-analyzer] Confidence:', confidence || 'low');
    console.log('[context-analyzer] Reasoning:', reasoning);
    console.log('[context-analyzer] Latency:', latencyMs, 'ms');

    return {
      contextType,
      confidence: confidence || 'low',
      reasoning,
      latencyMs
    };

  } catch (error) {
    console.error('[context-analyzer] ❌ Error during analysis:', error);
    
    // Fallback to UNKNOWN on error
    return {
      contextType: 'UNKNOWN',
      confidence: 'low',
      reasoning: 'Analysis failed: ' + (error instanceof Error ? error.message : String(error)),
      latencyMs: Date.now() - startTime
    };
  }
}

/**
 * Builds system prompt for context analysis
 * This prompt teaches the AI how to analyze conversation context
 */
function buildSystemPrompt(): string {
  return `You are a conversation context analyzer for a booking system.

Your task: Determine if a client's message is responding to a DURATION question or a TIME question.

DURATION = How long the appointment lasts (30min, 1h, 2h)
- Keywords in AI's question: "combien de temps", "quelle durée", "30min ou 1h"
- Client's answer means: duration of service

TIME = When the appointment happens (14h, in 30min, tomorrow)
- Keywords in AI's question: "quelle heure", "à quelle heure", "quand", "tu peux quand"
- Client's answer means: time/moment of appointment

IMPORTANT: The same text like "1h" can mean DIFFERENT things:
- If AI asked "combien de temps?" → Client says "1h" = DURATION (1 hour long)
- If AI asked "à quelle heure?" → Client says "1h" = TIME (at 1pm or in 1 hour)

Analyze the conversation history and determine the context.

Respond ONLY with valid JSON in this exact format:
{
  "context_type": "DURATION" | "TIME" | "UNKNOWN",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation in one sentence"
}

Rules:
- DURATION: if last AI message asks about duration/length
- TIME: if last AI message asks about time/when/hour
- UNKNOWN: if context is ambiguous or unclear
- Be decisive - prefer DURATION or TIME over UNKNOWN when context is clear`;
}

/**
 * Builds user prompt with conversation history
 * Formats messages in a clear way for AI analysis
 */
function buildUserPrompt(messages: Message[], currentMessage: string): string {
  // Format conversation history
  const history = messages
    .map(msg => {
      const sender = msg.direction === 'incoming' ? 'Client' : 'AI';
      const content = msg.content.substring(0, 200); // Limit length to reduce tokens
      return `${sender}: ${content}`;
    })
    .join('\n');

  return `Recent conversation history:
${history}

Current client message: "${currentMessage}"

Question: Is the client responding to a DURATION question or a TIME question?

Analyze the context and respond with JSON.`;
}

/**
 * Simple regex-based fallback analyzer (if AI analysis is disabled)
 * Less intelligent but faster and free
 * 
 * @param messages - Recent messages
 * @param currentMessage - Current message
 * @returns Context type based on pattern matching
 */
export function analyzeWithPatterns(messages: Message[], currentMessage: string): ContextType {
  console.log('[context-analyzer] Using pattern-based fallback');

  // Get last AI message
  const lastAIMessage = [...messages]
    .reverse()
    .find(m => m.direction === 'outgoing');

  if (!lastAIMessage) {
    return 'UNKNOWN';
  }

  const lastAI = lastAIMessage.content.toLowerCase();

  // Duration patterns
  const durationPatterns = [
    'combien de temps',
    'quelle durée',
    '30min ou 1h',
    'pour combien de temps',
    'tu veux venir pour'
  ];

  // Time patterns
  const timePatterns = [
    'quelle heure',
    'à quelle heure',
    'tu peux quand',
    'quand tu veux',
    'pour quand'
  ];

  // Check patterns
  const hasDurationPattern = durationPatterns.some(pattern => lastAI.includes(pattern));
  const hasTimePattern = timePatterns.some(pattern => lastAI.includes(pattern));

  if (hasDurationPattern && !hasTimePattern) {
    console.log('[context-analyzer] Pattern match: DURATION');
    return 'DURATION';
  }

  if (hasTimePattern && !hasDurationPattern) {
    console.log('[context-analyzer] Pattern match: TIME');
    return 'TIME';
  }

  console.log('[context-analyzer] Pattern match: UNKNOWN (ambiguous or no match)');
  return 'UNKNOWN';
}

/**
 * Should we skip temporal enrichment based on context?
 * 
 * @param contextType - Context type from analysis
 * @returns true if enrichment should be skipped
 */
export function shouldSkipEnrichment(contextType: ContextType): boolean {
  // Skip enrichment if client is answering a duration question
  // Because "1h" means "1 hour duration", not "1pm time"
  return contextType === 'DURATION';
}