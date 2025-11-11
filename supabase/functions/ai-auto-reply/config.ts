/**
 * Configuration centralisée pour ai-auto-reply
 * Toutes les constantes magiques extraites ici pour faciliter la maintenance
 * 
 * VARIABLES D'ENVIRONNEMENT REQUISES:
 * ===================================
 * 
 * Pour la production (à configurer dans Supabase Dashboard > Edge Functions > Secrets):
 * 
 * - SUPABASE_ENV: 'production' ou 'prod' (détecte l'environnement de production)
 *   Alternative: ENVIRONMENT='production'
 *   ⚠️ IMPORTANT: Contrairement à NODE_ENV (convention Node.js), SUPABASE_ENV est
 *      la variable recommandée pour les Supabase Edge Functions (Deno runtime)
 * 
 * - ALLOWED_ORIGINS: Liste des origines CORS autorisées, séparées par des virgules
 *   Exemple: 'https://mon-app.vercel.app,https://www.mon-domaine.com'
 *   Alternative: ALLOWED_ORIGIN (pour une seule origine)
 *   ⚠️ OBLIGATOIRE en production - l'application lancera une erreur si non configuré
 * 
 * Pour le développement:
 * - Si SUPABASE_ENV n'est pas défini ou != 'production', le système utilise
 *   automatiquement localhost:5173 et localhost:3000 comme fallback
 */

// ============================================================================
// CORS Configuration
// ============================================================================

