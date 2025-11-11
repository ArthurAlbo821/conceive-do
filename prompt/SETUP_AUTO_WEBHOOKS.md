# Configuration automatique des webhooks Evolution API

Ce guide explique comment activer la création automatique d'instances Evolution API et la configuration des webhooks lors de l'inscription des utilisateurs.

## 🎯 Objectif

Automatiser complètement le processus suivant :
1. ✅ Utilisateur s'inscrit
2. ✅ Instance Evolution API créée automatiquement
3. ✅ Webhooks configurés automatiquement
4. ✅ Utilisateur peut immédiatement utiliser WhatsApp

## 📋 Prérequis

- Accès à votre projet Supabase
- Variables d'environnement configurées (voir `.env.example`)
- Accès à l'API Evolution

## 🚀 Installation (5 étapes)

### Étape 1 : Appliquer la migration de base de données

```bash
cd supabase
npx supabase migration up
```

Cette migration crée :
- ✅ Table `evolution_instance_creation_queue` pour gérer les créations en attente
- ✅ Fonction `handle_profile_evolution_instance()` déclenchée à chaque nouveau profil
- ✅ Trigger automatique sur la table `profiles`

### Étape 2 : Déployer les Edge Functions

```bash
# Déployer la nouvelle fonction de traitement de queue
npx supabase functions deploy process-evolution-queue

# Re-déployer create-evolution-instance avec les nouvelles fonctionnalités
npx supabase functions deploy create-evolution-instance
```

### Étape 3 : Configurer les variables d'environnement

Vérifiez que ces variables sont configurées pour vos Edge Functions :

```bash
# Vérifier les variables existantes
npx supabase functions env list

# Ajouter les variables manquantes si nécessaire
npx supabase functions env set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
npx supabase functions env set EVOLUTION_API_KEY=your_evolution_api_key
npx supabase functions env set EVOLUTION_API_BASE_URL=https://your-evolution-api.com
```

### Étape 4 : Configurer le Cron Job

#### Option A : Via Supabase Dashboard (Recommandé) ⭐

