-- =====================================================
-- PERFORMANCE OPTIMIZATION: Add missing indexes
-- =====================================================
-- This migration adds composite indexes for frequently
-- queried columns to improve query performance
-- =====================================================

-- Messages: Composite index for instance + timestamp queries
-- Used when fetching messages for a specific instance sorted by time
CREATE INDEX IF NOT EXISTS idx_messages_instance_timestamp
  ON public.messages(instance_id, timestamp DESC);

-- Messages: Sender phone lookup
-- Used for searching messages by sender phone number
CREATE INDEX IF NOT EXISTS idx_messages_sender_phone
  ON public.messages(sender_phone);

-- Messages: Receiver phone lookup
-- Used for searching messages by receiver phone number
CREATE INDEX IF NOT EXISTS idx_messages_receiver_phone
  ON public.messages(receiver_phone);

-- Conversations: Composite index for instance + last_message queries
-- Used when fetching conversations for an instance sorted by recent activity
CREATE INDEX IF NOT EXISTS idx_conversations_instance_last_message
  ON public.conversations(instance_id, last_message_at DESC);

-- Conversations: Contact phone lookup
-- Used for finding conversations by phone number
CREATE INDEX IF NOT EXISTS idx_conversations_contact_phone
  ON public.conversations(contact_phone);

-- Appointments: Composite index for user + date + time
-- Used when fetching appointments for a specific user and date range
CREATE INDEX IF NOT EXISTS idx_appointments_user_date_time
  ON public.appointments(user_id, appointment_date, start_time);

-- Appointments: Conversation lookup
-- Used for finding appointments related to a conversation
CREATE INDEX IF NOT EXISTS idx_appointments_conversation_id
  ON public.appointments(conversation_id)
  WHERE conversation_id IS NOT NULL;

-- User informations: User ID lookup (if not already exists)
-- Used for fetching user settings and preferences
CREATE INDEX IF NOT EXISTS idx_user_informations_user_id
  ON public.user_informations(user_id);

-- Availabilities: Composite index for user + day queries
-- Used when checking availability for specific days
CREATE INDEX IF NOT EXISTS idx_availabilities_user_day
  ON public.availabilities(user_id, day_of_week);

-- =====================================================
-- PERFORMANCE NOTES:
-- These indexes will:
-- 1. Speed up message fetching by 10-100x with large datasets
-- 2. Improve conversation list loading time
-- 3. Optimize appointment calendar queries
-- 4. Enable faster phone number lookups
-- =====================================================

COMMENT ON INDEX idx_messages_instance_timestamp IS 'Composite index for fetching messages by instance ordered by time';
COMMENT ON INDEX idx_conversations_instance_last_message IS 'Composite index for conversation list with recent activity first';
COMMENT ON INDEX idx_appointments_user_date_time IS 'Composite index for appointment calendar queries';
