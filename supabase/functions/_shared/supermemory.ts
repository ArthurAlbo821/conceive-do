import { z } from 'npm:zod@3.22.4';

type SupabaseClientLike = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
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
  workspaceId: z
    .string()
    .min(1, 'SUPERMEMORY_WORKSPACE_ID is required')
    .startsWith('workspace_', 'SUPERMEMORY_WORKSPACE_ID must start with "workspace_"'),
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

const STORE_REQUEST_SCHEMA = z.object({
  conversation_id: z.string().min(1),
  message_id: z.string().min(1),
  user_id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().min(1),
  timestamp: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

type StoreRequestBody = z.infer<typeof STORE_REQUEST_SCHEMA>;

const SEARCH_REQUEST_SCHEMA = z.object({
  conversation_id: z.string().min(1),
  limit: z.number().int().positive().max(50).default(20),
  user_id: z.string().optional(),
});

type SearchRequestBody = z.infer<typeof SEARCH_REQUEST_SCHEMA>;

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
    workspaceId: Deno.env.get('SUPERMEMORY_WORKSPACE_ID') ?? '',
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
          'X-Supermemory-Workspace': config.workspaceId,
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

export async function storeMessageInSupermemory(params: StoreMessageParams): Promise<{ stored: boolean; skipped: boolean }> {
  const config = getConfig();

  if (!config) {
    return { stored: false, skipped: true };
  }

  const requestBody: StoreRequestBody = STORE_REQUEST_SCHEMA.parse({
    conversation_id: params.conversationId,
    message_id: params.messageId,
    user_id: params.userId,
    role: getRoleFromDirection(params.direction),
    content: params.content,
    timestamp: params.timestamp,
    metadata: params.metadata,
  });

  try {
    await fetchWithRetry(config, {
      path: `/v1/workspaces/${config.workspaceId}/messages`,
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

export async function fetchSupermemoryContext(
  params: FetchContextParams
): Promise<FetchContextResult | null> {
  const limit = params.limit ?? 20;
  const config = getConfig();

  if (!config) {
    return null;
  }

  const cacheKey = getCacheKey(params.conversationId, limit);

  if (params.useCache !== false) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return transformSupermemoryMessages(params.conversationId, cached.data.messages);
    }
  }

  const requestBody: SearchRequestBody = SEARCH_REQUEST_SCHEMA.parse({
    conversation_id: params.conversationId,
    limit,
    user_id: params.userId,
  });

  try {
    const response = await fetchWithRetry(config, {
      path: `/v1/workspaces/${config.workspaceId}/conversations/${encodeURIComponent(
        params.conversationId
      )}/search`,
      method: 'POST',
      body: requestBody,
    });

    const payload = CONTEXT_RESPONSE_SCHEMA.parse(await response.json());

    cache.set(cacheKey, {
      data: payload,
      expiresAt: Date.now() + MAX_CACHE_DURATION_MS,
    });

    return transformSupermemoryMessages(params.conversationId, payload.messages);
  } catch (error) {
    console.error('[supermemory] Failed to fetch context:', error);
    return null;
  }
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

export function resetSupermemoryCache(): void {
  cache.clear();
}
