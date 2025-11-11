-- supabase/migrations/20251111000000_auto_normalize_conversations.sql
-- Normalizes conversation phone numbers at the database layer.
-- Keeps data consistent even when application fallback logic runs.
CREATE OR REPLACE FUNCTION normalize_conversation_phone()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_phone IS NOT NULL THEN
    NEW.contact_phone := regexp_replace(NEW.contact_phone, '@.*$', '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS normalize_conversation_phone_trigger ON conversations;

CREATE TRIGGER normalize_conversation_phone_trigger
  BEFORE INSERT OR UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION normalize_conversation_phone();
