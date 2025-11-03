-- ============================================================================
-- Configuration du cron job pour rafraîchissement automatique des QR codes
-- Exécutez ce script dans le SQL Editor de Supabase Dashboard
-- ============================================================================

-- Étape 1: Activer les extensions requises
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Étape 2: Supprimer les anciens cron jobs s'ils existent
DO $$
BEGIN
  -- Supprimer refresh-qr-codes si existe
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-qr-codes') THEN
    PERFORM cron.unschedule('refresh-qr-codes');
    RAISE NOTICE '✓ Ancien cron job refresh-qr-codes supprimé';
  END IF;

  -- Supprimer process-evolution-queue si existe
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-evolution-queue') THEN
    PERFORM cron.unschedule('process-evolution-queue');
    RAISE NOTICE '✓ Ancien cron job process-evolution-queue supprimé';
  END IF;
END $$;

-- Étape 3: Créer le cron job pour rafraîchir les QR codes toutes les minutes
-- Ce job appelle directement la fonction refresh-qr-codes
DO $$
DECLARE
  v_project_url text := 'https://YOUR_PROJECT_ID.supabase.co';
  v_service_key text;
BEGIN
  -- Récupérer la service role key depuis les secrets
  -- Note: Dans un environnement de production, vous devriez utiliser vault.secrets
  -- Pour ce script, nous allons utiliser une approche alternative

  -- Créer le cron job qui sera appelé avec la clé dans les headers HTTP
  PERFORM cron.schedule(
    'refresh-qr-codes',
    '*/1 * * * *',  -- Toutes les 1 minute
    format($$
      SELECT net.http_post(
        url := '%s/functions/v1/refresh-qr-codes',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
    $$, v_project_url)
  );

  RAISE NOTICE '✅ Cron job refresh-qr-codes créé (toutes les 1 minute)';
END $$;

-- Étape 4: Créer le cron job pour traiter la queue d'instances toutes les 5 minutes
DO $$
DECLARE
  v_project_url text := 'https://YOUR_PROJECT_ID.supabase.co';
BEGIN
  PERFORM cron.schedule(
    'process-evolution-queue',
    '*/5 * * * *',  -- Toutes les 5 minutes
    format($$
      SELECT net.http_post(
        url := '%s/functions/v1/process-evolution-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
    $$, v_project_url)
  );

  RAISE NOTICE '✅ Cron job process-evolution-queue créé (toutes les 5 minutes)';
END $$;

-- Étape 5: Vérifier que les cron jobs ont été créés
SELECT
  jobid,
  jobname,
  schedule,
  active,
  CASE
    WHEN active THEN '✓ Actif'
    ELSE '✗ Inactif'
  END AS status
FROM cron.job
WHERE jobname IN ('refresh-qr-codes', 'process-evolution-queue')
ORDER BY jobname;

-- Étape 6: Afficher un message de confirmation
DO $$
DECLARE
  qr_job_count INTEGER;
  queue_job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO qr_job_count
  FROM cron.job
  WHERE jobname = 'refresh-qr-codes' AND active = true;

  SELECT COUNT(*) INTO queue_job_count
  FROM cron.job
  WHERE jobname = 'process-evolution-queue' AND active = true;

  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ CONFIGURATION DES CRON JOBS TERMINÉE';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Jobs créés:';

  IF qr_job_count > 0 THEN
    RAISE NOTICE '   ✓ refresh-qr-codes: Toutes les 1 minute';
  ELSE
    RAISE NOTICE '   ✗ refresh-qr-codes: ÉCHEC';
  END IF;

  IF queue_job_count > 0 THEN
    RAISE NOTICE '   ✓ process-evolution-queue: Toutes les 5 minutes';
  ELSE
    RAISE NOTICE '   ✗ process-evolution-queue: ÉCHEC';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '🔍 Pour surveiller les exécutions:';
  RAISE NOTICE '   SELECT * FROM cron.job_run_details';
  RAISE NOTICE '   ORDER BY start_time DESC LIMIT 10;';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Configurez app.settings.service_role_key';
  RAISE NOTICE '   Voir la documentation pour plus de détails';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- ============================================================================
-- ALTERNATIVE: Si app.settings ne fonctionne pas, utilisez cette version
-- ============================================================================
-- Décommentez et remplacez YOUR_SERVICE_ROLE_KEY par votre vraie clé

/*
-- Version avec clé hardcodée (à utiliser en dernier recours)
SELECT cron.unschedule('refresh-qr-codes');
SELECT cron.unschedule('process-evolution-queue');

SELECT cron.schedule(
  'refresh-qr-codes',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/refresh-qr-codes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  )
  $$
);

SELECT cron.schedule(
  'process-evolution-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/process-evolution-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  )
  $$
);
*/
