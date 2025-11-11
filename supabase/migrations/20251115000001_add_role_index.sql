-- supabase/migrations/20251115000001_add_role_index.sql
-- Adds a performance index on the profiles.role column to optimize superadmin checks.
-- This migration improves query performance for role-based filtering operations.

-- Create index on role column for faster superadmin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- This index speeds up queries like:
-- SELECT * FROM profiles WHERE role = 'superadmin'
-- Used by useCurrentProfile hook and RLS policies
