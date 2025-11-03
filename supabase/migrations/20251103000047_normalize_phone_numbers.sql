-- Migration: Normalize all phone numbers in conversations table
-- This ensures consistent phone number format across the database
-- Removes @suffix (e.g., @s.whatsapp.net, @lid) and all non-numeric characters

-- Purpose: Fix conversation duplication and message routing bugs by ensuring
-- all phone numbers are stored in a consistent normalized format (digits only)

BEGIN;

-- Step 1: Normalize contact_phone in conversations table
-- Remove @suffix and all non-numeric characters
UPDATE conversations
SET contact_phone = regexp_replace(
  split_part(contact_phone, '@', 1),  -- Remove @suffix first
  '[^0-9]',                            -- Then remove all non-digits
  '',
  'g'
)
WHERE
  contact_phone IS NOT NULL
  AND (
    contact_phone ~ '@'                 -- Has @ symbol
    OR contact_phone ~ '[^0-9]'        -- Has non-numeric characters
  );

-- Step 2: Log the normalization for audit purposes
DO $$
DECLARE
  normalized_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO normalized_count
  FROM conversations
  WHERE contact_phone IS NOT NULL;

  RAISE NOTICE 'Phone number normalization completed. Total conversations: %', normalized_count;
END $$;

-- Step 3: Add a comment to document this change
COMMENT ON COLUMN conversations.contact_phone IS
  'Normalized phone number (digits only, no @ suffix or special characters).
   Updated by migration 20251103000047 to ensure consistent format and prevent message routing bugs.';

-- Step 4: Optional - Remove duplicates that may have been created due to inconsistent normalization
-- This identifies conversations with the same normalized phone for the same instance
-- We keep the most recent one (by last_message_at) and delete older duplicates
WITH duplicate_conversations AS (
  SELECT
    id,
    instance_id,
    contact_phone,
    last_message_at,
    ROW_NUMBER() OVER (
      PARTITION BY instance_id, contact_phone
      ORDER BY
        COALESCE(last_message_at, created_at) DESC NULLS LAST,
        created_at DESC
    ) as rn
  FROM conversations
  WHERE contact_phone IS NOT NULL
)
DELETE FROM conversations
WHERE id IN (
  SELECT id
  FROM duplicate_conversations
  WHERE rn > 1
);

-- Step 5: Ensure the unique constraint is properly enforced
-- Drop and recreate the unique constraint to ensure it applies to normalized values
ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS conversations_instance_id_contact_phone_key;

ALTER TABLE conversations
ADD CONSTRAINT conversations_instance_id_contact_phone_key
UNIQUE (instance_id, contact_phone);

COMMIT;

-- Final verification query (for manual checking if needed)
-- SELECT instance_id, contact_phone, COUNT(*) as count
-- FROM conversations
-- WHERE contact_phone IS NOT NULL
-- GROUP BY instance_id, contact_phone
-- HAVING COUNT(*) > 1;
