const SUPERMEMORY_API_KEY = Deno.env.get('SUPERMEMORY_API_KEY');
const SUPERMEMORY_BASE_URL = (Deno.env.get('SUPERMEMORY_API_URL') || 'https://api.supermemory.ai').replace(/\/$/, '');
const SUPERMEMORY_WORKSPACE_ID = Deno.env.get('SUPERMEMORY_WORKSPACE_ID') || Deno.env.get('SUPERMEMORY_APP_ID') || 'default';

export type SupermemoryRole = 'user' | 'assistant' | 'system';

export interface SupermemoryMessage {
  role: SupermemoryRole;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown> | null;
}

export interface SupermemoryContextResponse {
  messages: SupermemoryMessage[];
  summary?: string;
}

export function isSupermemoryEnabled(): boolean {
  return Boolean(SUPERMEMORY_API_KEY);
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`
  };
}

export async function storeMessageInSupermemory(params: {
  userId: string;
  conversationId: string;
  role: SupermemoryRole;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupermemoryEnabled()) {
    return;
  }

  try {
    const response = await fetch(`${SUPERMEMORY_BASE_URL}/v1/memories`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        workspace_id: SUPERMEMORY_WORKSPACE_ID,
        conversation_id: params.conversationId,
        user_id: params.userId,
        role: params.role,
        content: params.content,
        timestamp: params.timestamp || new Date().toISOString(),
        metadata: params.metadata || {}
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[supermemory] Failed to store message:', response.status, errorText);
    }
  } catch (error) {
    console.warn('[supermemory] Error while storing message:', error);
  }
}

export async function fetchSupermemoryContext(params: {
  userId: string;
  conversationId: string;
  limit?: number;
}): Promise<SupermemoryContextResponse | null> {
  if (!isSupermemoryEnabled()) {
    return null;
  }

  try {
    const response = await fetch(`${SUPERMEMORY_BASE_URL}/v1/memories/query`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        workspace_id: SUPERMEMORY_WORKSPACE_ID,
        conversation_id: params.conversationId,
        user_id: params.userId,
        limit: params.limit || 20,
        include_summary: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[supermemory] Failed to fetch context:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.messages)) {
      console.warn('[supermemory] Unexpected response format when fetching context');
      return null;
    }

    return {
      messages: data.messages as SupermemoryMessage[],
      summary: data.summary || undefined
    };
  } catch (error) {
    console.warn('[supermemory] Error while fetching context:', error);
    return null;
  }
}
