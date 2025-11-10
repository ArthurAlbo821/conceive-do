/**
 * Supermemory Metrics and Monitoring Module
 *
 * This module provides metrics tracking for Supermemory integration
 * to monitor fallback rates, latency, and usage patterns.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

export type MetricType =
  | 'storage_success'
  | 'storage_failure'
  | 'storage_skipped'
  | 'search_success'
  | 'search_failure'
  | 'search_fallback'
  | 'cache_hit'
  | 'cache_miss';

export interface SupermemoryMetric {
  metric_type: MetricType;
  conversation_id?: string;
  user_id?: string;
  latency_ms?: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// In-memory metrics aggregation (reset every hour)
const metrics = new Map<MetricType, number>();
let metricsResetTime = Date.now();

const METRICS_RESET_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Records a Supermemory metric
 *
 * Stores metric in database for long-term analysis and updates in-memory counters
 *
 * @param supabase - Supabase client
 * @param metric - Metric details
 *
 * @example
 * await recordSupermemoryMetric(supabase, {
 *   metric_type: 'storage_success',
 *   conversation_id: 'conv_123',
 *   user_id: 'user_456',
 *   latency_ms: 250,
 *   timestamp: new Date().toISOString(),
 * });
 */
export async function recordSupermemoryMetric(
  supabase: SupabaseClient,
  metric: SupermemoryMetric
): Promise<void> {
  try {
    // Update in-memory counter
    const currentCount = metrics.get(metric.metric_type) || 0;
    metrics.set(metric.metric_type, currentCount + 1);

    // Store in database (fire-and-forget to avoid blocking)
    supabase
      .from('supermemory_metrics')
      .insert({
        metric_type: metric.metric_type,
        conversation_id: metric.conversation_id,
        user_id: metric.user_id,
        latency_ms: metric.latency_ms,
        error_message: metric.error_message,
        metadata: metric.metadata,
        created_at: metric.timestamp,
      })
      .then(({ error }) => {
        if (error) {
          console.error('[supermemory-metrics] Failed to store metric:', error);
        }
      });
  } catch (error) {
    // Never fail on metrics - just log
    console.error('[supermemory-metrics] Error recording metric:', error);
  }
}

/**
 * Gets current metrics summary
 *
 * Returns aggregated metrics for the current time window
 *
 * @returns Object with metric counts
 *
 * @example
 * const summary = getMetricsSummary();
 * console.log('Fallback rate:', summary.fallback_rate);
 */
export function getMetricsSummary(): {
  storage_success: number;
  storage_failure: number;
  storage_skipped: number;
  search_success: number;
  search_failure: number;
  search_fallback: number;
  cache_hit: number;
  cache_miss: number;
  fallback_rate: number;
  success_rate: number;
  time_window_ms: number;
} {
  // Reset metrics if time window expired
  if (Date.now() - metricsResetTime > METRICS_RESET_INTERVAL) {
    metrics.clear();
    metricsResetTime = Date.now();
  }

  const storageSuccess = metrics.get('storage_success') || 0;
  const storageFailure = metrics.get('storage_failure') || 0;
  const storageSkipped = metrics.get('storage_skipped') || 0;
  const searchSuccess = metrics.get('search_success') || 0;
  const searchFailure = metrics.get('search_failure') || 0;
  const searchFallback = metrics.get('search_fallback') || 0;
  const cacheHit = metrics.get('cache_hit') || 0;
  const cacheMiss = metrics.get('cache_miss') || 0;

  const totalStorage = storageSuccess + storageFailure + storageSkipped;
  const totalSearch = searchSuccess + searchFailure + searchFallback;

  const fallbackRate =
    totalSearch > 0 ? ((searchFallback + searchFailure) / totalSearch) * 100 : 0;
  const successRate = totalStorage > 0 ? (storageSuccess / totalStorage) * 100 : 0;

  return {
    storage_success: storageSuccess,
    storage_failure: storageFailure,
    storage_skipped: storageSkipped,
    search_success: searchSuccess,
    search_failure: searchFailure,
    search_fallback: searchFallback,
    cache_hit: cacheHit,
    cache_miss: cacheMiss,
    fallback_rate,
    success_rate,
    time_window_ms: Date.now() - metricsResetTime,
  };
}

/**
 * Logs metrics summary to console
 *
 * Useful for debugging and monitoring
 *
 * @example
 * logMetricsSummary();
 */
export function logMetricsSummary(): void {
  const summary = getMetricsSummary();

  console.log('\n=== 📊 Supermemory Metrics Summary ===');
  console.log('Storage:');
  console.log('  ✅ Success:', summary.storage_success);
  console.log('  ❌ Failure:', summary.storage_failure);
  console.log('  ⏭️  Skipped:', summary.storage_skipped);
  console.log('Search:');
  console.log('  ✅ Success:', summary.search_success);
  console.log('  ❌ Failure:', summary.search_failure);
  console.log('  🔄 Fallback:', summary.search_fallback);
  console.log('Cache:');
  console.log('  ✅ Hit:', summary.cache_hit);
  console.log('  ❌ Miss:', summary.cache_miss);
  console.log('Rates:');
  console.log('  📈 Success Rate:', summary.success_rate.toFixed(2) + '%');
  console.log('  📉 Fallback Rate:', summary.fallback_rate.toFixed(2) + '%');
  console.log('Time Window:', Math.floor(summary.time_window_ms / 1000) + 's');
  console.log('=====================================\n');
}

/**
 * Checks if fallback rate is too high and logs warning
 *
 * @param threshold - Threshold percentage (default: 50)
 *
 * @example
 * checkFallbackRate(50); // Warn if fallback rate > 50%
 */
export function checkFallbackRate(threshold = 50): void {
  const summary = getMetricsSummary();

  if (summary.fallback_rate > threshold) {
    console.warn(
      `[supermemory-metrics] ⚠️ HIGH FALLBACK RATE: ${summary.fallback_rate.toFixed(2)}% (threshold: ${threshold}%)`
    );
    console.warn('[supermemory-metrics] Supermemory may be down or experiencing issues');
    console.warn('[supermemory-metrics] App is functioning normally via PostgreSQL fallback');
  }
}

/**
 * Resets all metrics counters
 *
 * @example
 * resetMetrics();
 */
export function resetMetrics(): void {
  metrics.clear();
  metricsResetTime = Date.now();
  console.log('[supermemory-metrics] Metrics reset');
}
