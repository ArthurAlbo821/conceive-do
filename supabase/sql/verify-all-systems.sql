-- ============================================================================
-- SCRIPT DE VÉRIFICATION COMPLÈTE DU SYSTÈME
-- Exécutez ce script dans le SQL Editor de Supabase pour vérifier que
-- tout fonctionne correctement après l'installation
-- ============================================================================

DO $$
DECLARE
  v_total_checks integer := 0;
  v_passed_checks integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔═══════════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║                                                                       ║';
  RAISE NOTICE '║           VÉRIFICATION COMPLÈTE DU SYSTÈME                            ║';
  RAISE NOTICE '║                                                                       ║';
  RAISE NOTICE '╚═══════════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 1: EXTENSIONS
-- ============================================================================
DO $$
DECLARE
  v_pg_cron boolean;
  v_pg_net boolean;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '1️⃣  EXTENSIONS REQUISES';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  SELECT EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_cron') INTO v_pg_cron;
  SELECT EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_net') INTO v_pg_net;

  IF v_pg_cron THEN
    RAISE NOTICE '✓ pg_cron : ACTIVÉE';
  ELSE
    RAISE NOTICE '✗ pg_cron : NON ACTIVÉE (CRITIQUE)';
    RAISE NOTICE '  Action: CREATE EXTENSION IF NOT EXISTS pg_cron;';
  END IF;

  IF v_pg_net THEN
    RAISE NOTICE '✓ pg_net : ACTIVÉE';
  ELSE
    RAISE NOTICE '✗ pg_net : NON ACTIVÉE (CRITIQUE)';
    RAISE NOTICE '  Action: CREATE EXTENSION IF NOT EXISTS pg_net;';
  END IF;

  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 2: TABLE DE QUEUE
-- ============================================================================
DO $$
DECLARE
  v_table_exists boolean;
  v_has_data boolean;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '2️⃣  TABLE DE QUEUE';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'evolution_instance_creation_queue'
  ) INTO v_table_exists;

  IF v_table_exists THEN
    RAISE NOTICE '✓ Table evolution_instance_creation_queue : EXISTE';

    -- Vérifier s'il y a des données
    SELECT COUNT(*) > 0 INTO v_has_data FROM evolution_instance_creation_queue;
    IF v_has_data THEN
      RAISE NOTICE '  Info: Table contient des données';
    ELSE
      RAISE NOTICE '  Info: Table vide (normal si aucun utilisateur créé)';
    END IF;
  ELSE
    RAISE NOTICE '✗ Table evolution_instance_creation_queue : MANQUANTE (CRITIQUE)';
    RAISE NOTICE '  Action: Exécutez apply-migration-queue.sql';
  END IF;

  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 3: TRIGGER ET FONCTION
-- ============================================================================
DO $$
DECLARE
  v_trigger_exists boolean;
  v_trigger_enabled boolean;
  v_function_exists boolean;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '3️⃣  TRIGGER ET FONCTION';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- Vérifier le trigger
  SELECT EXISTS (
    SELECT FROM pg_trigger WHERE tgname = 'on_profile_created_create_evolution_instance'
  ) INTO v_trigger_exists;

  IF v_trigger_exists THEN
    RAISE NOTICE '✓ Trigger on_profile_created_create_evolution_instance : EXISTE';

    SELECT tgenabled = 'O' INTO v_trigger_enabled
    FROM pg_trigger WHERE tgname = 'on_profile_created_create_evolution_instance';

    IF v_trigger_enabled THEN
      RAISE NOTICE '  ✓ Statut: ACTIVÉ';
    ELSE
      RAISE NOTICE '  ✗ Statut: DÉSACTIVÉ (PROBLÈME)';
    END IF;
  ELSE
    RAISE NOTICE '✗ Trigger : MANQUANT (CRITIQUE)';
    RAISE NOTICE '  Action: Exécutez apply-migration-queue.sql';
  END IF;

  -- Vérifier la fonction
  SELECT EXISTS (
    SELECT FROM pg_proc WHERE proname = 'handle_profile_evolution_instance'
  ) INTO v_function_exists;

  IF v_function_exists THEN
    RAISE NOTICE '✓ Fonction handle_profile_evolution_instance : EXISTE';
  ELSE
    RAISE NOTICE '✗ Fonction : MANQUANTE (CRITIQUE)';
    RAISE NOTICE '  Action: Exécutez apply-migration-queue.sql';
  END IF;

  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 4: CRON JOBS
