-- Add instance_token column to evolution_instances table
ALTER TABLE public.evolution_instances 
ADD COLUMN IF NOT EXISTS instance_token text;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_evolution_instances_user_id ON public.evolution_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_evolution_instances_instance_name ON public.evolution_instances(instance_name);