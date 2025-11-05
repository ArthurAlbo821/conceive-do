/**
 * Temporal parsing orchestrator
 * Coordinates between Duckling (primary) and Chrono-node (fallback)
 */

import { parseDucklingEntities, isDucklingConfigured } from './duckling.ts';
import { parseChronoEntities } from './chrono.ts';
import { enrichMessageWithTemporal } from './enrichment.ts';
import type { TemporalEntity, TemporalParseResult } from '../types.ts';

/**
 * Main temporal parsing function with smart fallback
 * 
 * Strategy:
 * 1. Try Duckling first (more accurate for French, self-hosted on Railway)
 * 2. If Duckling fails or returns no entities → fallback to Chrono-node (local)
 * 
 * This ensures we always get temporal parsing even if external API is down
 * 
 * @param text - Text to parse for temporal expressions
 * @param referenceTime - Reference time for relative expressions (optional)
 * @returns Array of temporal entities
 * 
 * @example
 * const entities = await parseTemporalEntities("Rdv à 14h20", new Date());
 * // Returns entities from Duckling or Chrono, whichever succeeds
 */
export async function parseTemporalEntities(
  text: string,
  referenceTime?: Date
): Promise<TemporalEntity[]> {
  const refTime = referenceTime || new Date();
  
  console.log('[temporal] Parsing text:', text);
  console.log('[temporal] Reference time:', refTime.toISOString());

  // 1️⃣ Try Duckling first (more accurate for French)
  try {
    console.log('[temporal] Trying Duckling (primary)...');
    const ducklingEntities = await parseDucklingEntities(text);
    
    if (ducklingEntities && ducklingEntities.length > 0) {
      console.log('[temporal] ✅ Duckling succeeded with', ducklingEntities.length, 'entities');
      return ducklingEntities;
    }
    
    console.log('[temporal] ⚠️ Duckling returned no entities, trying Chrono-node fallback...');
  } catch (ducklingError) {
    console.warn('[temporal] ⚠️ Duckling failed, trying Chrono-node fallback:', ducklingError);
  }

  // 2️⃣ Fallback to Chrono-node (local, no external API dependency)
  try {
    console.log('[temporal] Using Chrono-node fallback...');
    const chronoEntities = await parseChronoEntities(text, refTime);

    console.log('[temporal] Chrono-node found', chronoEntities.length, 'temporal entities');

    if (chronoEntities.length > 0) {
      console.log('[temporal] ✅ Chrono-node succeeded');
    } else {
      console.log('[temporal] ❌ No temporal entities found by either parser');
    }

    return chronoEntities;
  } catch (error) {
    console.error('[temporal] ❌ Both parsers failed:', error);
    return [];
  }
}

/**
 * Complete temporal parsing workflow with enrichment
 * 
 * This is the main function to use in the application flow:
 * 1. Parse temporal entities (Duckling → Chrono fallback)
 * 2. Enrich message with absolute temporal info (skip relatives)
 * 3. Return both entities and enriched message
 * 
 * @param text - Text to parse
 * @param referenceTime - Reference time (optional)
 * @returns Object with entities, enriched message, and parsing method used
 * 
 * @example
 * const result = await parseAndEnrichMessage("Rdv à 14h20", new Date());
 * // {
 * //   entities: [...],
 * //   enrichedMessage: "Rdv à 14h20\n\n[Informations temporelles...]",
 * //   parsingMethod: "duckling"
 * // }
 */
export async function parseAndEnrichMessage(
  text: string,
  referenceTime?: Date
): Promise<{
  entities: TemporalEntity[];
  enrichedMessage: string;
  parsingMethod: 'duckling' | 'chrono' | 'none';
}> {
  const refTime = referenceTime || new Date();

  // Parse entities
  const entities = await parseTemporalEntities(text, refTime);

  // Determine which method was used (for logging)
  let parsingMethod: 'duckling' | 'chrono' | 'none' = 'none';
  if (entities.length > 0) {
    // If Duckling is configured and worked, it was used
    // Otherwise, Chrono was used
    parsingMethod = isDucklingConfigured() ? 'duckling' : 'chrono';
  }

  // Enrich message
  const enrichedMessage = enrichMessageWithTemporal(text, entities);

  return {
    entities,
    enrichedMessage,
    parsingMethod
  };
}

/**
 * Legacy function for backward compatibility
 * 
 * DEPRECATED: Use parseTemporalEntities() or parseAndEnrichMessage() instead
 * This function exists to maintain compatibility with old code
 * 
 * @param text - Text to parse
 * @param referenceTime - Reference time (optional)
 * @returns Parse result with entities and method
 */
export async function parseTemporalWithFallback(
  text: string,
  referenceTime?: Date
): Promise<TemporalParseResult> {
  const refTime = referenceTime || new Date();

  // Try Duckling first (if DUCKLING_API_URL is configured)
  const ducklingUrl = Deno.env.get('DUCKLING_API_URL');
  if (ducklingUrl) {
    console.log('[temporal] Attempting Duckling parse...');
    try {
      const entities = await parseDucklingEntities(text);
      console.log('[temporal] ✅ Duckling parse successful');
      return { entities, method: 'duckling' };
    } catch (error) {
      console.log('[temporal] ⚠️ Duckling failed, falling back to Chrono-node');
      console.log('[temporal] Duckling error:', error instanceof Error ? error.message : String(error));
    }
  } else {
    console.log('[temporal] DUCKLING_API_URL not configured, using Chrono-node');
  }

  // Fallback to Chrono-node
  const entities = await parseChronoEntities(text, refTime);
  console.log('[temporal] ✅ Chrono-node parse successful');
  return { entities, method: 'chrono' };
}

// Re-export enrichment function for convenience
export { enrichMessageWithTemporal } from './enrichment.ts';
