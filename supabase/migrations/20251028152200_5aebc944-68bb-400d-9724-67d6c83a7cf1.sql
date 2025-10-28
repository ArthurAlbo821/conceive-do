-- Add ai_enabled column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN ai_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.conversations.ai_enabled IS 
'Active/désactive les réponses automatiques par IA pour cette conversation spécifique';