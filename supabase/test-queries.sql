-- Requêtes SQL pour tester et monitorer le système de création automatique
-- d'instances Evolution API et de configuration des webhooks

-- ============================================================================
-- 1. VÉRIFICATIONS INITIALES
-- ============================================================================

-- Vérifier que la table queue existe
SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'evolution_instance_creation_queue'
) AS queue_table_exists;

-- Vérifier que le trigger existe et est activé
SELECT
    tgname AS trigger_name,
    tgenabled AS is_enabled,
    tgrelid::regclass AS table_name,
    proname AS function_name
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgname = 'on_profile_created_create_evolution_instance';

-- Vérifier les policies RLS sur la table queue
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'evolution_instance_creation_queue';

-- ============================================================================
-- 2. STATISTIQUES DE LA QUEUE
-- ============================================================================

-- Vue d'ensemble de la queue
SELECT
    status,
    COUNT(*) AS count,
    AVG(retry_count) AS avg_retries,
    MIN(created_at) AS oldest_entry,
    MAX(created_at) AS newest_entry
FROM evolution_instance_creation_queue
GROUP BY status
ORDER BY status;

-- Entrées récentes (dernières 24h)
SELECT
    user_id,
    status,
    retry_count,
    error_message,
    created_at,
    processed_at,
    (processed_at - created_at) AS processing_duration
FROM evolution_instance_creation_queue
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ============================================================================
-- 3. DÉTECTION DE PROBLÈMES
-- ============================================================================

-- Entrées bloquées en "processing" depuis plus de 10 minutes
SELECT
    user_id,
    request_id,
    status,
    retry_count,
    updated_at,
    NOW() - updated_at AS stuck_duration
FROM evolution_instance_creation_queue
WHERE status = 'processing'
AND updated_at < NOW() - INTERVAL '10 minutes'
ORDER BY updated_at;

-- Entrées échouées avec messages d'erreur
SELECT
    user_id,
    retry_count,
    error_message,
    created_at,
    updated_at
FROM evolution_instance_creation_queue
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 20;

-- Entrées en attente depuis plus d'une heure
SELECT
    user_id,
    retry_count,
    created_at,
    NOW() - created_at AS waiting_duration
FROM evolution_instance_creation_queue
WHERE status = 'pending'
AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at;

-- ============================================================================
-- 4. VÉRIFICATION DES INSTANCES CRÉÉES
-- ============================================================================

-- Instances créées dans les dernières 24h avec leur statut queue
SELECT
    ei.instance_name,
    ei.status AS instance_status,
    ei.webhook_url,
    ei.created_at AS instance_created,
    q.status AS queue_status,
    q.retry_count,
    (ei.created_at - q.created_at) AS time_to_create
FROM evolution_instances ei
LEFT JOIN evolution_instance_creation_queue q ON ei.user_id = q.user_id
WHERE ei.created_at > NOW() - INTERVAL '24 hours'
ORDER BY ei.created_at DESC;

-- Utilisateurs avec profil mais sans instance
SELECT
    p.id AS user_id,
    p.full_name,
    p.created_at AS profile_created,
    q.status AS queue_status,
    q.retry_count,
    q.error_message
FROM profiles p
LEFT JOIN evolution_instances ei ON p.id = ei.user_id
LEFT JOIN evolution_instance_creation_queue q ON p.id = q.user_id
WHERE ei.id IS NULL
AND p.created_at > NOW() - INTERVAL '7 days'
ORDER BY p.created_at DESC;

-- ============================================================================
-- 5. MÉTRIQUES DE PERFORMANCE
-- ============================================================================

-- Taux de succès par jour (7 derniers jours)
SELECT
    DATE(created_at) AS date,
    COUNT(*) AS total_requests,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*),
        2
    ) AS success_rate_percent
FROM evolution_instance_creation_queue
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Durée moyenne de traitement
SELECT
    DATE(processed_at) AS date,
    COUNT(*) AS processed_count,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) AS avg_seconds,
    MIN(EXTRACT(EPOCH FROM (processed_at - created_at))) AS min_seconds,
    MAX(EXTRACT(EPOCH FROM (processed_at - created_at))) AS max_seconds
FROM evolution_instance_creation_queue
WHERE status = 'completed'
AND processed_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(processed_at)
ORDER BY date DESC;

-- ============================================================================
-- 6. VÉRIFICATION DES WEBHOOKS
-- ============================================================================

-- Instances avec/sans webhook configuré
SELECT
    COUNT(*) AS total_instances,
    COUNT(*) FILTER (WHERE webhook_url IS NOT NULL) AS with_webhook,
    COUNT(*) FILTER (WHERE webhook_url IS NULL) AS without_webhook,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE webhook_url IS NOT NULL) / COUNT(*),
        2
    ) AS webhook_config_rate_percent
