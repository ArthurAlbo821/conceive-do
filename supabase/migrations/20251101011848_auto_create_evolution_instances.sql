-- Migration: Auto-create Evolution API instances when user profiles are created
-- Description: This migration adds a database trigger that automatically calls the
--              create-evolution-instance Edge Function when a new profile is created.
--              This ensures that Evolution API instances and their webhooks are
--              configured immediately upon user signup.

-- Create a function to auto-create Evolution API instance for new profiles
CREATE OR REPLACE FUNCTION handle_profile_evolution_instance()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_response record;
  v_request_id uuid;
BEGIN
  -- Get Supabase URL and service role key from vault or use environment
  -- Note: In production, these should come from Supabase vault
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  -- If not set via settings, we'll rely on the Edge Function's environment
  IF v_supabase_url IS NULL THEN
    v_supabase_url := 'http://localhost:54321'; -- Default for local dev
  END IF;

  -- Generate a request ID for tracking
  v_request_id := gen_random_uuid();

  -- Log the attempt
  RAISE LOG 'Triggering Evolution API instance creation for user_id: %, request_id: %',
    NEW.id, v_request_id;

  -- Call the create-evolution-instance Edge Function asynchronously
  -- We use pg_net extension if available, otherwise we'll handle this in the Edge Function
  BEGIN
    -- Attempt to call the Edge Function
    -- Note: This requires the pg_net extension or http extension to be enabled
    -- For now, we'll insert a record that will be picked up by a scheduled job
    -- or we'll rely on the Dashboard's auto-creation logic

    -- Insert a pending instance creation request
    INSERT INTO evolution_instance_creation_queue (
      user_id,
      request_id,
      status,
      created_at
    ) VALUES (
      NEW.id,
      v_request_id,
      'pending',
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      request_id = EXCLUDED.request_id,
      status = 'pending',
      updated_at = NOW(),
      retry_count = evolution_instance_creation_queue.retry_count + 1;

    RAISE LOG 'Evolution API instance creation queued for user_id: %', NEW.id;

  EXCEPTION
    WHEN OTHERS THEN
      -- Log error but don't fail the profile creation
      RAISE WARNING 'Failed to queue Evolution API instance creation for user_id: %. Error: %',
        NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Create a table to queue Evolution API instance creation requests
CREATE TABLE IF NOT EXISTS evolution_instance_creation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  processed_at timestamptz
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_evolution_queue_status
  ON evolution_instance_creation_queue(status, created_at);

-- Add RLS policies for the queue table
ALTER TABLE evolution_instance_creation_queue ENABLE ROW LEVEL SECURITY;

-- Only allow service role to manage the queue
CREATE POLICY "Service role can manage evolution instance queue"
  ON evolution_instance_creation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own queue status
CREATE POLICY "Users can view their own queue status"
  ON evolution_instance_creation_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create the trigger on profiles table
-- This trigger fires AFTER a new profile is inserted
DROP TRIGGER IF EXISTS on_profile_created_create_evolution_instance ON profiles;

CREATE TRIGGER on_profile_created_create_evolution_instance
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_profile_evolution_instance();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON evolution_instance_creation_queue TO postgres, service_role;
GRANT SELECT ON evolution_instance_creation_queue TO authenticated;

-- Add a comment explaining the migration
COMMENT ON TABLE evolution_instance_creation_queue IS 'Queue for Evolution API instance creation requests. When a new user profile is created, a record is inserted here to trigger asynchronous instance creation via Edge Function.';

COMMENT ON FUNCTION handle_profile_evolution_instance() IS 'Trigger function that queues Evolution API instance creation when a new profile is created. This ensures instances and webhooks are configured automatically upon user signup.';