1. Connectez-vous à [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet
3. Allez dans **Database** → **Extensions**
4. Activez l'extension `pg_cron` si ce n'est pas déjà fait
5. Allez dans **SQL Editor**
6. Exécutez cette requête :

```sql
-- Créer le cron job pour traiter la queue toutes les 5 minutes
SELECT cron.schedule(
  'process-evolution-queue',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-evolution-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

⚠️ **Remplacez :**
- `YOUR_PROJECT_REF` par votre référence de projet (visible dans l'URL du Dashboard)
- `YOUR_SERVICE_ROLE_KEY` par votre clé service role (Settings → API → service_role key)

#### Option B : Appel manuel pour tests

Pour tester sans cron job :

```bash
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-evolution-queue \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### Étape 5 : Tester le flux complet

1. **Créer un nouveau compte utilisateur** via votre interface d'inscription

2. **Vérifier la queue** :
```sql
SELECT * FROM evolution_instance_creation_queue
ORDER BY created_at DESC
LIMIT 5;
```

3. **Attendre 5 minutes** ou déclencher manuellement :
```bash
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-evolution-queue \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

4. **Vérifier l'instance créée** :
```sql
SELECT
  ei.instance_name,
  ei.webhook_url,
  ei.status,
  ei.created_at,
  p.full_name
FROM evolution_instances ei
JOIN profiles p ON ei.user_id = p.id
ORDER BY ei.created_at DESC
LIMIT 5;
```

## 🔍 Monitoring et diagnostic

### Vérifier l'état de la queue

```sql
-- Statistiques globales
SELECT
  status,
  COUNT(*) as count,
  AVG(retry_count) as avg_retries
FROM evolution_instance_creation_queue
GROUP BY status;

-- Entrées en attente
SELECT * FROM evolution_instance_creation_queue
WHERE status = 'pending'
ORDER BY created_at;

-- Entrées échouées (à investiguer)
SELECT
  user_id,
  error_message,
  retry_count,
  created_at
FROM evolution_instance_creation_queue
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Consulter les logs

#### Via Dashboard Supabase :
1. **Edge Functions** → Sélectionnez la fonction → **Logs**

#### Rechercher des erreurs spécifiques :
```sql
-- Dans la table des logs (si configurée)
SELECT * FROM logs
WHERE message LIKE '%evolution%'
ORDER BY created_at DESC
LIMIT 20;
```

### Vérifier les webhooks configurés

```sql
-- Voir toutes les instances avec leurs webhooks
SELECT
  instance_name,
  status,
  webhook_url,
  instance_token IS NOT NULL as has_token,
  created_at
FROM evolution_instances
ORDER BY created_at DESC;
```

## 🔧 Dépannage

### Problème : Les instances ne sont pas créées automatiquement

**Solutions :**

1. **Vérifier que le trigger est actif :**
```sql
SELECT
  tgname as trigger_name,
  tgenabled as is_enabled,
  tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname = 'on_profile_created_create_evolution_instance';
```

2. **Vérifier les entrées dans la queue :**
```sql
SELECT COUNT(*), status
FROM evolution_instance_creation_queue
GROUP BY status;
```

3. **Réactiver le trigger si nécessaire :**
```sql
ALTER TABLE profiles
ENABLE TRIGGER on_profile_created_create_evolution_instance;
```

### Problème : Les webhooks ne sont pas activés

**Solutions :**

1. **Vérifier les variables d'environnement :**
```bash
npx supabase functions env list
```

2. **Tester manuellement la configuration des webhooks :**

Utilisez l'endpoint de test dans votre Dashboard ou :

```bash
# Depuis le frontend
# Cliquez sur "Reconfigurer les webhooks" dans les paramètres
```

3. **Vérifier les logs de create-evolution-instance :**
```bash
npx supabase functions logs create-evolution-instance
```

### Problème : Entrées bloquées en statut "processing"

Cela peut arriver si la fonction s'est arrêtée pendant le traitement.

**Solution - Réinitialiser les entrées :**
```sql
-- Réinitialiser les entrées bloquées en "processing" depuis plus de 10 minutes
UPDATE evolution_instance_creation_queue
SET
  status = 'pending',
  updated_at = NOW()
WHERE status = 'processing'
AND updated_at < NOW() - INTERVAL '10 minutes';
```

### Problème : Trop de retries échoués

**Solution - Réinitialiser une entrée spécifique :**
```sql
UPDATE evolution_instance_creation_queue
SET
  status = 'pending',
  retry_count = 0,
  error_message = NULL,
  updated_at = NOW()
WHERE user_id = 'USER_ID_HERE';
```

## 🧹 Maintenance

### Nettoyer les anciennes entrées

Créez un cron job pour nettoyer automatiquement les entrées complétées :

```sql
-- Nettoyer les entrées complétées de plus de 30 jours
SELECT cron.schedule(
  'cleanup-evolution-queue',
  '0 2 * * *', -- Tous les jours à 2h du matin
  $$
  DELETE FROM evolution_instance_creation_queue
  WHERE status = 'completed'
  AND processed_at < NOW() - INTERVAL '30 days';
  $$
);
```

### Vérifier l'état du cron job

```sql
-- Voir tous les cron jobs configurés
SELECT * FROM cron.job;

-- Voir l'historique d'exécution
SELECT * FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job
  WHERE jobname = 'process-evolution-queue'
)
ORDER BY start_time DESC
LIMIT 10;
```

## 📊 Métriques de succès

Après configuration, vous devriez voir :

✅ **Queue processing** : Nouvelles entrées traitées en < 5 minutes
✅ **Success rate** : > 95% de créations réussies
✅ **Webhook configuration** : 100% des instances avec webhooks actifs
✅ **User experience** : Instances prêtes avant première connexion

### Requête de reporting

```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*),
    2
  ) as success_rate
FROM evolution_instance_creation_queue
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## 🔐 Sécurité

- ✅ Les appels depuis la queue utilisent la `service_role_key`
- ✅ Les triggers s'exécutent avec `SECURITY DEFINER`
- ✅ RLS (Row Level Security) activé sur la table de queue
- ✅ Les utilisateurs ne peuvent voir que leurs propres entrées de queue

## 📚 Ressources supplémentaires

- [Documentation complète](supabase/functions/process-evolution-queue/README.md)
- [Migration SQL](supabase/migrations/20251101011848_auto_create_evolution_instances.sql)
- [Code source process-evolution-queue](supabase/functions/process-evolution-queue/index.ts)
- [Code source create-evolution-instance](supabase/functions/create-evolution-instance/index.ts)

## 💡 Support

Si vous rencontrez des problèmes :

1. Consultez les logs des Edge Functions
2. Vérifiez la table `evolution_instance_creation_queue`
3. Testez manuellement avec curl
4. Consultez la documentation détaillée dans `supabase/functions/process-evolution-queue/README.md`

---

**Date de création** : 2025-11-01
**Version** : 1.0.0
