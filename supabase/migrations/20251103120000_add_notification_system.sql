-- =====================================================
-- Migration: Add WhatsApp Notification System for Providers
-- Date: 2025-11-03
-- Description:
--   - Add notification_phone field to user_informations
--   - Create appointment_notifications table
--   - Add triggers for automatic notifications (new appointment, client arrival, access info sent)
-- =====================================================

-- 1. Add notification_phone field to user_informations
ALTER TABLE user_informations
ADD COLUMN IF NOT EXISTS notification_phone TEXT;

COMMENT ON COLUMN user_informations.notification_phone IS
'Numéro WhatsApp personnel du provider pour recevoir les notifications (format international E.164: +33612345678)';

-- 2. Create appointment_notifications table
CREATE TABLE IF NOT EXISTS appointment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('new_appointment', 'client_arrived', 'access_info_sent')),
  message_text TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointment_notifications_appointment
ON appointment_notifications(appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_notifications_user
ON appointment_notifications(user_id, created_at DESC);

-- Prevent duplicate notifications for the same appointment and type
CREATE UNIQUE INDEX IF NOT EXISTS idx_prevent_duplicate_notifications
ON appointment_notifications(appointment_id, notification_type);

-- Enable Row Level Security
ALTER TABLE appointment_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON appointment_notifications;
CREATE POLICY "Users can view their own notifications"
ON appointment_notifications FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert notifications (for triggers)
DROP POLICY IF EXISTS "Service role can insert notifications" ON appointment_notifications;
CREATE POLICY "Service role can insert notifications"
ON appointment_notifications FOR INSERT
WITH CHECK (true); -- Service role bypasses RLS anyway, but explicit policy for clarity

-- =====================================================
-- 3. Database Triggers for Automatic Notifications
-- =====================================================

-- Helper function to call Edge Function via HTTP POST
-- Note: Requires pg_net extension (pre-installed on Supabase)
DO $$
BEGIN
  -- Enable pg_net extension if not already enabled
  CREATE EXTENSION IF NOT EXISTS pg_net;
END $$;

-- =====================================================
-- Trigger 1: Notify when new appointment is created by AI
-- =====================================================
CREATE OR REPLACE FUNCTION notify_new_appointment()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger if:
  -- 1. Status is 'confirmed' (AI-created appointments start as confirmed)
  -- 2. conversation_id IS NOT NULL (created via WhatsApp conversation)
  -- 3. This is an INSERT (new appointment)
  IF NEW.status = 'confirmed' AND NEW.conversation_id IS NOT NULL THEN

    -- Get Supabase URL and Service Role Key from environment
    -- Note: These should be configured in Supabase dashboard or via SQL
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);

    -- If settings are not configured, try to use default Supabase env
    IF supabase_url IS NULL THEN
      supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
    END IF;

    -- Call Edge Function asynchronously
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-provider-notification',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'appointment_id', NEW.id::text,
        'notification_type', 'new_appointment'
      )
    );

    -- Log for debugging (optional)
    RAISE NOTICE 'Notification trigger fired for new appointment: %', NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the appointment creation if notification fails
    RAISE WARNING 'Failed to send new appointment notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_notify_new_appointment ON appointments;

-- Create trigger
CREATE TRIGGER trigger_notify_new_appointment
AFTER INSERT ON appointments
FOR EACH ROW
EXECUTE FUNCTION notify_new_appointment();

-- =====================================================
-- Trigger 2: Notify when client arrives
-- =====================================================
CREATE OR REPLACE FUNCTION notify_client_arrival()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger if client_arrived changes from FALSE/NULL to TRUE
  IF NEW.client_arrived = TRUE AND (OLD.client_arrived IS NULL OR OLD.client_arrived = FALSE) THEN

    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);

    IF supabase_url IS NULL THEN
      supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
    END IF;

    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-provider-notification',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'appointment_id', NEW.id::text,
        'notification_type', 'client_arrived'
      )
    );

    RAISE NOTICE 'Notification trigger fired for client arrival: %', NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send client arrival notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_client_arrival ON appointments;

CREATE TRIGGER trigger_notify_client_arrival
AFTER UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION notify_client_arrival();

-- =====================================================
-- Trigger 3: Notify when access info is sent to client
-- =====================================================
CREATE OR REPLACE FUNCTION notify_access_info_sent()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger when provider_ready_to_receive changes from FALSE/NULL to TRUE
  IF NEW.provider_ready_to_receive = TRUE AND (OLD.provider_ready_to_receive IS NULL OR OLD.provider_ready_to_receive = FALSE) THEN

    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);

    IF supabase_url IS NULL THEN
      supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
    END IF;

    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-provider-notification',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'appointment_id', NEW.id::text,
        'notification_type', 'access_info_sent'
      )
    );

    RAISE NOTICE 'Notification trigger fired for access info sent: %', NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send access info notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_access_info_sent ON appointments;

CREATE TRIGGER trigger_notify_access_info_sent
AFTER UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION notify_access_info_sent();

-- =====================================================
-- Configuration Instructions
-- =====================================================
-- To configure the Supabase URL and Service Role Key for triggers:
-- Execute these commands in the SQL editor (replace with your values):
/*
ALTER DATABASE postgres SET "app.settings.supabase_url" TO 'https://your-project.supabase.co';
ALTER DATABASE postgres SET "app.settings.service_role_key" TO 'your-service-role-key';
*/

-- Note: The triggers will attempt to auto-detect the Supabase URL from request headers
-- if the settings are not configured, but it's recommended to set them explicitly.

-- =====================================================
-- Migration Complete
-- =====================================================
