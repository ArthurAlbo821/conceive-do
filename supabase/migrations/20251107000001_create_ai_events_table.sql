-- Create ai_events table for logging AI-related events
-- Used for debugging, analytics, and auditing

CREATE TABLE public.ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX idx_ai_events_user_id ON ai_events(user_id);
CREATE INDEX idx_ai_events_conversation_id ON ai_events(conversation_id);
CREATE INDEX idx_ai_events_event_type ON ai_events(event_type);
CREATE INDEX idx_ai_events_created_at ON ai_events(created_at DESC);

-- Create composite index for user + event type queries
CREATE INDEX idx_ai_events_user_event ON ai_events(user_id, event_type, created_at DESC);

-- Enable RLS for ai_events
ALTER TABLE ai_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_events
CREATE POLICY "Users can view own AI events"
  ON ai_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can insert AI events"
  ON ai_events FOR INSERT
  WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE ai_events IS 'Logs AI-related events for debugging, analytics, and auditing';
COMMENT ON COLUMN ai_events.event_type IS 'Type of event: temporal_enriched, openai_call, appointment_created, validation_error, error, arrival_detection';
COMMENT ON COLUMN ai_events.metadata IS 'Additional event-specific data stored as JSONB';
