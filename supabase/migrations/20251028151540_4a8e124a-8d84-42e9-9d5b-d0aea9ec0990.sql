-- Add ai_enabled column to evolution_instances
ALTER TABLE public.evolution_instances 
ADD COLUMN ai_enabled boolean DEFAULT false;

COMMENT ON COLUMN public.evolution_instances.ai_enabled IS 
'Active/désactive les réponses automatiques par IA pour cette instance';