/**
 * Génère les en-têtes CORS en validant l'origine de la requête
 * contre une liste blanche configurée via variables d'environnement.
 * 
 * @param requestOrigin - L'origine de la requête HTTP (header Origin)
 * @returns Les en-têtes CORS appropriés
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  const allowedOriginsEnv = Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('ALLOWED_ORIGIN') || '';
  
  // Parse les origines autorisées (séparées par des virgules)
  const allowedOrigins = allowedOriginsEnv
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
  
  // Détection de l'environnement selon les meilleures pratiques Supabase
  // Utilise SUPABASE_ENV au lieu de NODE_ENV (plus approprié pour Deno/Supabase Edge Functions)
  const supabaseEnv = Deno.env.get('SUPABASE_ENV') || Deno.env.get('ENVIRONMENT') || 'development';
  const isProduction = supabaseEnv === 'production' || supabaseEnv === 'prod';
  
  // Vérification stricte en production : les origines CORS doivent être explicitement configurées
  if (allowedOrigins.length === 0) {
    if (isProduction) {
      throw new Error(
        'ALLOWED_ORIGINS must be explicitly set in production environment. ' +
        'Configure ALLOWED_ORIGINS environment variable with comma-separated allowed origins. ' +
        'Current SUPABASE_ENV: ' + supabaseEnv
      );
    }
    // Fallback pour le développement local uniquement
    console.warn(
      '⚠️ ALLOWED_ORIGINS not configured. Using localhost fallback. ' +
      'Set SUPABASE_ENV=production and ALLOWED_ORIGINS in production!'
    );
    allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
  }
  
  // Vérifier et appliquer l'origine de la requête
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  } else if (allowedOrigins.length > 0 && !requestOrigin) {
    // Si pas d'origine dans la requête mais des origines sont configurées,
    // utilise la première origine de la liste (utile pour les requêtes non-browser)
    headers['Access-Control-Allow-Origin'] = allowedOrigins[0];
  }
  // Si l'origine n'est pas autorisée, on n'inclut pas l'en-tête Access-Control-Allow-Origin
  
  return headers;
}

// Export de la constante pour compatibilité (à utiliser seulement si pas d'accès à Request)
// ATTENTION: Utiliser getCorsHeaders() à la place dans les handlers
export const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// ============================================================================
// Timezone Configuration
// ============================================================================
export const USER_TIMEZONE = 'Europe/Paris';

// ============================================================================
// OpenAI Configuration
// ============================================================================
export const OPENAI_CONFIG = {
  MODEL: 'gpt-4o-mini',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 500
} as const;

// ============================================================================
// Temporal Parsing Configuration
// ============================================================================
export const TEMPORAL_CONFIG = {
  // Duckling API timeout in milliseconds
  DUCKLING_TIMEOUT_MS: 10000,
  
  // Locale for temporal parsing
  LOCALE: 'fr_FR',
  
  // Keywords that indicate relative time expressions
  // These should NOT be enriched as they need conversational context
  RELATIVE_TIME_KEYWORDS: /\b(dans|après|avant|d'ici|sous|en|pour)\b/i
} as const;

// ============================================================================
// Conversation Configuration
// ============================================================================
export const CONVERSATION_CONFIG = {
  // Maximum number of messages to include in conversation history
  MAX_HISTORY_MESSAGES: 20,
  
  // Maximum character length for truncating strings in logs
  MAX_LOG_STRING_LENGTH: 10000,
  
  // Maximum character length for log messages
  MAX_LOG_MESSAGE_LENGTH: 5000
} as const;

// ============================================================================
// Appointment Configuration
// ============================================================================
export const APPOINTMENT_CONFIG = {
  // Minimum booking lead time in minutes (client must book at least 15 min ahead)
  MIN_BOOKING_LEAD_TIME_MINUTES: 15,
  
  // Number of days to look ahead for appointments
  APPOINTMENT_LOOKAHEAD_DAYS: 7,
  
  // Default service description
  DEFAULT_SERVICE: 'Toutes prestations incluses'
} as const;

// ============================================================================
// Semantic Matching Configuration (Fuse.js)
// ============================================================================
export const SEMANTIC_MATCHING_CONFIG = {
  // Fuse.js threshold (0.0 = perfect match, 1.0 = match everything)
  THRESHOLD: 0.4,
  
  // Minimum match character length
  MIN_MATCH_CHAR_LENGTH: 2,
  
  // Ignore location of matches in string
  IGNORE_LOCATION: true,
  
  // Use extended search syntax
  USE_EXTENDED_SEARCH: false,
  
  // Include score in results
  INCLUDE_SCORE: true,
  
  // Number of alternative matches to return
  MAX_ALTERNATIVES: 3
} as const;

// ============================================================================
// Days of the week (French)
// ============================================================================
export const DAYS_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi"
] as const;

// ============================================================================
// AI Modes
// ============================================================================
export const AI_MODES = {
  WORKFLOW: 'WORKFLOW',  // No confirmed appointment today - full booking workflow
  WAITING: 'WAITING'     // Confirmed appointment today - just make client wait
} as const;

export type AIMode = typeof AI_MODES[keyof typeof AI_MODES];

// ============================================================================
// Event Types for Logging
// ============================================================================
export const AI_EVENT_TYPES = {
  WEBHOOK_RECEIVED: 'webhook_received',
  TEMPORAL_ENRICHED: 'temporal_enriched',
  USER_DATA_FETCHED: 'user_data_fetched',
  AVAILABILITIES_COMPUTED: 'availabilities_computed',
  AI_PROMPT_BUILT: 'ai_prompt_built',
  AI_REQUEST_SENT: 'ai_request_sent',
  AI_RESPONSE_RECEIVED: 'ai_response_received',
  TOOL_CALL_DETECTED: 'tool_call_detected',
  ENUM_VALIDATION: 'enum_validation',
  PRICE_CALCULATED: 'price_calculated',
  APPOINTMENT_CREATED: 'appointment_created',
  APPOINTMENT_VALIDATION_FAILED: 'appointment_validation_failed',
  DUPLICATE_PREVENTED: 'duplicate_prevented',
  CLIENT_ARRIVAL_DETECTED: 'client_arrival_detected',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_SEND_FAILED: 'message_send_failed',
  SECURITY_CHECK_FAILED: 'security_check_failed',
  SECURITY_VIOLATION: 'security_violation',
  ERROR_OCCURRED: 'error_occurred'
} as const;

export type AIEventType = typeof AI_EVENT_TYPES[keyof typeof AI_EVENT_TYPES];

// ============================================================================
// Appointment Status
// ============================================================================
export const APPOINTMENT_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
} as const;

export type AppointmentStatus = typeof APPOINTMENT_STATUS[keyof typeof APPOINTMENT_STATUS];
