-- Add role and is_active columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Ensure existing rows have a valid role value
UPDATE public.profiles
SET role = 'user'
WHERE role IS NULL;

-- Index to speed up role-based lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Superadmin helper condition
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'superadmin'
  );
$$;

-- Policies to allow superadmins to manage profiles
CREATE POLICY "Superadmins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Allow superadmins to manage related tables
CREATE POLICY "Superadmins can view all user informations"
  ON public.user_informations
  FOR SELECT
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can view all instances"
  ON public.evolution_instances
  FOR SELECT
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can delete any instance"
  ON public.evolution_instances
  FOR DELETE
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can view all appointments"
  ON public.appointments
  FOR SELECT
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can view all messages"
  ON public.messages
  FOR SELECT
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can view all AI logs"
  ON public.ai_logs
  FOR SELECT
  USING (public.is_superadmin());

-- Helper to delete users securely
CREATE OR REPLACE FUNCTION public.superadmin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM auth.delete_user(target_user_id);
END;
$$;
