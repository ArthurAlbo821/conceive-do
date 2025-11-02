-- Migration: Remove duplicate instance creation trigger
-- Date: 2025-11-02
--
-- Purpose: Drop the database trigger that automatically creates Evolution instances
-- on profile creation, as this causes duplicate concurrent creation calls when
-- combined with frontend auto-creation.
--
-- Background: When a user signs up, the system was triggering instance creation
-- from TWO sources:
-- 1. Database trigger (via queue) - backend/async
-- 2. Frontend Dashboard component - immediate
--
-- This caused multiple concurrent calls (9+) to create-evolution-instance,
-- resulting in 403 "name already in use" errors and wasted resources.
--
-- Solution: Keep only frontend-initiated creation for better UX (immediate creation)
-- and remove the database trigger to eliminate the duplicate creation path.

-- Drop the trigger that queues instance creation on profile insert
DROP TRIGGER IF EXISTS on_profile_created_create_evolution_instance ON profiles;

-- Drop the function that handles the trigger
DROP FUNCTION IF EXISTS handle_profile_evolution_instance();

-- Note: We're keeping the evolution_instance_creation_queue table and
-- process-evolution-queue function for potential future use or manual queue processing.
-- They won't be automatically triggered anymore but remain available if needed.

-- The unique constraint on evolution_instances(user_id) remains in place to
-- prevent duplicate instances at the database level.
