-- =====================================================
-- Migration: Simple Notification Approach (No Triggers)
-- Date: 2025-11-03
-- Description:
--   Remove database triggers and rely on application-level calls
--   This is more reliable and doesn't require special permissions
-- =====================================================

-- Drop all notification triggers (if they exist)
DROP TRIGGER IF EXISTS trigger_notify_new_appointment ON appointments;
DROP TRIGGER IF EXISTS trigger_notify_client_arrival ON appointments;
DROP TRIGGER IF EXISTS trigger_notify_access_info_sent ON appointments;

DROP FUNCTION IF EXISTS notify_new_appointment() CASCADE;
DROP FUNCTION IF EXISTS notify_client_arrival() CASCADE;
DROP FUNCTION IF EXISTS notify_access_info_sent() CASCADE;

-- =====================================================
-- Tables remain the same (notification_phone and appointment_notifications)
-- These were already created in the previous migration
-- =====================================================

-- Add a helpful comment
COMMENT ON TABLE appointment_notifications IS
'Stores history of all notifications sent to providers.
Notifications are triggered from the application layer (Edge Functions or client code),
not from database triggers, for better reliability and permission management.';

-- =====================================================
-- IMPLEMENTATION APPROACH:
-- =====================================================
-- Instead of database triggers, we will call the send-provider-notification
-- Edge Function from:
--
-- 1. ai-auto-reply Edge Function (after creating appointment)
-- 2. ai-auto-reply Edge Function (after detecting client arrival)
-- 3. send-access-info Edge Function (after sending access info)
--
-- This approach is:
-- - More reliable (no permission issues)
-- - Easier to debug (visible in Edge Function logs)
-- - More flexible (can add retries, rate limiting, etc.)
-- - Follows Supabase best practices
-- =====================================================
