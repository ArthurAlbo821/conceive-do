/**
 * Duckling temporal parsing API client
 * Self-hosted on Railway: https://duckling-production-0c9c.up.railway.app
 * 
 * Duckling is a rule-based temporal expression parser that handles French
 * expressions like "dans 1h", "à 14h20", "demain"
 */

import { TEMPORAL_CONFIG } from '../config.ts';
import type { TemporalEntity, DucklingResponse } from '../types.ts';

/**
 * Parses temporal entities using the Duckling API
 * 
 * IMPORTANT: Duckling API can be finicky with request formats
 * We try multiple formats with fallbacks:
 * 1. Form-urlencoded WITHOUT reftime (rasa/duckling has issues with reftime)
 * 2. Form-urlencoded WITH dims parameter for specificity
 * 
 * @param text - Text to parse for temporal expressions
 * @param referenceTime - Reference time for relative expressions (optional)
 * @returns Array of temporal entities found in the text
 * @throws Error if all request formats fail
 * 
 * @example
 * const entities = await parseDucklingEntities("dans 1h", new Date());
 * // [{ body: "dans 1h", dim: "time", value: { value: "2025-01-15T15:00:00.000Z" }, ... }]
 */
export async function parseDucklingEntities(
  text: string,
  referenceTime?: Date
): Promise<TemporalEntity[]> {
  const refTime = referenceTime || new Date();
  const ducklingUrl = Deno.env.get('DUCKLING_API_URL') || 
    'https://duckling-production-0c9c.up.railway.app/parse';

  console.log('[duckling] Parsing text:', text);
  console.log('[duckling] Reference time:', refTime.toISOString());
  console.log('[duckling] URL:', ducklingUrl);

  try {
    // Define multiple request format strategies
    const requestFormats = [
      // Format 1: Form-urlencoded WITHOUT reftime (works with rasa/duckling)
      async () => {
        const params = new URLSearchParams({
          text,
          locale: TEMPORAL_CONFIG.LOCALE
          // Note: reftime causes 502 on rasa/duckling Docker image
        });

        const response = await fetch(ducklingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: AbortSignal.timeout(TEMPORAL_CONFIG.DUCKLING_TIMEOUT_MS)
        });

        return response;
      },

      // Format 2: With dims parameter for specificity
      async () => {
        const params = new URLSearchParams({
          text,
          locale: TEMPORAL_CONFIG.LOCALE,
          dims: 'time'
        });

        const response = await fetch(ducklingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: AbortSignal.timeout(TEMPORAL_CONFIG.DUCKLING_TIMEOUT_MS)
        });

        return response;
      }
    ];

    let lastError: string | null = null;

    // Try each format in sequence
    for (let i = 0; i < requestFormats.length; i++) {
      try {
        console.log(`[duckling] Trying request format ${i + 1}/${requestFormats.length}`);
        const response = await requestFormats[i]();

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          console.log(`[duckling] Format ${i + 1} failed: ${lastError}`);
          continue;
        }

        const responseText = await response.text();

        // Check if response is valid JSON
        let entities: DucklingResponse;
        try {
          entities = JSON.parse(responseText);
        } catch {
          // Not JSON, might be error message
          lastError = `Non-JSON response: ${responseText.substring(0, 100)}`;
          console.log(`[duckling] Format ${i + 1} returned non-JSON: ${lastError}`);
          continue;
        }

        // Success!
        console.log('[duckling] Found', entities.length, 'temporal entities');
        if (entities.length > 0) {
          console.log('[duckling] Parsed entities:', JSON.stringify(entities, null, 2));
        }

        return entities;

      } catch (formatError) {
        lastError = formatError instanceof Error ? formatError.message : String(formatError);
        console.log(`[duckling] Format ${i + 1} threw error: ${lastError}`);
      }
    }

    // All formats failed
    throw new Error(`All request formats failed. Last error: ${lastError}`);

  } catch (error) {
    console.error('[duckling] Parse error:', error);
    throw error; // Re-throw to trigger fallback
  }
}

/**
 * Checks if Duckling API is available
 * Useful for health checks or conditional logic
 * 
 * @returns true if Duckling URL is configured, false otherwise
 */
export function isDucklingConfigured(): boolean {
  return !!Deno.env.get('DUCKLING_API_URL');
}