-- ============================================================================
DO $$
DECLARE
  v_refresh_exists boolean;
  v_refresh_active boolean;
  v_refresh_schedule text;
  v_process_exists boolean;
  v_process_active boolean;
  v_process_schedule text;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '4️⃣  CRON JOBS';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- Job refresh-qr-codes
  SELECT
    EXISTS (SELECT FROM cron.job WHERE jobname = 'refresh-qr-codes'),
    COALESCE((SELECT active FROM cron.job WHERE jobname = 'refresh-qr-codes'), false),
    (SELECT schedule FROM cron.job WHERE jobname = 'refresh-qr-codes')
  INTO v_refresh_exists, v_refresh_active, v_refresh_schedule;

  IF v_refresh_exists THEN
    RAISE NOTICE '✓ Cron job refresh-qr-codes : EXISTE';
    IF v_refresh_active THEN
      RAISE NOTICE '  ✓ Statut: ACTIF';
      RAISE NOTICE '  ✓ Schedule: % (toutes les 1 minute)', v_refresh_schedule;
    ELSE
      RAISE NOTICE '  ✗ Statut: INACTIF (PROBLÈME)';
    END IF;
  ELSE
    RAISE NOTICE '✗ Cron job refresh-qr-codes : MANQUANT (CRITIQUE)';
    RAISE NOTICE '  Action: Exécutez le script de configuration des cron jobs';
  END IF;

  -- Job process-evolution-queue
  SELECT
    EXISTS (SELECT FROM cron.job WHERE jobname = 'process-evolution-queue'),
    COALESCE((SELECT active FROM cron.job WHERE jobname = 'process-evolution-queue'), false),
    (SELECT schedule FROM cron.job WHERE jobname = 'process-evolution-queue')
  INTO v_process_exists, v_process_active, v_process_schedule;

  IF v_process_exists THEN
    RAISE NOTICE '✓ Cron job process-evolution-queue : EXISTE';
    IF v_process_active THEN
      RAISE NOTICE '  ✓ Statut: ACTIF';
      RAISE NOTICE '  ✓ Schedule: % (toutes les 5 minutes)', v_process_schedule;
    ELSE
      RAISE NOTICE '  ✗ Statut: INACTIF (PROBLÈME)';
    END IF;
  ELSE
    RAISE NOTICE '✗ Cron job process-evolution-queue : MANQUANT (CRITIQUE)';
    RAISE NOTICE '  Action: Exécutez le script de configuration des cron jobs';
  END IF;

  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 5: HISTORIQUE DES CRON JOBS
-- ============================================================================
DO $$
DECLARE
  v_refresh_count integer;
  v_process_count integer;
  v_last_refresh timestamptz;
  v_last_process timestamptz;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '5️⃣  HISTORIQUE DES EXÉCUTIONS (dernières 2 heures)';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- Compter les exécutions récentes
  SELECT COUNT(*) INTO v_refresh_count
  FROM cron.job_run_details d
  JOIN cron.job j ON d.jobid = j.jobid
  WHERE j.jobname = 'refresh-qr-codes'
  AND d.start_time > NOW() - INTERVAL '2 hours';

  SELECT COUNT(*) INTO v_process_count
  FROM cron.job_run_details d
  JOIN cron.job j ON d.jobid = j.jobid
  WHERE j.jobname = 'process-evolution-queue'
  AND d.start_time > NOW() - INTERVAL '2 hours';

  -- Dernières exécutions
  SELECT MAX(d.start_time) INTO v_last_refresh
  FROM cron.job_run_details d
  JOIN cron.job j ON d.jobid = j.jobid
  WHERE j.jobname = 'refresh-qr-codes';

  SELECT MAX(d.start_time) INTO v_last_process
  FROM cron.job_run_details d
  JOIN cron.job j ON d.jobid = j.jobid
  WHERE j.jobname = 'process-evolution-queue';

  -- Afficher les résultats
  RAISE NOTICE 'refresh-qr-codes:';
  IF v_refresh_count > 0 THEN
    RAISE NOTICE '  ✓ Exécutions: % fois', v_refresh_count;
    RAISE NOTICE '  ✓ Dernière exécution: %', v_last_refresh;
  ELSE
    RAISE NOTICE '  ⚠ Aucune exécution récente';
    RAISE NOTICE '  Info: Attendez 1-2 minutes si vous venez de configurer';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'process-evolution-queue:';
  IF v_process_count > 0 THEN
    RAISE NOTICE '  ✓ Exécutions: % fois', v_process_count;
    RAISE NOTICE '  ✓ Dernière exécution: %', v_last_process;
  ELSE
    RAISE NOTICE '  ⚠ Aucune exécution récente';
    RAISE NOTICE '  Info: Attendez 5-10 minutes si vous venez de configurer';
  END IF;

  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 6: ÉTAT DES QR CODES
