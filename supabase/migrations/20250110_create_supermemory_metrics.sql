-- Create supermemory_metrics table for tracking Supermemory integration metrics
-- This table stores performance and usage metrics for monitoring and debugging

CREATE TABLE IF NOT EXISTS supermemory_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'storage_success',
    'storage_failure',
    'storage_skipped',
    'search_success',
    'search_failure',
    'search_fallback',
    'cache_hit',
    'cache_miss'
  )),
  conversation_id UUID,
  user_id UUID,
  latency_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_supermemory_metrics_type ON supermemory_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_supermemory_metrics_created_at ON supermemory_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supermemory_metrics_user_id ON supermemory_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_supermemory_metrics_conversation_id ON supermemory_metrics(conversation_id);

-- Create a composite index for common queries (type + date)
CREATE INDEX IF NOT EXISTS idx_supermemory_metrics_type_date ON supermemory_metrics(metric_type, created_at DESC);

-- Enable Row Level Security
ALTER TABLE supermemory_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own metrics
CREATE POLICY "Users can view own metrics"
  ON supermemory_metrics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can manage all metrics
CREATE POLICY "Service role can manage metrics"
  ON supermemory_metrics
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comment the table
COMMENT ON TABLE supermemory_metrics IS 'Stores performance and usage metrics for Supermemory.ai integration';
COMMENT ON COLUMN supermemory_metrics.metric_type IS 'Type of metric: storage_success, storage_failure, storage_skipped, search_success, search_failure, search_fallback, cache_hit, cache_miss';
COMMENT ON COLUMN supermemory_metrics.latency_ms IS 'Request latency in milliseconds (for API calls)';
COMMENT ON COLUMN supermemory_metrics.error_message IS 'Error message if metric represents a failure';
COMMENT ON COLUMN supermemory_metrics.metadata IS 'Additional context as JSON (flexible for future needs)';

-- Create a view for easy metrics aggregation
CREATE OR REPLACE VIEW supermemory_metrics_summary AS
SELECT
  metric_type,
  COUNT(*) as count,
  AVG(latency_ms) as avg_latency_ms,
  MAX(latency_ms) as max_latency_ms,
  MIN(latency_ms) as min_latency_ms,
  DATE_TRUNC('hour', created_at) as hour
FROM supermemory_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY metric_type, DATE_TRUNC('hour', created_at)
ORDER BY hour DESC, metric_type;

COMMENT ON VIEW supermemory_metrics_summary IS 'Aggregated metrics summary for the last 24 hours, grouped by hour';

-- Optional: Create a function to clean up old metrics (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_supermemory_metrics()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM supermemory_metrics
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_supermemory_metrics IS 'Deletes metrics older than 30 days. Returns number of deleted rows.';
