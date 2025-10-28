-- Create ai_logs table for tracking AI hallucination attempts
CREATE TABLE public.ai_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  attempted_value TEXT,
  valid_options JSONB,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_ai_logs_user_id ON public.ai_logs(user_id);
CREATE INDEX idx_ai_logs_event_type ON public.ai_logs(event_type);
CREATE INDEX idx_ai_logs_conversation_id ON public.ai_logs(conversation_id);
CREATE INDEX idx_ai_logs_created_at ON public.ai_logs(created_at);

-- Enable RLS
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own logs"
  ON public.ai_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert logs"
  ON public.ai_logs
  FOR INSERT
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.ai_logs IS 'Logs for tracking AI behavior, hallucination attempts, and semantic matching events';