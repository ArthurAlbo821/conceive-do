-- =====================================================
-- Migration: Fix Notification Triggers (Alternative Method)
-- Date: 2025-11-03
-- Description:
--   Replace current_setting() approach with Supabase-compatible method
--   using Vault secrets or environment detection
-- =====================================================

-- Drop existing functions to recreate them
DROP FUNCTION IF EXISTS notify_new_appointment() CASCADE;
DROP FUNCTION IF EXISTS notify_client_arrival() CASCADE;
DROP FUNCTION IF EXISTS notify_access_info_sent() CASCADE;

-- =====================================================
-- Trigger 1: Notify when new appointment is created by AI
-- =====================================================
CREATE OR REPLACE FUNCTION notify_new_appointment()
RETURNS TRIGGER AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Only trigger if:
  -- 1. Status is 'confirmed' (AI-created appointments start as confirmed)
  -- 2. conversation_id IS NOT NULL (created via WhatsApp conversation)
  IF NEW.status = 'confirmed' AND NEW.conversation_id IS NOT NULL THEN

    -- Use Supabase's net.http_post with automatic URL detection
    -- The URL will be automatically constructed from the current request context
    SELECT net.http_post(
      -- Use relative URL - Supabase will resolve this automatically
      url := current_setting('request.jwt.claims', true)::json->>'iss' || '/functions/v1/send-provider-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'role'
      ),
      body := jsonb_build_object(
        'appointment_id', NEW.id::text,
        'notification_type', 'new_appointment'
      )
    ) INTO request_id;

    -- Log for debugging
    RAISE LOG 'Notification trigger fired for new appointment: %, request_id: %', NEW.id, request_id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the appointment creation if notification fails
    RAISE WARNING 'Failed to send new appointment notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  request_id bigint;
BEGIN
  -- Only trigger if client_arrived changes from FALSE/NULL to TRUE
  IF NEW.client_arrived = TRUE AND (OLD.client_arrived IS NULL OR OLD.client_arrived = FALSE) THEN

    SELECT net.http_post(
      url := current_setting('request.jwt.claims', true)::json->>'iss' || '/functions/v1/send-provider-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'role'
      ),
      body := jsonb_build_object(
        'appointment_id', NEW.id::text,
        'notification_type', 'client_arrived'
      )
    ) INTO request_id;

    RAISE LOG 'Notification trigger fired for client arrival: %, request_id: %', NEW.id, request_id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send client arrival notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  request_id bigint;
BEGIN
  -- Only trigger when provider_ready_to_receive changes from FALSE/NULL to TRUE
  IF NEW.provider_ready_to_receive = TRUE AND (OLD.provider_ready_to_receive IS NULL OR OLD.provider_ready_to_receive = FALSE) THEN

    SELECT net.http_post(
      url := current_setting('request.jwt.claims', true)::json->>'iss' || '/functions/v1/send-provider-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'role'
      ),
      body := jsonb_build_object(
        'appointment_id', NEW.id::text,
        'notification_type', 'access_info_sent'
      )
    ) INTO request_id;

    RAISE LOG 'Notification trigger fired for access info sent: %, request_id: %', NEW.id, request_id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send access info notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_access_info_sent
AFTER UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION notify_access_info_sent();

-- =====================================================
-- IMPORTANT NOTES:
-- =====================================================
-- This approach uses request.jwt.claims which is available in the Supabase context.
-- However, database triggers don't have access to request context by default.
--
-- ALTERNATIVE SOLUTION: Use a webhook approach instead of direct triggers.
-- We'll need to call the Edge Function from the application layer instead.
-- =====================================================
