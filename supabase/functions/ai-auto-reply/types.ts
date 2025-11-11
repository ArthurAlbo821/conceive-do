/**
 * Types TypeScript pour ai-auto-reply
 * Remplace tous les 'any' par des types stricts
 */

import { AIMode, AppointmentStatus } from './config.ts';

// ============================================================================
// User Information Types
// ============================================================================

export interface Prestation {
  name: string;
  description?: string;
  keywords?: string[];
}

export interface Extra {
  name: string;
  price: number;
  description?: string;
  keywords?: string[];
}

export interface Taboo {
  name: string;
  description?: string;
}

export interface Tarif {
  duration: string;  // e.g., "30min", "1h", "2h"
  price: number;
}

export interface AccessInfo {
  building_code?: string;
  floor?: string;
  apartment_number?: string;
  additional_instructions?: string;
}

export interface UserInformation {
  user_id: string;
  prestations: Prestation[];
  extras: Extra[];
  taboos: Taboo[];
  tarifs: Tarif[];
  adresse: string;
  access_info?: AccessInfo;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Availability Types
// ============================================================================

export interface Availability {
  id: string;
  user_id: string;
  day_of_week: number;  // 0 = Sunday, 6 = Saturday
  start_time: string;   // HH:MM format
  end_time: string;     // HH:MM format
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Appointment Types
// ============================================================================

export interface StructuredExtra {
  name: string;
  price: number;
}

export interface Appointment {
  id: string;
  user_id: string;
  conversation_id: string;
  contact_name: string;
  contact_phone: string;
  appointment_date: string;  // YYYY-MM-DD
  start_time: string;        // HH:MM (France timezone)
  end_time: string;          // HH:MM (France timezone)
  duration_minutes: number;
  service: string;
  notes?: string;
  selected_extras: StructuredExtra[];
  base_price: number;
  extras_total: number;
  total_price: number;
  status: AppointmentStatus;
  client_arrived?: boolean;
  client_arrival_detected_at?: string;
  provider_ready_to_receive?: boolean;
  provider_ready_at?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Message {
  id?: string;
  conversation_id: string;
  direction: 'incoming' | 'outgoing';
  content: string;
  timestamp: string;
  created_at?: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  contact_phone: string;
  contact_name?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Temporal Parsing Types
// ============================================================================

export interface TemporalValue {
  value: string;  // ISO datetime string
  grain?: string; // e.g., "hour", "minute", "day"
  type?: string;
}

export interface TemporalEntity {
  body: string;      // Original text matched (e.g., "dans 1h")
  dim: string;       // Dimension, typically "time"
  value: TemporalValue;
  start: number;     // Start index in original text
  end: number;       // End index in original text
}

export interface DucklingResponse extends Array<TemporalEntity> {}

export interface ChronoResult {
  text: string;
  index: number;
  start: {
    date: () => Date;
  };
}

export interface TemporalParseResult {
  entities: TemporalEntity[];
  method: 'duckling' | 'chrono' | 'none';
}

// ============================================================================
// OpenAI Types
// ============================================================================

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface OpenAIResponseFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    strict: boolean;
    schema: {
      type: string;
      properties: Record<string, any>;
      required: string[];
      additionalProperties: boolean;
    };
  };
}

export interface OpenAIRequestBody {
  model: string;
  messages: OpenAIMessage[];
  temperature: number;
  max_tokens: number;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none';
  response_format?: OpenAIResponseFormat;
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

export interface OpenAIChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

// ============================================================================
// Appointment Creation Types
// ============================================================================

export interface AppointmentToolData {
  duration: string;           // e.g., "30min", "1h"
  selected_extras: string[];  // Array of extra names
  appointment_date: string;   // YYYY-MM-DD
  appointment_time: string;   // HH:MM
}

export interface PriceMappings {
  durationToPriceMap: Record<string, number>;
  extraToPriceMap: Record<string, number>;
}

export interface DynamicEnums {
  prestationEnum: string[];
  extraEnum: string[];
  durationEnum: string[];
}

// ============================================================================
// AI Waiting Mode Types (JSON structured response)
// ============================================================================

export interface AIWaitingResponse {
  message: string;
  client_has_arrived: boolean;
  confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// Context Building Types
// ============================================================================

export interface UserContext {
  prestations: string;
  extras: string;
  taboos: string;
  tarifs: string;
  adresse: string;
}

export interface CurrentDateTime {
  fullDate: string;
  time: string;
  dayOfWeek: string;
  date: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
}

// ============================================================================
// Semantic Matching Types
// ============================================================================

export interface SemanticMatchResult<T> {
  match: T | null;
  confidence: number;
  alternatives: T[];
}

// ============================================================================
// Logging Types
// ============================================================================

export interface LogMetadata {
  [key: string]: any;
}

export interface AILogEntry {
  user_id: string;
  conversation_id: string;
  event_type: string;
  message: string;
  valid_options?: LogMetadata;
  attempted_value?: string;
  created_at: string;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface AIAutoReplyRequest {
  conversation_id: string;
  user_id: string;
  message_text: string;
  contact_name: string;
  contact_phone: string;
}

export interface AIAutoReplySuccessResponse {
  success: true;
  response?: string;
  appointment_created?: boolean;
  appointment_id?: string;
  duplicate_prevented?: boolean;
  existing_appointment_id?: string;
  tokens_used?: OpenAIUsage;
}

export interface AIAutoReplyErrorResponse {
  error: string;
  details?: any;
  minutes_until?: number;
}

// ============================================================================
// Availability Calculation Types
// ============================================================================

export interface TimeRange {
  start: number;  // Minutes from midnight
  end: number;    // Minutes from midnight
}

export interface AvailabilityCalculationContext {
  availabilities: Availability[];
  appointments: Appointment[];
  currentDate: Date;
  minimumLeadTimeMinutes: number;
}
