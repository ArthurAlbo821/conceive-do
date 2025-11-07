-- Script de diagnostic pour vérifier la configuration du webhook

-- 1. Vérifier les instances Evolution API
SELECT
  id,
  instance_name,
  instance_status,
  phone_number,
  webhook_url,
  CASE
    WHEN instance_token IS NOT NULL THEN '✅ Token présent'
    ELSE '❌ Token manquant'
  END as token_status,
  created_at,
  updated_at
FROM evolution_instances
ORDER BY created_at DESC;

-- 2. Vérifier les conversations et leur statut AI
SELECT
  c.id,
  c.contact_name,
  c.contact_phone,
  c.ai_enabled,
  c.instance_id,
  ei.instance_name,
  ei.instance_status,
  c.created_at,
  COUNT(m.id) as message_count
FROM conversations c
LEFT JOIN evolution_instances ei ON ei.id = c.instance_id
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY c.id, c.contact_name, c.contact_phone, c.ai_enabled, c.instance_id, ei.instance_name, ei.instance_status, c.created_at
ORDER BY c.created_at DESC;

-- 3. Vérifier les messages des dernières 24h
SELECT
  m.id,
  m.content,
  m.from_me,
  m.timestamp,
  c.contact_name,
  c.contact_phone,
  c.ai_enabled,
  ei.instance_name
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
JOIN evolution_instances ei ON ei.id = c.instance_id
WHERE m.created_at > NOW() - INTERVAL '24 hours'
ORDER BY m.timestamp DESC;

-- 4. Vérifier les conversations sans messages
SELECT
  c.id,
  c.contact_name,
  c.contact_phone,
  c.ai_enabled,
  c.created_at,
  ei.instance_name,
  ei.instance_status
FROM conversations c
JOIN evolution_instances ei ON ei.id = c.instance_id
LEFT JOIN messages m ON m.conversation_id = c.id
WHERE m.id IS NULL
ORDER BY c.created_at DESC;
