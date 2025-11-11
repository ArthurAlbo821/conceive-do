-- Create ai_rate_limits table for rate limiting
-- Tracks API requests per user to prevent abuse

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by user_id and created_at
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_time
  ON ai_rate_limits(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by Edge Function)
CREATE POLICY "Service role can manage rate limits"
  ON ai_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Optional: Auto-cleanup old records (older than 24 hours)
-- This can be done via pg_cron or manually in the Edge Function
COMMENT ON TABLE ai_rate_limits IS 'Tracks API requests for rate limiting. Records older than 24 hours should be cleaned up periodically.';
