-- Combined Migration: Client Arrival Features + Duplicate Prevention
-- This script combines the two pending migrations and applies them safely

-- ============================================================================
-- PART 1: CLIENT ARRIVAL FEATURES
-- ============================================================================

-- 1. APPOINTMENTS TABLE: Add client arrival tracking columns
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS provider_ready_to_receive BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS client_arrived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS client_arrival_detected_at TIMESTAMPTZ;

COMMENT ON COLUMN appointments.provider_ready_to_receive IS 'Indicates if provider has clicked "ready to receive" button for this specific appointment';
COMMENT ON COLUMN appointments.client_arrived IS 'Indicates if client has sent a message indicating arrival (detected by AI or manual)';
COMMENT ON COLUMN appointments.client_arrival_detected_at IS 'Timestamp when client arrival was detected';

-- Index for finding appointments where client arrived but provider not ready
CREATE INDEX IF NOT EXISTS idx_appointments_arrival_status
ON appointments(user_id, appointment_date, client_arrived, provider_ready_to_receive)
WHERE status = 'confirmed';

-- 2. USER_INFORMATIONS TABLE: Add sensitive access information columns
ALTER TABLE user_informations
ADD COLUMN IF NOT EXISTS door_code TEXT,
ADD COLUMN IF NOT EXISTS floor TEXT,
ADD COLUMN IF NOT EXISTS elevator_info TEXT,
ADD COLUMN IF NOT EXISTS access_instructions TEXT;

COMMENT ON COLUMN user_informations.door_code IS 'Door entry code - SENSITIVE: only sent when provider is ready to receive client';
COMMENT ON COLUMN user_informations.floor IS 'Floor number/information - SENSITIVE';
COMMENT ON COLUMN user_informations.elevator_info IS 'Elevator instructions - SENSITIVE';
COMMENT ON COLUMN user_informations.access_instructions IS 'Additional access instructions - SENSITIVE';

-- 3. CONVERSATIONS TABLE: Add pinning functionality
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.is_pinned IS 'Indicates if conversation is pinned to top (auto-pinned for confirmed appointments today)';
COMMENT ON COLUMN conversations.pinned_at IS 'Timestamp when conversation was pinned';

-- Index for efficient sorting of pinned conversations
CREATE INDEX IF NOT EXISTS idx_conversations_pinned
ON conversations(user_id, is_pinned DESC, pinned_at DESC);

-- 4. RPC FUNCTION: Complete appointment and unpin conversation
CREATE OR REPLACE FUNCTION complete_appointment_and_unpin(p_appointment_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_id UUID;
  v_user_id UUID;
  v_result JSON;
BEGIN
  -- Get conversation_id and user_id from appointment
  SELECT conversation_id, user_id
  INTO v_conversation_id, v_user_id
  FROM appointments
  WHERE id = p_appointment_id;

  -- Check if appointment exists
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Appointment not found'
    );
  END IF;

  -- Update appointment status to completed
  UPDATE appointments
  SET
    status = 'completed',
    updated_at = now()
  WHERE id = p_appointment_id;

  -- Unpin the conversation if it exists
  IF v_conversation_id IS NOT NULL THEN
    UPDATE conversations
    SET
      is_pinned = false,
      pinned_at = NULL
    WHERE id = v_conversation_id;
  END IF;

  -- Return success with details
  RETURN json_build_object(
    'success', true,
    'appointment_id', p_appointment_id,
    'conversation_id', v_conversation_id,
    'unpinned', v_conversation_id IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION complete_appointment_and_unpin IS 'Marks appointment as completed and unpins the associated conversation';

-- 5. HELPER FUNCTION: Get today's appointments with arrival status
CREATE OR REPLACE FUNCTION get_todays_appointments_with_status(p_user_id UUID)
RETURNS TABLE (
  appointment_id UUID,
  contact_name TEXT,
  contact_phone TEXT,
  start_time TIME,
  end_time TIME,
  service TEXT,
  client_arrived BOOLEAN,
  client_arrival_detected_at TIMESTAMPTZ,
  provider_ready_to_receive BOOLEAN,
  conversation_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.contact_name,
    a.contact_phone,
    a.start_time,
    a.end_time,
    a.service,
    a.client_arrived,
    a.client_arrival_detected_at,
    a.provider_ready_to_receive,
    a.conversation_id
  FROM appointments a
  WHERE a.user_id = p_user_id
    AND a.appointment_date = (NOW() AT TIME ZONE 'Europe/Paris')::date
    AND a.status = 'confirmed'
  ORDER BY a.start_time ASC;
END;
$$;

COMMENT ON FUNCTION get_todays_appointments_with_status IS 'Returns all confirmed appointments for today with arrival and readiness status';

-- 6. TRIGGER: Auto-pin conversation when appointment is confirmed for today
CREATE OR REPLACE FUNCTION auto_pin_conversation_on_appointment_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only pin if appointment is confirmed and for today (France timezone)
  IF NEW.status = 'confirmed'
     AND NEW.appointment_date::date = (NOW() AT TIME ZONE 'Europe/Paris')::date
     AND NEW.conversation_id IS NOT NULL THEN

    UPDATE conversations
    SET
      is_pinned = true,
      pinned_at = now()
    WHERE id = NEW.conversation_id
      AND is_pinned = false; -- Only update if not already pinned
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_auto_pin_on_appointment_confirm ON appointments;

CREATE TRIGGER trigger_auto_pin_on_appointment_confirm
AFTER INSERT OR UPDATE OF status, appointment_date ON appointments
FOR EACH ROW
EXECUTE FUNCTION auto_pin_conversation_on_appointment_confirm();

COMMENT ON TRIGGER trigger_auto_pin_on_appointment_confirm ON appointments IS 'Automatically pins conversation when appointment is confirmed for today';

-- 7. GRANTS: Ensure authenticated users can access new functions
GRANT EXECUTE ON FUNCTION complete_appointment_and_unpin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_todays_appointments_with_status(UUID) TO authenticated;

-- ============================================================================
-- PART 2: DUPLICATE PREVENTION
-- ============================================================================

-- 1. CLEAN UP EXISTING DUPLICATES (if any)
WITH duplicate_appointments AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id, appointment_date, start_time
      ORDER BY created_at ASC
    ) as row_num
  FROM appointments
  WHERE conversation_id IS NOT NULL
)
DELETE FROM appointments
WHERE id IN (
  SELECT id
  FROM duplicate_appointments
  WHERE row_num > 1
);

-- 2. ADD UNIQUE CONSTRAINT (if not exists)
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_appointment_slot'
  ) THEN
    ALTER TABLE appointments
    ADD CONSTRAINT unique_appointment_slot
    UNIQUE (conversation_id, appointment_date, start_time);

    RAISE NOTICE 'UNIQUE constraint unique_appointment_slot created successfully';
  ELSE
    RAISE NOTICE 'UNIQUE constraint unique_appointment_slot already exists';
  END IF;
END $$;

COMMENT ON CONSTRAINT unique_appointment_slot ON appointments IS 'Prevents duplicate appointments for the same conversation at the same date and time';
