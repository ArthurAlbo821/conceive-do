-- ============================================================================
-- Migration: Création de la queue pour instances Evolution API
-- À exécuter dans le SQL Editor de Supabase
-- ============================================================================

-- Étape 1: Créer la table de queue
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

-- Étape 2: Créer l'index pour performance
CREATE INDEX IF NOT EXISTS idx_evolution_queue_status
  ON evolution_instance_creation_queue(status, created_at);

-- Étape 3: Activer Row Level Security
ALTER TABLE evolution_instance_creation_queue ENABLE ROW LEVEL SECURITY;

-- Étape 4: Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "Service role can manage evolution instance queue" ON evolution_instance_creation_queue;
DROP POLICY IF EXISTS "Users can view their own queue status" ON evolution_instance_creation_queue;

-- Étape 5: Créer les policies RLS
CREATE POLICY "Service role can manage evolution instance queue"
  ON evolution_instance_creation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view their own queue status"
  ON evolution_instance_creation_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Étape 6: Créer la fonction trigger
CREATE OR REPLACE FUNCTION handle_profile_evolution_instance()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_request_id uuid;
BEGIN
  -- Générer un ID de requête pour tracking
  v_request_id := gen_random_uuid();

  -- Log
  RAISE LOG 'Triggering Evolution API instance creation for user_id: %, request_id: %', NEW.id, v_request_id;

  BEGIN
    -- Insérer une demande de création d'instance dans la queue
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
      -- Log l'erreur mais ne pas bloquer la création du profil
      RAISE WARNING 'Failed to queue Evolution API instance creation for user_id: %. Error: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Étape 7: Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS on_profile_created_create_evolution_instance ON profiles;

-- Étape 8: Créer le trigger
CREATE TRIGGER on_profile_created_create_evolution_instance
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_profile_evolution_instance();

-- Étape 9: Accorder les permissions
GRANT USAGE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON evolution_instance_creation_queue TO postgres, service_role;
GRANT SELECT ON evolution_instance_creation_queue TO authenticated;

-- Étape 10: Ajouter les commentaires
COMMENT ON TABLE evolution_instance_creation_queue IS 'Queue for Evolution API instance creation requests';
COMMENT ON FUNCTION handle_profile_evolution_instance() IS 'Trigger function that queues Evolution API instance creation when a new profile is created';

-- Étape 11: Vérifier que tout est créé
DO $$
DECLARE
  table_exists boolean;
  trigger_exists boolean;
  policy_count integer;
BEGIN
  -- Vérifier la table
  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'evolution_instance_creation_queue'
  ) INTO table_exists;

  -- Vérifier le trigger
  SELECT EXISTS (
    SELECT FROM pg_trigger
    WHERE tgname = 'on_profile_created_create_evolution_instance'
  ) INTO trigger_exists;

  -- Compter les policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'evolution_instance_creation_queue';

  -- Afficher les résultats
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ MIGRATION APPLIQUÉE AVEC SUCCÈS';
  RAISE NOTICE '';

  IF table_exists THEN
    RAISE NOTICE '✓ Table evolution_instance_creation_queue créée';
  ELSE
    RAISE NOTICE '✗ Table evolution_instance_creation_queue NON créée';
  END IF;

  IF trigger_exists THEN
    RAISE NOTICE '✓ Trigger on_profile_created_create_evolution_instance créé';
  ELSE
    RAISE NOTICE '✗ Trigger on_profile_created_create_evolution_instance NON créé';
  END IF;

  RAISE NOTICE '✓ Policies RLS: % créées', policy_count;
  RAISE NOTICE '';
  RAISE NOTICE '📊 Pour vérifier:';
  RAISE NOTICE '   SELECT COUNT(*) FROM evolution_instance_creation_queue;';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
