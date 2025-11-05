/**
 * Appointment tool definition for OpenAI function calling
 * Builds the JSON schema with dynamic enums from user catalog
 */

import type { OpenAITool, DynamicEnums } from '../types.ts';

/**
 * Builds appointment tool definition for OpenAI function calling
 * 
 * This tool uses STRICT enums to prevent AI hallucinations:
 * - Duration enum: Only durations from user's tarifs
 * - Extras enum: Only extras from user's catalog
 * 
 * The AI can ONLY use values from these enums, ensuring zero hallucination
 * 
 * @param dynamicEnums - Dynamic enums built from user catalog
 * @returns OpenAI tool definition
 * 
 * @example
 * const tool = buildAppointmentTool({
 *   prestationEnum: ['GFE', 'PSE'],
 *   extraEnum: ['Anal', 'Duo'],
 *   durationEnum: ['30min', '1h', '2h']
 * });
 */
export function buildAppointmentTool(dynamicEnums: DynamicEnums): OpenAITool {
  const { durationEnum, extraEnum } = dynamicEnums;

  return {
    type: 'function',
    function: {
      name: 'create_appointment_summary',
      description: "Crée un résumé de rendez-vous avec toutes les informations collectées. N'utilise cette fonction QUE lorsque tu as obtenu TOUTES les 4 informations obligatoires ET que le client a confirmé.",
      parameters: {
        type: 'object',
        properties: {
          duration: {
            type: 'string',
            enum: durationEnum.length > 0 ? durationEnum : ['30min'],
            description: "Durée du rendez-vous (format: '30min', '1h', etc.)"
          },
          selected_extras: {
            type: 'array',
            items: {
              type: 'string',
              enum: extraEnum.length > 0 ? extraEnum : ['aucun']
            },
            description: 'Liste des extras choisis (peut être vide [])'
          },
          appointment_date: {
            type: 'string',
            description: 'Date du rendez-vous (format: YYYY-MM-DD)',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          },
          appointment_time: {
            type: 'string',
            description: 'Heure du rendez-vous (format: HH:MM en 24h, ex: 14:30)',
            pattern: '^([01]\\d|2[0-3]):[0-5]\\d$'
          }
        },
        required: ['duration', 'selected_extras', 'appointment_date', 'appointment_time'],
        additionalProperties: false
      }
    }
  };
}
