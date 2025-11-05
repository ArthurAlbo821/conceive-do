/**
 * Rate limiting for AI Auto-Reply function
 * Prevents abuse and controls OpenAI API costs
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

/**
 * Rate limit configuration
 */
const RATE_LIMIT_CONFIG = {
  WINDOW_MINUTES: 1, // Time window in minutes
  MAX_REQUESTS: 10,  // Maximum requests per window
  CLEANUP_INTERVAL_HOURS: 24 // How often to cleanup old records
};

/**
 * Check if user has exceeded rate limit
 * Uses Supabase table for distributed rate limiting
 *
 * @param supabase - Supabase client
 * @param userId - User ID to check
 * @returns Object with isAllowed flag and details
 *
 * @example
 * const rateLimit = await checkRateLimit(supabase, user_id);
 * if (!rateLimit.isAllowed) {
 *   return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
 * }
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  isAllowed: boolean;
  requestCount?: number;
  resetTime?: Date;
  error?: string;
}> {
  try {
    // Calculate sliding window cutoff (true sliding window, not clock-aligned)
    const now = new Date();
    const cutoff = new Date(now.getTime() - RATE_LIMIT_CONFIG.WINDOW_MINUTES * 60000);

    // Count requests in sliding window (from cutoff to now)
    const { data, error, count } = await supabase
      .from('ai_rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', cutoff.toISOString());

    if (error) {
      console.error('[ratelimit] Error querying rate limits:', error);
      // On error, allow request (fail open for better UX)
      return { isAllowed: true };
    }

    const requestCount = count || 0;

    // Check if limit exceeded
    if (requestCount >= RATE_LIMIT_CONFIG.MAX_REQUESTS) {
      console.warn(`[ratelimit] ⚠️ Rate limit exceeded for user ${userId}: ${requestCount}/${RATE_LIMIT_CONFIG.MAX_REQUESTS}`);
      // For sliding window, estimate reset time (when oldest request will fall out of window)
      const estimatedResetTime = new Date(now.getTime() + RATE_LIMIT_CONFIG.WINDOW_MINUTES * 60000);
      const waitSeconds = Math.ceil(RATE_LIMIT_CONFIG.WINDOW_MINUTES * 60);
      return {
        isAllowed: false,
        requestCount,
        resetTime: estimatedResetTime,
        error: `Rate limit exceeded. Maximum ${RATE_LIMIT_CONFIG.MAX_REQUESTS} requests per ${RATE_LIMIT_CONFIG.WINDOW_MINUTES} minute(s). Try again in ${waitSeconds} seconds.`
      };
    }

    // Record this request
    const { error: insertError } = await supabase
      .from('ai_rate_limits')
      .insert({
        user_id: userId,
        created_at: now.toISOString()
      });

    if (insertError) {
      console.error(
        `[ratelimit] ⚠️ Error recording request for user ${userId}:`,
        {
          error: insertError,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
          actualRequestCount: requestCount
        }
      );
      // On error, still allow request (fail open) but return actual count
      console.log(`[ratelimit] ✅ Request allowed despite insert failure (${requestCount}/${RATE_LIMIT_CONFIG.MAX_REQUESTS} - not incremented)`);
      
      return {
        isAllowed: true,
        requestCount: requestCount, // Return actual count since insert failed
        resetTime: new Date(now.getTime() + RATE_LIMIT_CONFIG.WINDOW_MINUTES * 60000)
      };
    }

    // Insert succeeded - log and return incremented count
    const newCount = requestCount + 1;
    console.log(`[ratelimit] ✅ Request allowed (${newCount}/${RATE_LIMIT_CONFIG.MAX_REQUESTS})`);

    return {
      isAllowed: true,
      requestCount: newCount,
      resetTime: new Date(now.getTime() + RATE_LIMIT_CONFIG.WINDOW_MINUTES * 60000)
    };
  } catch (error) {
    console.error('[ratelimit] Unexpected error:', error);
    // On unexpected error, allow request (fail open)
    return { isAllowed: true };
  }
}

/**
 * Cleanup old rate limit records
 * Should be called periodically to prevent table bloat
 *
 * @param supabase - Supabase client
 * @returns Number of deleted records
 *
 * @example
 * // Run cleanup after processing request (async, don't await)
 * cleanupOldRateLimits(supabase).catch(console.error);
 */
export async function cleanupOldRateLimits(
  supabase: SupabaseClient
): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - RATE_LIMIT_CONFIG.CLEANUP_INTERVAL_HOURS);

    const { data, error } = await supabase
      .from('ai_rate_limits')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select();

    if (error) {
      console.error('[ratelimit] Error cleaning up old records:', error);
      return 0;
    }

    const deletedCount = data?.length || 0;
    if (deletedCount > 0) {
      console.log(`[ratelimit] 🧹 Cleaned up ${deletedCount} old rate limit records`);
    }

    return deletedCount;
  } catch (error) {
    console.error('[ratelimit] Unexpected error during cleanup:', error);
    return 0;
  }
}

/**
 * Response helper for rate limit errors
 *
 * @param error - Error message
 * @param resetTime - When the rate limit resets
 * @param corsHeaders - Optional CORS headers to include
 * @returns Response object with 429 status
 */
export function rateLimitErrorResponse(error: string, resetTime?: Date, corsHeaders?: Record<string, string>): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Retry-After': resetTime
      ? String(Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000)))
      : '60',
    ...(corsHeaders || {})
  };

  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: error,
      reset_at: resetTime?.toISOString()
    }),
    {
      status: 429,
      headers
    }
  );
}