-- ============================================================================
DO $$
DECLARE
  v_total_instances integer;
  v_connecting integer;
  v_connected integer;
  v_last_update timestamptz;
  v_minutes_ago integer;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '6️⃣  ÉTAT DES QR CODES';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  SELECT COUNT(*) INTO v_total_instances FROM evolution_instances;
  SELECT COUNT(*) INTO v_connecting FROM evolution_instances WHERE instance_status = 'connecting';
  SELECT COUNT(*) INTO v_connected FROM evolution_instances WHERE instance_status = 'connected';

  SELECT MAX(last_qr_update) INTO v_last_update
  FROM evolution_instances
  WHERE last_qr_update IS NOT NULL;

  IF v_last_update IS NOT NULL THEN
    v_minutes_ago := EXTRACT(EPOCH FROM (NOW() - v_last_update))::integer / 60;
  END IF;

  RAISE NOTICE 'Total instances: %', v_total_instances;
  RAISE NOTICE 'Instances connectées: %', v_connected;
  RAISE NOTICE 'Instances en attente: %', v_connecting;
  RAISE NOTICE '';

  IF v_last_update IS NOT NULL THEN
    RAISE NOTICE 'Dernier rafraîchissement QR: il y a % minute(s)', v_minutes_ago;

    IF v_minutes_ago < 2 THEN
      RAISE NOTICE '✓ QR codes TRÈS RÉCENTS (< 2 min)';
    ELSIF v_minutes_ago < 5 THEN
      RAISE NOTICE '✓ QR codes récents (< 5 min)';
    ELSIF v_minutes_ago < 10 THEN
      RAISE NOTICE '⚠ QR codes un peu anciens (5-10 min)';
    ELSE
      RAISE NOTICE '✗ QR codes PÉRIMÉS (> 10 min) - Le cron job ne fonctionne pas!';
    END IF;
  ELSE
    RAISE NOTICE '⚠ Aucun QR code trouvé';
    RAISE NOTICE '  Info: Normal si aucune instance n''est en mode connecting';
  END IF;

  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 7: ÉTAT DE LA QUEUE
-- ============================================================================
DO $$
DECLARE
  v_total integer;
  v_pending integer;
  v_processing integer;
  v_completed integer;
  v_failed integer;
  v_success_rate numeric;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '7️⃣  ÉTAT DE LA QUEUE';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'evolution_instance_creation_queue') THEN
    SELECT COUNT(*) INTO v_total FROM evolution_instance_creation_queue;
    SELECT COUNT(*) INTO v_pending FROM evolution_instance_creation_queue WHERE status = 'pending';
    SELECT COUNT(*) INTO v_processing FROM evolution_instance_creation_queue WHERE status = 'processing';
    SELECT COUNT(*) INTO v_completed FROM evolution_instance_creation_queue WHERE status = 'completed';
    SELECT COUNT(*) INTO v_failed FROM evolution_instance_creation_queue WHERE status = 'failed';

    IF v_total > 0 THEN
      v_success_rate := ROUND((v_completed::numeric / v_total) * 100, 1);
    ELSE
      v_success_rate := 0;
    END IF;

    RAISE NOTICE 'Total: %', v_total;
    RAISE NOTICE 'En attente: %', v_pending;
    RAISE NOTICE 'En traitement: %', v_processing;
    RAISE NOTICE 'Complétées: % (%.1f%%)', v_completed, v_success_rate;

    IF v_failed > 0 THEN
      RAISE NOTICE '✗ Échouées: % (NÉCESSITE ATTENTION)', v_failed;
    ELSE
      RAISE NOTICE '✓ Échouées: %', v_failed;
    END IF;

    IF v_total = 0 THEN
      RAISE NOTICE '';
      RAISE NOTICE 'Info: Aucune demande de création dans la queue';
      RAISE NOTICE '      C''est normal si aucun utilisateur n''a été créé';
    END IF;
  ELSE
    RAISE NOTICE '✗ Table de queue non trouvée';
  END IF;

  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SECTION 8: RÉSUMÉ GLOBAL
