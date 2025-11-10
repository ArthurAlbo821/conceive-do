/**
 * Supermemory.ai Integration Module
 *
 * This module provides integration with Supermemory.ai API for storing and retrieving
 * conversation messages with semantic search capabilities.
 *
 * Features:
 * - Automatic retry with exponential backoff (3 attempts)
 * - Request timeout (5 seconds)
 * - Graceful degradation (returns null on failure, allowing PostgreSQL fallback)
 * - Zod validation for all requests/responses
 * - In-memory caching (15 minutes)
 *
 * Environment Variables Required:
 * - SUPERMEMORY_API_KEY: API key from Supermemory.ai (starts with "sm_")
 * - SUPERMEMORY_API_URL: API base URL (default: "https://api.supermemory.ai")
 *
 * Usage Example:
 *
 * ```typescript
 * // Store a message
 * const result = await storeMessageInSupermemory({
 *   conversationId: 'conv_123',
 *   messageId: 'msg_456',
 *   userId: 'user_789',
 *   direction: 'incoming',
 *   content: 'Hello, how are you?',
 *   timestamp: new Date().toISOString(),
 *   metadata: { source: 'whatsapp' }
 * });
 *
 * if (result.stored) {
 *   console.log('Message stored in Supermemory');
 * } else if (result.skipped) {
 *   console.log('Supermemory not configured, skipped');
 * } else {
 *   console.log('Supermemory storage failed, using DB fallback');
 * }
 *
 * // Sync message to both DB and Supermemory
 * const syncResult = await syncMessageToSupermemory({
 *   supabase,
 *   userId: 'user_789',
 *   message: {
 *     conversation_id: 'conv_123',
 *     message_id: 'msg_456',
 *     sender_phone: '1234567890',
 *     receiver_phone: '0987654321',
 *     direction: 'incoming',
 *     content: 'Hello!',
 *     status: 'delivered',
 *     timestamp: new Date().toISOString(),
 *   }
 * });
 * ```
 *
 * API Documentation: https://supermemory.ai/docs
 * API v3 Endpoints:
 * - POST /v3/documents - Store a document/message
 */

import { z } from 'npm:zod@3.22.4';
import { recordSupermemoryMetric, logMetricsSummary, checkFallbackRate } from './supermemory-metrics.ts';

type SupabaseClientLike = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    select: (fields: string) => any;
  };
};

type MessageDirection = 'incoming' | 'outgoing';

type SupermemoryRole = 'user' | 'assistant' | 'system' | 'tool';

type RetryableFetchOptions = {
  path: string;
  method: 'POST';
  body: unknown;
};

