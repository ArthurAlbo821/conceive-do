/**
 * Temporal enrichment utilities
 * Enriches messages with parsed temporal information for better AI understanding
 */

import { TEMPORAL_CONFIG } from '../config.ts';
import type { TemporalEntity } from '../types.ts';

/**
 * Detects if a text contains relative time expressions
 * 
 * Relative expressions should NOT be parsed/enriched to avoid confusion
 * The AI needs conversational context to understand them correctly
 * 
 * Examples of RELATIVE expressions:
 * - "dans 50min" → needs conversation context (from when?)
 * - "pour 1h" → ambiguous (for how long? starting when?)
 * - "dans 2 heures" → relative to current conversation
 * 
 * Examples of ABSOLUTE expressions:
 * - "à 14h20" → clear absolute time
 * - "demain à 15h" → clear date and time
 * 
 * @param text - Text to check for relative time expressions
 * @returns true if text contains relative keywords, false otherwise
 * 
 * @example
 * isRelativeTimeExpression("dans 50min"); // true
 * isRelativeTimeExpression("à 14h20");    // false
 */
export function isRelativeTimeExpression(text: string): boolean {
  return TEMPORAL_CONFIG.RELATIVE_TIME_KEYWORDS.test(text);
}

/**
 * Enriches a message with parsed temporal information
 * 
 * IMPORTANT: Only ABSOLUTE time expressions are enriched
 * Relative expressions (e.g., "dans 50min") are skipped because they require
 * conversational context that the AI can better handle
 * 
 * The enrichment adds formatted temporal info at the end of the message:
 * 
 * Original: "Je peux venir à 14h20"
 * Enriched: "Je peux venir à 14h20
 * 
 * [Informations temporelles détectées:
 * - "à 14h20" = jeudi 14 novembre 2024, 14:20 (2024-11-14T14:20:00.000Z)]"
 * 
 * @param originalMessage - Original message text
 * @param entities - Temporal entities parsed from the message
 * @returns Enriched message with temporal info, or original if no entities
 * 
 * @example
 * const entities = [{ 
 *   body: "à 14h20", 
 *   dim: "time", 
 *   value: { value: "2024-11-14T14:20:00.000Z" } 
 * }];
 * const enriched = enrichMessageWithTemporal("Rdv à 14h20", entities);
 */
export function enrichMessageWithTemporal(
  originalMessage: string,
  entities: TemporalEntity[]
): string {
  if (entities.length === 0) {
    return originalMessage;
  }

  let enrichedMessage = originalMessage;

  // Filter to keep only absolute time expressions
  // Relative expressions (e.g., "dans 50min", "pour 1h") are skipped
  const timeEntities = entities.filter((e) => {
    // Only keep 'time' entities with values
    if (e.dim !== 'time' || !e.value.value) {
      return false;
    }

    // Skip relative time expressions - let AI handle them with conversational context
    if (isRelativeTimeExpression(e.body)) {
      console.log('[temporal] Skipping relative expression:', e.body);
      return false;
    }

    return true;
  });

  if (timeEntities.length > 0) {
    enrichedMessage += '\n\n[Informations temporelles détectées:';
    
    for (const entity of timeEntities) {
      const originalText = entity.body;
      const parsedValue = entity.value.value;
      
      if (parsedValue) {
        const date = new Date(parsedValue);
        const formatted = date.toLocaleString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        enrichedMessage += `\n- "${originalText}" = ${formatted} (${parsedValue})`;
      }
    }
    
    enrichedMessage += ']';
  }

  return enrichedMessage;
}

/**
 * Extracts all absolute temporal expressions from entities
 * Filters out relative expressions
 * 
 * @param entities - Temporal entities to filter
 * @returns Array of absolute temporal entities
 */
export function extractAbsoluteExpressions(entities: TemporalEntity[]): TemporalEntity[] {
  return entities.filter((e) => {
    if (e.dim !== 'time' || !e.value.value) {
      return false;
    }
    return !isRelativeTimeExpression(e.body);
  });
}

/**
 * Extracts all relative temporal expressions from entities
 * 
 * @param entities - Temporal entities to filter
 * @returns Array of relative temporal entities
 */
export function extractRelativeExpressions(entities: TemporalEntity[]): TemporalEntity[] {
  return entities.filter((e) => {
    if (e.dim !== 'time') {
      return false;
    }
    return isRelativeTimeExpression(e.body);
  });
}

/**
 * Formats a temporal entity for logging or display
 * 
 * @param entity - Temporal entity to format
 * @returns Formatted string representation
 */
export function formatTemporalEntity(entity: TemporalEntity): string {
  const date = new Date(entity.value.value);
  const formatted = date.toLocaleString('fr-FR', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `"${entity.body}" → ${formatted}`;
}
