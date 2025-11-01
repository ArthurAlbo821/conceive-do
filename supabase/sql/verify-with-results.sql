-- ============================================================================
-- SCRIPT DE VÉRIFICATION AVEC RÉSULTATS VISIBLES
-- Version qui retourne des tableaux au lieu de RAISE NOTICE
-- ============================================================================

-- Section 1: Extensions
SELECT
  'Extensions' as section,
  CASE
    WHEN EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_cron') THEN '✓'
    ELSE '✗'
  END as pg_cron,
  CASE
    WHEN EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_net') THEN '✓'
    ELSE '✗'
  END as pg_net;

-- Section 2: Table de queue
SELECT
  'Table Queue' as section,
  CASE
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'evolution_instance_creation_queue')
    THEN '✓ EXISTE'
    ELSE '✗ MANQUANTE'
  END as status,
  COALESCE((SELECT COUNT(*)::text FROM evolution_instance_creation_queue), '0') as total_entries;

-- Section 3: Trigger et Fonction
SELECT
  'Trigger & Fonction' as section,
  CASE
    WHEN EXISTS (SELECT FROM pg_trigger WHERE tgname = 'on_profile_created_create_evolution_instance')
    THEN '✓ EXISTE'
    ELSE '✗ MANQUANT'
  END as trigger_status,
  CASE
    WHEN EXISTS (SELECT FROM pg_proc WHERE proname = 'handle_profile_evolution_instance')
    THEN '✓ EXISTE'
    ELSE '✗ MANQUANTE'
  END as function_status;

-- Section 4: Cron Jobs
SELECT
  'Cron Jobs' as section,
  COALESCE(
    (SELECT CASE
      WHEN active THEN '✓ ACTIF - ' || schedule
      ELSE '✗ INACTIF - ' || schedule
    END
    FROM cron.job
    WHERE jobname = 'refresh-qr-codes'),
    '✗ MANQUANT'
  ) as refresh_qr_codes,
  COALESCE(
    (SELECT CASE
      WHEN active THEN '✓ ACTIF - ' || schedule
      ELSE '✗ INACTIF - ' || schedule
    END
    FROM cron.job
    WHERE jobname = 'process-evolution-queue'),
    '✗ MANQUANT'
  ) as process_queue;

-- Section 5: QR Codes (LE PLUS IMPORTANT)
SELECT
  'QR Codes' as section,
  COUNT(*) as total_instances,
  COUNT(*) FILTER (WHERE instance_status = 'connecting') as instances_connecting,
  COUNT(*) FILTER (WHERE instance_status = 'connected') as instances_connected,
  MAX(last_qr_update) as dernier_refresh,
  CASE
    WHEN MAX(last_qr_update) IS NULL THEN 'Aucun QR'
    WHEN EXTRACT(EPOCH FROM (NOW() - MAX(last_qr_update)))::integer / 60 < 2 THEN '✓ < 2 min (PARFAIT)'
    WHEN EXTRACT(EPOCH FROM (NOW() - MAX(last_qr_update)))::integer / 60 < 5 THEN '✓ < 5 min (OK)'
    WHEN EXTRACT(EPOCH FROM (NOW() - MAX(last_qr_update)))::integer / 60 < 10 THEN '⚠ 5-10 min (Un peu ancien)'
    ELSE '✗ > 10 min (PROBLÈME!)'
  END as statut_qr
FROM evolution_instances;

-- Section 6: Queue de création
SELECT
  'Queue Création' as section,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*)) * 100, 1)
  END as taux_succes
FROM evolution_instance_creation_queue;

-- Section 7: Historique Cron (dernières 2 heures)
SELECT
  'Historique Cron' as section,
  COALESCE(
    (SELECT COUNT(*)::text
    FROM cron.job_run_details d
    JOIN cron.job j ON d.jobid = j.jobid
    WHERE j.jobname = 'refresh-qr-codes'
    AND d.start_time > NOW() - INTERVAL '2 hours'),
    '0'
  ) as executions_refresh_qr,
  COALESCE(
    (SELECT COUNT(*)::text
    FROM cron.job_run_details d
    JOIN cron.job j ON d.jobid = j.jobid
    WHERE j.jobname = 'process-evolution-queue'
    AND d.start_time > NOW() - INTERVAL '2 hours'),
    '0'
  ) as executions_process_queue,
  COALESCE(
    (SELECT MAX(d.start_time)::text
    FROM cron.job_run_details d
    JOIN cron.job j ON d.jobid = j.jobid
    WHERE j.jobname = 'refresh-qr-codes'),
    'Jamais'
  ) as derniere_exec_refresh;

-- Section 8: SCORE GLOBAL
SELECT
  'RÉSUMÉ GLOBAL' as "╔═══════════════╗",
  CASE
    WHEN (
      (SELECT COUNT(*) FROM (
        SELECT 1 WHERE EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_cron')
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_net')
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'evolution_instance_creation_queue')
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM pg_trigger WHERE tgname = 'on_profile_created_create_evolution_instance')
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM cron.job WHERE jobname = 'refresh-qr-codes' AND active = true)
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM cron.job WHERE jobname = 'process-evolution-queue' AND active = true)
      ) checks) >= 6
    )
    THEN '🎉 TOUT FONCTIONNE PARFAITEMENT! 🎉'
    WHEN (
      (SELECT COUNT(*) FROM (
        SELECT 1 WHERE EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_cron')
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_net')
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'evolution_instance_creation_queue')
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM pg_trigger WHERE tgname = 'on_profile_created_create_evolution_instance')
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM cron.job WHERE jobname = 'refresh-qr-codes' AND active = true)
        UNION ALL
        SELECT 1 WHERE EXISTS (SELECT FROM cron.job WHERE jobname = 'process-evolution-queue' AND active = true)
      ) checks) >= 4
    )
    THEN '⚠️ SYSTÈME PARTIELLEMENT FONCTIONNEL'
    ELSE '✗ SYSTÈME NON FONCTIONNEL'
  END as "║ STATUT FINAL ║",
  (
    SELECT CONCAT(COUNT(*)::text, '/6') FROM (
      SELECT 1 WHERE EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_cron')
      UNION ALL
      SELECT 1 WHERE EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_net')
      UNION ALL
      SELECT 1 WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'evolution_instance_creation_queue')
      UNION ALL
      SELECT 1 WHERE EXISTS (SELECT FROM pg_trigger WHERE tgname = 'on_profile_created_create_evolution_instance')
      UNION ALL
      SELECT 1 WHERE EXISTS (SELECT FROM cron.job WHERE jobname = 'refresh-qr-codes' AND active = true)
      UNION ALL
      SELECT 1 WHERE EXISTS (SELECT FROM cron.job WHERE jobname = 'process-evolution-queue' AND active = true)
    ) checks
  ) as "Score";
