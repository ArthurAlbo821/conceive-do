/**
 * Supermemory Module Tests
 * Tests for the Supermemory integration module
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  storeMessageInSupermemory,
  fetchSupermemoryContext,
  syncMessageToSupermemory,
  resetSupermemoryCache,
} from '../supermemory.ts';

// Mock Supabase client
const createMockSupabase = (insertError: any = null) => ({
  from: () => ({
    insert: async () => ({ error: insertError }),
  }),
});

// Set up test environment variables
Deno.test({
  name: 'storeMessageInSupermemory - should skip when config is missing',
  async fn() {
    // Clear env vars to simulate missing config
    const originalApiKey = Deno.env.get('SUPERMEMORY_API_KEY');
    Deno.env.delete('SUPERMEMORY_API_KEY');

    const result = await storeMessageInSupermemory({
      conversationId: 'conv_123',
      messageId: 'msg_123',
      userId: 'user_123',
      direction: 'incoming',
      content: 'Test message',
      timestamp: new Date().toISOString(),
    });

    assertEquals(result.stored, false);
    assertEquals(result.skipped, true);

    // Restore env var
    if (originalApiKey) {
      Deno.env.set('SUPERMEMORY_API_KEY', originalApiKey);
    }
  },
});

Deno.test({
  name: 'fetchSupermemoryContext - should return null when config is missing',
  async fn() {
    // Clear env vars
    const originalApiKey = Deno.env.get('SUPERMEMORY_API_KEY');
    Deno.env.delete('SUPERMEMORY_API_KEY');

    const result = await fetchSupermemoryContext({
      conversationId: 'conv_123',
      limit: 20,
    });

    assertEquals(result, null);

    // Restore env var
    if (originalApiKey) {
      Deno.env.set('SUPERMEMORY_API_KEY', originalApiKey);
    }
  },
});

Deno.test({
  name: 'syncMessageToSupermemory - should store in DB even if Supermemory fails',
  async fn() {
    const mockSupabase = createMockSupabase(null);

    // Clear Supermemory config to simulate failure
    const originalApiKey = Deno.env.get('SUPERMEMORY_API_KEY');
    Deno.env.delete('SUPERMEMORY_API_KEY');

    const result = await syncMessageToSupermemory({
      supabase: mockSupabase as any,
      userId: 'user_123',
      message: {
        conversation_id: 'conv_123',
        instance_id: 'instance_123',
        message_id: 'msg_123',
        sender_phone: '1234567890',
        receiver_phone: '0987654321',
        direction: 'incoming',
        content: 'Test message',
        status: 'delivered',
        timestamp: new Date().toISOString(),
      },
    });

    // DB should succeed
    assertEquals(result.dbError, null);
    // Supermemory should be skipped
    assertEquals(result.supermemoryStored, false);
    assertEquals(result.supermemorySkipped, true);

    // Restore env var
    if (originalApiKey) {
      Deno.env.set('SUPERMEMORY_API_KEY', originalApiKey);
    }
  },
});

Deno.test({
  name: 'syncMessageToSupermemory - should skip Supermemory when flag is set',
  async fn() {
    const mockSupabase = createMockSupabase(null);

    const result = await syncMessageToSupermemory({
      supabase: mockSupabase as any,
      userId: 'user_123',
      message: {
        conversation_id: 'conv_123',
        instance_id: 'instance_123',
        message_id: 'msg_123',
        sender_phone: '1234567890',
        receiver_phone: '0987654321',
        direction: 'outgoing',
        content: 'Test message',
        status: 'sent',
        timestamp: new Date().toISOString(),
      },
      skipSupermemory: true,
    });

    assertEquals(result.dbError, null);
    assertEquals(result.supermemoryStored, false);
    assertEquals(result.supermemorySkipped, true);
  },
});

Deno.test({
  name: 'syncMessageToSupermemory - should handle DB errors gracefully',
  async fn() {
    const mockSupabase = createMockSupabase({ message: 'DB error' });

    const result = await syncMessageToSupermemory({
      supabase: mockSupabase as any,
      userId: 'user_123',
      message: {
        conversation_id: 'conv_123',
        instance_id: 'instance_123',
        message_id: 'msg_123',
        sender_phone: '1234567890',
        receiver_phone: '0987654321',
        direction: 'incoming',
        content: 'Test message',
        status: 'delivered',
        timestamp: new Date().toISOString(),
      },
      skipSupermemory: true,
    });

    assertExists(result.dbError);
    assertEquals(result.dbError.message, 'DB error');
  },
});

Deno.test({
  name: 'resetSupermemoryCache - should clear cache without errors',
  fn() {
    // Should not throw
    resetSupermemoryCache();
  },
});

// Integration tests (require valid Supermemory API key)
Deno.test({
  name: 'storeMessageInSupermemory - integration test with valid config',
  ignore: !Deno.env.get('SUPERMEMORY_API_KEY'), // Skip if no API key
  async fn() {
    const result = await storeMessageInSupermemory({
      conversationId: 'test_conv_' + crypto.randomUUID(),
      messageId: 'test_msg_' + crypto.randomUUID(),
      userId: 'test_user_123',
      direction: 'incoming',
      content: 'This is a test message from Deno tests',
      timestamp: new Date().toISOString(),
      metadata: {
        test: true,
        source: 'deno_test',
      },
    });

    // With valid config, it should attempt to store
    // Result depends on whether API call succeeds
    assertEquals(result.skipped, false);
  },
});