FROM evolution_instances;

-- Instances créées récemment sans webhook
SELECT
    instance_name,
    status,
    created_at,
    webhook_url
FROM evolution_instances
WHERE webhook_url IS NULL
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ============================================================================
-- 7. VÉRIFICATION DU CRON JOB
-- ============================================================================

-- Vérifier que pg_cron est activé
SELECT EXISTS (
    SELECT FROM pg_extension WHERE extname = 'pg_cron'
) AS pg_cron_enabled;

-- Liste des cron jobs configurés (si pg_cron est installé)
-- Note: Cette requête peut échouer si pg_cron n'est pas installé
SELECT
    jobid,
    jobname,
    schedule,
    command,
    active
FROM cron.job
WHERE jobname LIKE '%evolution%';

-- Historique récent d'exécution du cron job
-- Note: Cette requête peut échouer si pg_cron n'est pas installé
SELECT
    job.jobname,
    details.start_time,
    details.end_time,
    details.status,
    details.return_message,
    (details.end_time - details.start_time) AS duration
FROM cron.job_run_details details
JOIN cron.job job ON details.jobid = job.jobid
WHERE job.jobname = 'process-evolution-queue'
ORDER BY details.start_time DESC
LIMIT 10;

-- ============================================================================
-- 8. ACTIONS CORRECTIVES
-- ============================================================================

-- Réinitialiser les entrées bloquées en "processing"
-- ATTENTION: À exécuter manuellement si nécessaire
-- UPDATE evolution_instance_creation_queue
-- SET
--     status = 'pending',
--     updated_at = NOW()
-- WHERE status = 'processing'
-- AND updated_at < NOW() - INTERVAL '10 minutes';

-- Réinitialiser une entrée échouée spécifique
-- ATTENTION: Remplacer USER_ID_HERE par l'ID réel
-- UPDATE evolution_instance_creation_queue
-- SET
--     status = 'pending',
--     retry_count = 0,
--     error_message = NULL,
--     updated_at = NOW()
-- WHERE user_id = 'USER_ID_HERE';

-- Supprimer les entrées complétées anciennes (> 30 jours)
-- ATTENTION: À exécuter manuellement pour le nettoyage
-- DELETE FROM evolution_instance_creation_queue
-- WHERE status = 'completed'
-- AND processed_at < NOW() - INTERVAL '30 days';

-- ============================================================================
-- 9. TEST DE CRÉATION MANUELLE
-- ============================================================================

-- Insérer une entrée de test dans la queue (pour tester le système)
-- ATTENTION: Remplacer USER_ID_HERE par un ID utilisateur valide
-- INSERT INTO evolution_instance_creation_queue (
--     user_id,
--     request_id,
--     status,
--     created_at
-- )
-- VALUES (
--     'USER_ID_HERE',
--     gen_random_uuid(),
--     'pending',
--     NOW()
-- )
-- ON CONFLICT (user_id)
-- DO UPDATE SET
--     request_id = EXCLUDED.request_id,
--     status = 'pending',
--     updated_at = NOW(),
--     retry_count = evolution_instance_creation_queue.retry_count + 1
-- RETURNING *;

-- ============================================================================
-- 10. RAPPORT DE SANTÉ DU SYSTÈME
-- ============================================================================

-- Rapport complet de santé
WITH queue_stats AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM evolution_instance_creation_queue
    WHERE created_at > NOW() - INTERVAL '24 hours'
),
instance_stats AS (
    SELECT
        COUNT(*) AS total_instances,
        COUNT(*) FILTER (WHERE webhook_url IS NOT NULL) AS with_webhooks,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS created_today
    FROM evolution_instances
),
profile_stats AS (
    SELECT
        COUNT(*) AS total_profiles,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS created_today
    FROM profiles
)
SELECT
    'Queue Stats (24h)' AS category,
    jsonb_build_object(
        'total', q.total,
        'pending', q.pending,
        'processing', q.processing,
        'completed', q.completed,
        'failed', q.failed,
        'success_rate', ROUND(100.0 * q.completed / NULLIF(q.total, 0), 2)
    ) AS data
FROM queue_stats q
UNION ALL
SELECT
    'Instance Stats' AS category,
    jsonb_build_object(
        'total', i.total_instances,
        'with_webhooks', i.with_webhooks,
        'created_today', i.created_today,
        'webhook_config_rate', ROUND(100.0 * i.with_webhooks / NULLIF(i.total_instances, 0), 2)
    ) AS data
FROM instance_stats i
UNION ALL
SELECT
    'Profile Stats' AS category,
    jsonb_build_object(
        'total', p.total_profiles,
        'created_today', p.created_today
    ) AS data
FROM profile_stats p;