-- ============================================================================
DO $$
DECLARE
  v_score integer := 0;
  v_max_score integer := 6;
  v_pg_cron boolean;
  v_pg_net boolean;
  v_table boolean;
  v_trigger boolean;
  v_refresh_job boolean;
  v_process_job boolean;
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '8️⃣  RÉSUMÉ GLOBAL';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';

  -- Compter les points
  SELECT EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_cron') INTO v_pg_cron;
  SELECT EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_net') INTO v_pg_net;
  SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'evolution_instance_creation_queue') INTO v_table;
  SELECT EXISTS (SELECT FROM pg_trigger WHERE tgname = 'on_profile_created_create_evolution_instance') INTO v_trigger;
  SELECT EXISTS (SELECT FROM cron.job WHERE jobname = 'refresh-qr-codes' AND active = true) INTO v_refresh_job;
  SELECT EXISTS (SELECT FROM cron.job WHERE jobname = 'process-evolution-queue' AND active = true) INTO v_process_job;

  IF v_pg_cron AND v_pg_net THEN v_score := v_score + 1; END IF;
  IF v_table THEN v_score := v_score + 1; END IF;
  IF v_trigger THEN v_score := v_score + 1; END IF;
  IF v_refresh_job THEN v_score := v_score + 2; END IF;  -- Plus important
  IF v_process_job THEN v_score := v_score + 1; END IF;

  RAISE NOTICE 'Score de santé: %/%', v_score, v_max_score;
  RAISE NOTICE '';

  IF v_score = v_max_score THEN
    RAISE NOTICE '╔═══════════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║                                                                   ║';
    RAISE NOTICE '║                  🎉 TOUT FONCTIONNE PARFAITEMENT! 🎉              ║';
    RAISE NOTICE '║                                                                   ║';
    RAISE NOTICE '╚═══════════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    RAISE NOTICE 'Votre système est entièrement opérationnel:';
    RAISE NOTICE '  ✓ QR codes rafraîchis automatiquement toutes les 60 secondes';
    RAISE NOTICE '  ✓ Instances créées automatiquement lors de l''inscription';
    RAISE NOTICE '  ✓ Queue traitée toutes les 5 minutes';
    RAISE NOTICE '  ✓ Webhooks configurés automatiquement';
  ELSIF v_score >= 4 THEN
    RAISE NOTICE '⚠️  SYSTÈME PARTIELLEMENT FONCTIONNEL';
    RAISE NOTICE '';
    RAISE NOTICE 'Certains composants manquent. Consultez les sections ci-dessus';
    RAISE NOTICE 'pour voir ce qui doit être corrigé.';
  ELSE
    RAISE NOTICE '✗ SYSTÈME NON FONCTIONNEL';
    RAISE NOTICE '';
    RAISE NOTICE 'Action requise:';
    RAISE NOTICE '1. Si extensions manquantes: Activez pg_cron et pg_net';
    RAISE NOTICE '2. Si table/trigger manquant: Exécutez apply-migration-queue.sql';
    RAISE NOTICE '3. Si cron jobs manquants: Exécutez le script de config cron';
    RAISE NOTICE '';
    RAISE NOTICE 'Documentation: Consultez SQL_EXECUTION_GUIDE.md';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ VÉRIFICATION TERMINÉE';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';
END $$;
