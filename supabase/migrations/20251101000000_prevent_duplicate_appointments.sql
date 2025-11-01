-- Migration: Prevent Duplicate Appointments
-- Date: 2025-11-01
-- Description: Adds UNIQUE constraint to prevent duplicate appointments for the same conversation, date, and time

-- ============================================================================
-- 1. CLEAN UP EXISTING DUPLICATES (if any)
-- ============================================================================

-- First, identify duplicates and keep only the earliest created appointment
WITH duplicate_appointments AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id, appointment_date, start_time
      ORDER BY created_at ASC
    ) as row_num
  FROM appointments
)
DELETE FROM appointments
WHERE id IN (
  SELECT id
  FROM duplicate_appointments
  WHERE row_num > 1
);

COMMENT ON TABLE appointments IS 'Cleaned up duplicate appointments - kept earliest created for each unique (conversation_id, appointment_date, start_time) combination';

-- ============================================================================
-- 2. ADD UNIQUE CONSTRAINT
-- ============================================================================

-- Create unique constraint to prevent future duplicates
-- This ensures no two appointments can exist for the same conversation, date, and time
ALTER TABLE appointments
ADD CONSTRAINT unique_appointment_slot
UNIQUE (conversation_id, appointment_date, start_time);

COMMENT ON CONSTRAINT unique_appointment_slot ON appointments IS 'Prevents duplicate appointments for the same conversation at the same date and time';

-- ============================================================================
-- 3. CREATE INDEX FOR EFFICIENT DUPLICATE CHECKING
-- ============================================================================

-- Index already created by UNIQUE constraint, but adding comment for clarity
COMMENT ON INDEX unique_appointment_slot IS 'Enforces uniqueness and enables fast duplicate checks before INSERT';
