/**
 * Chrono-node temporal parsing (fallback)
 * Local parser, no external API dependency
 * 
 * Chrono-node is a JavaScript library for parsing natural language dates
 * We use the French parser (chrono.fr) for French temporal expressions
 */

import * as chrono from 'https://esm.sh/chrono-node@2.9.0';
import type { TemporalEntity, ChronoResult } from '../types.ts';

/**
 * Parses temporal entities using Chrono-node (local parser)
 * This is the fallback when Duckling API is unavailable or fails
 * 
 * Chrono-node results are converted to Duckling-compatible format
 * for consistency across the system
 * 
 * @param text - Text to parse for temporal expressions
 * @param referenceTime - Reference time for relative expressions (optional)
 * @returns Array of temporal entities in Duckling-compatible format
 * 
 * @example
 * const entities = await parseChronoEntities("dans 1h", new Date());
 * // [{ body: "dans 1h", dim: "time", value: { value: "2025-01-15T15:00:00.000Z" }, ... }]
 */
export function parseChronoEntities(
  text: string,
  referenceTime?: Date
): TemporalEntity[] {
  const refTime = referenceTime || new Date();

  console.log('[chrono] Parsing text:', text);
  console.log('[chrono] Reference time:', refTime.toISOString());

  try {
    // Use French parser for French temporal expressions
    const results: ChronoResult[] = chrono.fr.parse(text, refTime);

    console.log('[chrono] Found', results.length, 'temporal entities');

    // Convert Chrono results to Duckling-compatible format for backward compatibility
    const entities: TemporalEntity[] = results.map((result) => {
      const parsedDate = result.start.date();
      return {
        body: result.text,
        dim: 'time',
        value: {
          value: parsedDate.toISOString(),
          grain: 'hour' // Chrono doesn't provide grain, default to hour
        },
        start: result.index,
        end: result.index + result.text.length
      };
    });

    if (entities.length > 0) {
      console.log('[chrono] Parsed entities:', JSON.stringify(entities, null, 2));
    }

    return entities;
  } catch (error) {
    console.error('[chrono] Parse error:', error);
    return []; // Return empty array on error instead of throwing
  }
}

/**
 * Checks if a text contains any temporal expressions detectable by Chrono
 * 
 * @param text - Text to check
 * @param referenceTime - Reference time (optional)
 * @returns true if temporal expressions found, false otherwise
 */
export function hasTemporalExpression(text: string, referenceTime?: Date): boolean {
  const refTime = referenceTime || new Date();
  const results = chrono.fr.parse(text, refTime);
  return results.length > 0;
}
