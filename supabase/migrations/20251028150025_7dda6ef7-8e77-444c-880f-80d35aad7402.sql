-- Create user_informations table for professional details
CREATE TABLE public.user_informations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Prestations (array, max 10)
  prestations jsonb DEFAULT '[]'::jsonb,
  
  -- Extras with prices (array, max 10)
  extras jsonb DEFAULT '[]'::jsonb,
  
  -- Taboos (array, max 10)
  taboos jsonb DEFAULT '[]'::jsonb,
  
  -- Tariffs with durations (array, no strict limit)
  tarifs jsonb DEFAULT '[]'::jsonb,
  
  -- Address
  adresse text,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_informations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own informations
CREATE POLICY "Users can view own informations"
  ON public.user_informations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own informations
CREATE POLICY "Users can insert own informations"
  ON public.user_informations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own informations
CREATE POLICY "Users can update own informations"
  ON public.user_informations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_user_informations_updated_at
  BEFORE UPDATE ON public.user_informations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();