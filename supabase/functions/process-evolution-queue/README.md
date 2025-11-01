# Evolution API Instance Queue Processor

Cette Edge Function traite la queue de création d'instances Evolution API. Elle est appelée automatiquement pour créer des instances et configurer les webhooks pour les nouveaux utilisateurs.

## Fonctionnement

1. **Trigger de création de profil** : Quand un nouvel utilisateur s'inscrit, un trigger de base de données ajoute une entrée dans la table `evolution_instance_creation_queue`
2. **Traitement de la queue** : Cette fonction est appelée périodiquement (toutes les 5 minutes) pour traiter les entrées en attente
3. **Création d'instance** : Pour chaque entrée, elle appelle `create-evolution-instance` pour créer l'instance Evolution API
4. **Configuration des webhooks** : Les webhooks sont automatiquement configurés lors de la création de l'instance

## Configuration

### 1. Appliquer la migration de base de données

```bash
npx supabase migration up
```

Cela crée :
- La table `evolution_instance_creation_queue`
- La fonction `handle_profile_evolution_instance()`
- Le trigger `on_profile_created_create_evolution_instance`

### 2. Déployer les Edge Functions

```bash
# Déployer la fonction de traitement de queue
npx supabase functions deploy process-evolution-queue

# Re-déployer create-evolution-instance avec les modifications
npx supabase functions deploy create-evolution-instance
```

### 3. Configurer le Cron Job

#### Option A : Via Supabase Dashboard (Recommandé)

1. Allez dans **Edge Functions > Cron Jobs**
2. Cliquez sur **New Cron Job**
3. Configurez :
   - **Name** : `process-evolution-queue`
   - **Schedule** : `*/5 * * * *` (toutes les 5 minutes)
   - **Function** : `process-evolution-queue`
   - **HTTP Method** : `POST`

#### Option B : Via pg_cron (Avancé)

Exécutez cette requête SQL dans votre base de données :

```sql
SELECT cron.schedule(
  'process-evolution-queue',
  '*/5 * * * *', -- Toutes les 5 minutes
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

Remplacez :
- `YOUR_PROJECT_REF` par votre référence de projet Supabase
- `YOUR_SERVICE_ROLE_KEY` par votre clé service role

### 4. Variables d'environnement requises

Assurez-vous que ces variables sont configurées dans vos Edge Functions :

```bash
# Pour process-evolution-queue
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Pour create-evolution-instance (déjà existantes)
EVOLUTION_API_KEY=your_evolution_api_key
EVOLUTION_API_BASE_URL=https://your-evolution-api-url.com
```

## Test manuel

Vous pouvez tester manuellement la fonction de traitement de queue :

```bash
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-evolution-queue \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Monitoring

### Vérifier la queue

```sql
-- Voir les entrées en attente
SELECT * FROM evolution_instance_creation_queue
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Voir les entrées échouées
SELECT * FROM evolution_instance_creation_queue
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Voir les statistiques
SELECT
  status,
  COUNT(*) as count,
  AVG(retry_count) as avg_retries
FROM evolution_instance_creation_queue
GROUP BY status;
```

### Logs des Edge Functions

Consultez les logs dans le Dashboard Supabase :
1. Allez dans **Edge Functions**
2. Cliquez sur la fonction
3. Consultez l'onglet **Logs**

## Gestion des erreurs

### Politique de retry

- **Maximum de retries** : 3 tentatives
- **Backoff exponentiel** : 800ms, 1600ms, 3200ms
- **Statut après échec** : `failed` après 3 tentatives

### Réessayer manuellement une entrée échouée

```sql
-- Réinitialiser une entrée échouée
UPDATE evolution_instance_creation_queue
SET
  status = 'pending',
  retry_count = 0,
  error_message = NULL,
  updated_at = NOW()
WHERE user_id = 'user_id_here';
```

## Nettoyage

Pour nettoyer les anciennes entrées complétées :

```sql
-- Supprimer les entrées complétées de plus de 30 jours
DELETE FROM evolution_instance_creation_queue
WHERE status = 'completed'
AND processed_at < NOW() - INTERVAL '30 days';
```

Vous pouvez créer un cron job pour cela :

```sql
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

## Dépannage

### Les instances ne sont pas créées automatiquement

1. Vérifiez que le trigger est actif :
```sql
SELECT * FROM pg_trigger
WHERE tgname = 'on_profile_created_create_evolution_instance';
```

2. Vérifiez les entrées dans la queue :
```sql
SELECT * FROM evolution_instance_creation_queue
ORDER BY created_at DESC
LIMIT 10;
```

3. Vérifiez les logs de la fonction `process-evolution-queue`

### Les webhooks ne sont pas configurés

1. Vérifiez les variables d'environnement :
```bash
npx supabase functions env list
```

2. Testez manuellement la création d'instance :
```bash
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-evolution-instance \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"forceRefresh": true}'
```

3. Consultez les logs de `create-evolution-instance` pour voir les détails de la configuration des webhooks

## Architecture

```
User Signup
    ↓
auth.users INSERT
    ↓
Trigger: on_auth_user_created
    ↓
profiles INSERT
    ↓
Trigger: on_profile_created_create_evolution_instance
    ↓
Function: handle_profile_evolution_instance()
    ↓
evolution_instance_creation_queue INSERT (status: pending)
    ↓
Cron Job (every 5 minutes)
    ↓
Edge Function: process-evolution-queue
    ↓
Edge Function: create-evolution-instance
    ↓
Evolution API: Create Instance + Configure Webhooks
    ↓
evolution_instances INSERT + Queue UPDATE (status: completed)
```

## Événements webhook configurés

Les webhooks suivants sont automatiquement activés :
- `QRCODE_UPDATED` : Mise à jour du QR code de connexion
- `CONNECTION_UPDATE` : Changement de statut de connexion
- `MESSAGES_UPSERT` : Nouveaux messages reçus
- `MESSAGES_UPDATE` : Messages mis à jour
- `SEND_MESSAGE` : Messages envoyés

URL du webhook : `${SUPABASE_URL}/functions/v1/evolution-webhook-handler`
