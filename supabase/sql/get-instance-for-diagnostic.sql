-- ============================================================================
-- Script pour récupérer les informations de l'instance pour le diagnostic
-- ============================================================================

-- Sélectionner l'instance récente qui a été créée
SELECT
  instance_name,
  instance_token,
  webhook_url,
  instance_status,
  created_at,
  user_id,
  -- Masquer une partie du token pour la sécurité (premiers et derniers caractères uniquement)
  LEFT(instance_token, 20) || '...' || RIGHT(instance_token, 10) AS token_preview
FROM evolution_instances
WHERE instance_name = 'user_a64ff7e6-5e00-4ff9-9fe6-66ab85386d80'
LIMIT 1;

-- Instructions pour utiliser ces informations :
-- 1. Copiez l'instance_name et l'instance_token complet
-- 2. Utilisez-les pour appeler la fonction diagnose-webhook
--
-- Exemple de commande curl :
-- curl -X POST \
--   https://YOUR_PROJECT_ID.supabase.co/functions/v1/diagnose-webhook \
--   -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
--   -H "Content-Type: application/json" \
--   -d '{
--     "instanceName": "COPIER_ICI",
--     "instanceToken": "COPIER_ICI",
--     "userId": "YOUR_USER_ID"
--   }'
