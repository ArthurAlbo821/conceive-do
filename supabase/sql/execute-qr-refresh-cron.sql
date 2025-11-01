-- ============================================================================
-- Script d'installation du cron job pour rafraîchissement QR codes
-- À exécuter dans le SQL Editor de Supabase Dashboard
-- ============================================================================
--
-- IMPORTANT: Remplacez YOUR_SERVICE_ROLE_KEY par votre vraie clé service role
-- Trouvez-la dans: Dashboard > Settings > API > service_role key
--
-- ============================================================================

-- Étape 1: Activer les extensions requises
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Vérifier que les extensions sont activées
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Extension pg_cron not available. Enable it in Dashboard > Database > Extensions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'Extension pg_net not available. Enable it in Dashboard > Database > Extensions';
  END IF;
  RAISE NOTICE 'Extensions pg_cron and pg_net are enabled ✓';
END $$;

-- Étape 2: Désactiver le cron job existant s'il existe (permet de réexécuter ce script)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-qr-codes') THEN
    PERFORM cron.unschedule('refresh-qr-codes');
    RAISE NOTICE 'Existing cron job removed';
  END IF;
END $$;

-- Étape 3: Créer le cron job pour rafraîchir les QR codes toutes les minutes
-- ⚠️ REMPLACEZ YOUR_SERVICE_ROLE_KEY CI-DESSOUS PAR VOTRE VRAIE CLÉ
SELECT cron.schedule(
  'refresh-qr-codes',           -- Nom du job
  '*/1 * * * *',                -- Toutes les 1 minute
  $$
  SELECT
    net.http_post(
      url := 'https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/refresh-qr-codes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'  -- ⚠️ REMPLACEZ ICI
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Étape 4: Vérifier que le cron job a été créé
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
WHERE jobname = 'refresh-qr-codes';

-- Expected output:
-- jobid | jobname           | schedule    | active | status
-- ------|-------------------|-------------|--------|--------
-- XXX   | refresh-qr-codes  | */1 * * * * | t      | ✓ Actif

-- Étape 5: Afficher un message de confirmation
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname = 'refresh-qr-codes' AND active = true;

  IF job_count > 0 THEN
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Cron job "refresh-qr-codes" créé avec succès!';
    RAISE NOTICE '   Fréquence: Toutes les 1 minute';
    RAISE NOTICE '   URL: https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/refresh-qr-codes';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Pour vérifier les exécutions:';
    RAISE NOTICE '   SELECT * FROM cron.job_run_details';
    RAISE NOTICE '   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = ''refresh-qr-codes'')';
    RAISE NOTICE '   ORDER BY start_time DESC LIMIT 10;';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  ELSE
    RAISE EXCEPTION 'Échec de la création du cron job. Vérifiez les erreurs ci-dessus.';
  END IF;
END $$;

-- ============================================================================
-- COMMANDES UTILES POUR LA GESTION DU CRON JOB
-- ============================================================================

-- Pour voir l'historique des exécutions (décommentez pour utiliser):
-- SELECT
--   job.jobname,
--   details.start_time,
--   details.end_time,
--   details.status,
--   details.return_message,
--   (details.end_time - details.start_time) AS duration
-- FROM cron.job_run_details details
-- JOIN cron.job job ON details.jobid = job.jobid
-- WHERE job.jobname = 'refresh-qr-codes'
-- ORDER BY details.start_time DESC
-- LIMIT 20;

-- Pour désactiver temporairement le cron job:
-- UPDATE cron.job SET active = false WHERE jobname = 'refresh-qr-codes';

-- Pour réactiver le cron job:
-- UPDATE cron.job SET active = true WHERE jobname = 'refresh-qr-codes';

-- Pour supprimer complètement le cron job:
-- SELECT cron.unschedule('refresh-qr-codes');

-- Pour tester manuellement l'appel (décommentez et remplacez la clé):
-- SELECT net.http_post(
--   url := 'https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/refresh-qr-codes',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--   ),
--   body := '{}'::jsonb
-- );