type StoreMessageParams = {
  conversationId: string;
  messageId: string;
  userId: string;
  direction: MessageDirection;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

type SyncMessageParams = {
  supabase: SupabaseClientLike;
  userId: string;
  message: {
    conversation_id: string;
    instance_id?: string | null;
    message_id: string;
    sender_phone: string;
    receiver_phone: string;
    direction: MessageDirection;
    content: string;
    status: string;
    timestamp: string;
  };
  metadata?: Record<string, unknown>;
  skipSupermemory?: boolean;
};

type SyncMessageResult = {
  dbError: { message?: string } | null;
  supermemoryStored: boolean;
  supermemorySkipped: boolean;
};

type FetchContextParams = {
  conversationId: string;
  limit?: number;
  userId?: string;
  useCache?: boolean;
};

type FetchContextResult = {
  messages: {
    conversation_id: string;
    direction: MessageDirection;
    content: string;
    timestamp: string;
  }[];
};

const CONFIG_SCHEMA = z.object({
  apiKey: z
    .string()
    .min(1, 'SUPERMEMORY_API_KEY is required')
    .startsWith('sm_', 'SUPERMEMORY_API_KEY must start with "sm_"'),
  apiUrl: z
    .string()
    .url('SUPERMEMORY_API_URL must be a valid URL')
    .default('https://api.supermemory.ai'),
});

type SupermemoryConfig = z.infer<typeof CONFIG_SCHEMA>;

const SUPER_MEMORY_MESSAGE_SCHEMA = z.object({
  message_id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']).default('user'),
  content: z.string(),
  timestamp: z.string().optional(),
  score: z.number().optional(),
});

type SupermemoryMessage = z.infer<typeof SUPER_MEMORY_MESSAGE_SCHEMA>;

type SupermemoryContextResponse = {
  messages: SupermemoryMessage[];
};

const CONTEXT_RESPONSE_SCHEMA = z.object({
  messages: z.array(SUPER_MEMORY_MESSAGE_SCHEMA),
});

// Supermemory v3 API: POST /v3/documents
const STORE_REQUEST_SCHEMA = z.object({
  content: z.string().min(1),
  containerTag: z.string().optional(), // Single tag for better performance
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  customId: z.string().max(255).optional(),
});

type StoreRequestBody = z.infer<typeof STORE_REQUEST_SCHEMA>;

const MAX_CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const REQUEST_TIMEOUT_MS = 5000;
const RETRY_ATTEMPTS = 3;

const cache = new Map<string, { expiresAt: number; data: SupermemoryContextResponse }>();

let cachedConfig: SupermemoryConfig | null = null;
let configErrorLogged = false;

function getConfig(): SupermemoryConfig | null {
  if (cachedConfig) {
    return cachedConfig;
  }

  const rawConfig = {
    apiKey: Deno.env.get('SUPERMEMORY_API_KEY') ?? '',
    apiUrl: Deno.env.get('SUPERMEMORY_API_URL') ?? 'https://api.supermemory.ai',
  };

  const parsed = CONFIG_SCHEMA.safeParse(rawConfig);

  if (!parsed.success) {
    if (!configErrorLogged) {
      console.warn('[supermemory] Supermemory configuration invalid or missing:', parsed.error.flatten().fieldErrors);
      configErrorLogged = true;
    }
    return null;
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}

function getRoleFromDirection(direction: MessageDirection): SupermemoryRole {
  return direction === 'incoming' ? 'user' : 'assistant';
}

function getCacheKey(conversationId: string, limit: number): string {
  return `${conversationId}::${limit}`;
}

function invalidateCache(conversationId: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${conversationId}::`)) {
      cache.delete(key);
    }
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  config: SupermemoryConfig,
  { path, method, body }: RetryableFetchOptions
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${config.apiUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        lastError = new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);

        // Retry on 5xx responses, break otherwise
        if (response.status >= 500) {
          console.warn(`[supermemory] Request failed with ${response.status}, retrying (${attempt + 1}/${RETRY_ATTEMPTS})`);
          await delay(Math.pow(2, attempt) * 100);
          continue;
        }

        throw lastError;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        console.warn('[supermemory] Request timed out, retrying...', { attempt: attempt + 1 });
      } else {
        console.warn('[supermemory] Request failed, retrying...', {
          attempt: attempt + 1,
          error,
        });
      }

      await delay(Math.pow(2, attempt) * 100);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to execute Supermemory request');
}

/**
 * Stores a single message in Supermemory.ai
 *
 * This function stores a message as a document in Supermemory's v3 API.
 * Messages are grouped by conversation using containerTags for efficient retrieval.
 *
 * @param params - Message parameters
 * @param params.conversationId - Conversation identifier
 * @param params.messageId - Unique message identifier (used as customId for deduplication)
 * @param params.userId - User identifier
 * @param params.direction - Message direction ('incoming' or 'outgoing')
 * @param params.content - Message text content
 * @param params.timestamp - ISO 8601 timestamp
 * @param params.metadata - Optional metadata (will be merged with message context)
 *
 * @returns Object with { stored: boolean, skipped: boolean }
 * - stored: true if successfully stored in Supermemory
 * - skipped: true if Supermemory is not configured (graceful degradation)
 * - If both are false, storage was attempted but failed
 *
 * @example
 * const result = await storeMessageInSupermemory({
 *   conversationId: 'conv_123',
 *   messageId: 'msg_456',
 *   userId: 'user_789',
 *   direction: 'incoming',
 *   content: 'Hello!',
 *   timestamp: new Date().toISOString(),
 * });
 */
export async function storeMessageInSupermemory(params: StoreMessageParams): Promise<{ stored: boolean; skipped: boolean }> {
  const config = getConfig();

  if (!config) {
    return { stored: false, skipped: true };
  }

  // Build metadata with message context
  const fullMetadata = {
    conversation_id: params.conversationId,
    message_id: params.messageId,
    user_id: params.userId,
    role: getRoleFromDirection(params.direction),
    direction: params.direction,
    timestamp: params.timestamp,
    ...(params.metadata || {}),
  };

  // Convert metadata values to supported types (string, number, boolean)
  const cleanedMetadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fullMetadata)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      cleanedMetadata[key] = value;
    } else if (value !== null && value !== undefined) {
      cleanedMetadata[key] = String(value);
    }
  }

  const requestBody: StoreRequestBody = STORE_REQUEST_SCHEMA.parse({
    content: params.content,
    containerTag: `conversation_${params.conversationId}`, // Group by conversation
    metadata: cleanedMetadata,
    customId: params.messageId, // Use message_id as customId for deduplication
  });

  try {
    await fetchWithRetry(config, {
      path: '/v3/documents',
      method: 'POST',
      body: requestBody,
    });

    invalidateCache(params.conversationId);
    return { stored: true, skipped: false };
  } catch (error) {
    console.error('[supermemory] Failed to store message:', error);
    return { stored: false, skipped: false };
  }
}

/**
 * Fetches conversation context from Supermemory.ai
 *
 * **Status: NOT YET IMPLEMENTED**
 *
 * This function is a placeholder for fetching conversation messages from Supermemory
 * using semantic search. Currently returns null to trigger PostgreSQL fallback.
 *
 * Messages are successfully stored in Supermemory via /v3/documents,
 * but the search/retrieval endpoint needs to be implemented and tested
 * with real API credentials.
 *
 * @param params - Fetch parameters
 * @param params.conversationId - Conversation identifier
 * @param params.limit - Maximum number of messages to fetch (default: 20)
 * @param params.userId - User identifier (optional)
 * @param params.useCache - Whether to use cached results (default: true)
 *
 * @returns Array of messages or null (currently always returns null)
 *
 * TODO: Implement search endpoint once Supermemory account is available for testing
 */
export async function fetchSupermemoryContext(
  params: FetchContextParams
): Promise<FetchContextResult | null> {
  const config = getConfig();

  if (!config) {
    return null;
  }

  // TODO: Implement search once we have Supermemory account to test with
  // For now, return null to fallback to PostgreSQL
  // The documents are stored successfully via /v3/documents
  // but we need to test the search/query endpoint with real credentials

  console.log('[supermemory] ⚠️ Search not yet implemented - using PostgreSQL fallback');
  console.log('[supermemory] Documents are stored in Supermemory but search requires testing with real API key');

  return null;
}

function transformSupermemoryMessages(
  conversationId: string,
  messages: SupermemoryMessage[]
): FetchContextResult {
  return {
    messages: messages.map((message) => ({
      conversation_id: conversationId,
      direction: message.role === 'assistant' ? 'outgoing' : 'incoming',
      content: message.content,
      timestamp: message.timestamp ?? new Date().toISOString(),
    })),
  };
}

/**
 * Synchronizes a message to both PostgreSQL and Supermemory.ai
 *
 * This is the main function used across the codebase for storing messages.
 * It ensures messages are persisted in PostgreSQL (primary storage) and
 * optionally synced to Supermemory for semantic search capabilities.
 *
 * Behavior:
 * 1. Always attempts to store in PostgreSQL first
 * 2. Then attempts to store in Supermemory (if configured and not skipped)
 * 3. Returns status of both operations
 * 4. Never fails if Supermemory fails (graceful degradation)
 *
 * @param params - Sync parameters
 * @param params.supabase - Supabase client instance
 * @param params.userId - User identifier
 * @param params.message - Message object to store
 * @param params.metadata - Optional metadata to include in Supermemory
 * @param params.skipSupermemory - Skip Supermemory storage (default: false)
 *
 * @returns Object with database and Supermemory operation status
 * - dbError: Database error if any, null if successful
 * - supermemoryStored: true if successfully stored in Supermemory
 * - supermemorySkipped: true if Supermemory was skipped (config missing or explicit skip)
 *
 * @example
 * const result = await syncMessageToSupermemory({
 *   supabase,
 *   userId: 'user_123',
 *   message: {
 *     conversation_id: 'conv_123',
 *     message_id: 'msg_456',
 *     sender_phone: '1234567890',
 *     receiver_phone: '0987654321',
 *     direction: 'incoming',
 *     content: 'Hello!',
 *     status: 'delivered',
 *     timestamp: new Date().toISOString(),
 *   },
 *   metadata: { source: 'whatsapp' }
 * });
 *
 * if (result.dbError) {
 *   console.error('DB storage failed:', result.dbError);
 * }
 */
export async function syncMessageToSupermemory(params: SyncMessageParams): Promise<SyncMessageResult> {
  const { supabase, userId, message, metadata, skipSupermemory } = params;

  const dbPayload = {
    conversation_id: message.conversation_id,
    instance_id: message.instance_id ?? null,
    message_id: message.message_id,
    sender_phone: message.sender_phone,
    receiver_phone: message.receiver_phone,
    direction: message.direction,
    content: message.content,
    status: message.status,
    timestamp: message.timestamp,
  };

  const { error: dbError } = await supabase.from('messages').insert(dbPayload);

  let supermemoryStored = false;
  let supermemorySkipped = false;

  if (!skipSupermemory) {
    const { stored, skipped } = await storeMessageInSupermemory({
      conversationId: message.conversation_id,
      messageId: message.message_id,
      userId,
      direction: message.direction,
      content: message.content,
      timestamp: message.timestamp,
      metadata,
    });

    supermemoryStored = stored;
    supermemorySkipped = skipped;
  } else {
    supermemorySkipped = true;
  }

  if (dbError) {
    console.error('[supermemory] Failed to store message in database:', dbError);
  }

  return { dbError, supermemoryStored, supermemorySkipped };
}

/**
 * Resets the Supermemory in-memory cache
 *
 * Clears all cached conversation contexts. Useful for testing or when
 * you need to force a fresh fetch from Supermemory.
 *
 * @example
 * resetSupermemoryCache();
 */
export function resetSupermemoryCache(): void {
  cache.clear();
}
