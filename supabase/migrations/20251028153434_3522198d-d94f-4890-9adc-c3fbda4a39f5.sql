-- Create availabilities table
CREATE TABLE public.availabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create appointments table
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL,
  service TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_appointment_time CHECK (end_time > start_time)
);

-- Enable RLS
ALTER TABLE public.availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for availabilities
CREATE POLICY "Users can view own availabilities"
ON public.availabilities
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own availabilities"
ON public.availabilities
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own availabilities"
ON public.availabilities
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own availabilities"
ON public.availabilities
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for appointments
CREATE POLICY "Users can view own appointments"
ON public.appointments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own appointments"
ON public.appointments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own appointments"
ON public.appointments
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own appointments"
ON public.appointments
FOR DELETE
USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_availabilities_updated_at
BEFORE UPDATE ON public.availabilities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for performance
CREATE INDEX idx_availabilities_user_id ON public.availabilities(user_id);
CREATE INDEX idx_availabilities_day_of_week ON public.availabilities(day_of_week);
CREATE INDEX idx_appointments_user_id ON public.appointments(user_id);
CREATE INDEX idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX idx_appointments_status ON public.appointments(status);