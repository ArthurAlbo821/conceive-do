# Guide de Déploiement - Configuration Automatique des Webhooks

Ce guide fournit les commandes exactes à exécuter pour déployer la configuration automatique des webhooks Evolution API.

## 📋 Checklist Pré-Déploiement

Avant de commencer, assurez-vous que :

- [ ] Vous avez accès au Dashboard Supabase
- [ ] Vous avez les clés API (service_role_key)
- [ ] Vous avez les accès à Evolution API
- [ ] Vous avez Supabase CLI installé (`npm install -g supabase`)
- [ ] Vous êtes connecté à Supabase CLI (`supabase login`)

## 🚀 Étapes de Déploiement

### Étape 1 : Préparer l'environnement

```bash
# Se connecter au projet Supabase
supabase link --project-ref YOUR_PROJECT_REF

# Vérifier la connexion
supabase status
```

### Étape 2 : Appliquer la migration de base de données

```bash
# Appliquer toutes les migrations en attente
supabase db push

# OU appliquer uniquement la migration spécifique
supabase db push --include-all --include-seed
```

**Vérification :**
```bash
# Vérifier que la table existe
supabase db execute "SELECT COUNT(*) FROM evolution_instance_creation_queue;"
```

### Étape 3 : Déployer les Edge Functions

```bash
# Déployer process-evolution-queue
supabase functions deploy process-evolution-queue --no-verify-jwt

# Déployer create-evolution-instance (mise à jour)
supabase functions deploy create-evolution-instance --no-verify-jwt

# Vérifier le déploiement
supabase functions list
```

### Étape 4 : Configurer les variables d'environnement

```bash
# Option A : Via fichier .env
cat > .env.functions << EOF
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
EVOLUTION_API_KEY=your_evolution_api_key_here
EVOLUTION_API_BASE_URL=https://your-evolution-api.com
EOF

# Puis les appliquer
supabase secrets set --env-file .env.functions

# Option B : Une par une
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
supabase secrets set EVOLUTION_API_KEY=your_evolution_api_key_here
supabase secrets set EVOLUTION_API_BASE_URL=https://your-evolution-api.com

# Vérifier
supabase secrets list
```

### Étape 5 : Configurer le Cron Job

#### Via SQL Editor dans Supabase Dashboard

1. Allez sur : `https://supabase.com/dashboard/project/YOUR_PROJECT_REF/sql/new`

2. Exécutez cette requête :

```sql
-- Activer l'extension pg_cron si nécessaire
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Activer l'extension pg_net pour les appels HTTP
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Créer le cron job
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

**⚠️ IMPORTANT : Remplacez :**
- `YOUR_PROJECT_REF` par votre référence de projet
- `YOUR_SERVICE_ROLE_KEY` par votre clé service role

3. Vérifier que le cron job est créé :

```sql
SELECT * FROM cron.job WHERE jobname = 'process-evolution-queue';
```

#### Via Supabase CLI (Alternative)

```bash
# Créer un fichier SQL
cat > setup-cron.sql << 'EOF'
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
    'process-evolution-queue',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/process-evolution-queue',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
EOF

# Exécuter le fichier SQL
supabase db execute -f setup-cron.sql
```

### Étape 6 : Tester le déploiement

```bash
# Exécuter le script de test
./test-webhook-setup.sh

# OU tester manuellement
curl -X POST \
    "https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-evolution-queue" \
    -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json"
```

### Étape 7 : Créer un utilisateur test

```bash
# Via l'interface web de votre application
# OU via API Supabase

curl -X POST \
    "https://YOUR_PROJECT_REF.supabase.co/auth/v1/signup" \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "test@example.com",
        "password": "testpassword123",
        "data": {
            "full_name": "Test User"
        }
    }'
```

### Étape 8 : Vérifier que tout fonctionne

```bash
# 1. Vérifier la queue
supabase db execute "SELECT * FROM evolution_instance_creation_queue ORDER BY created_at DESC LIMIT 5;"

# 2. Attendre 5 minutes (ou déclencher manuellement)
curl -X POST \
    "https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-evolution-queue" \
    -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

# 3. Vérifier que l'instance est créée
supabase db execute "SELECT instance_name, status, webhook_url FROM evolution_instances ORDER BY created_at DESC LIMIT 5;"
```

## 🔍 Vérifications Post-Déploiement

### 1. Vérifier les tables

```sql
-- Via Dashboard SQL Editor ou CLI
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('evolution_instance_creation_queue', 'evolution_instances', 'profiles');
```

### 2. Vérifier les triggers

```sql
SELECT
    tgname,
    tgenabled,
    tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname = 'on_profile_created_create_evolution_instance';
```

### 3. Vérifier les Edge Functions

```bash
# Lister les fonctions déployées
supabase functions list

# Voir les logs
supabase functions logs process-evolution-queue --tail
supabase functions logs create-evolution-instance --tail
```

### 4. Vérifier le cron job

```sql
-- Voir le cron job
SELECT * FROM cron.job WHERE jobname = 'process-evolution-queue';

-- Voir l'historique d'exécution
SELECT *
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-evolution-queue')
ORDER BY start_time DESC
LIMIT 5;
```

## 🐛 Résolution de Problèmes

### Problème : Migration échoue

```bash
# Voir l'état des migrations
supabase migration list

# Réparer si nécessaire
supabase db reset --db-only
supabase db push
```

### Problème : Edge Function ne se déploie pas

```bash
# Vérifier les erreurs de syntaxe
deno check supabase/functions/process-evolution-queue/index.ts

# Forcer le redéploiement
supabase functions deploy process-evolution-queue --no-verify-jwt --debug
```

### Problème : Cron job ne s'exécute pas

```sql
-- Vérifier que pg_cron est activé
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Si non activé
CREATE EXTENSION pg_cron;

-- Vérifier les permissions
GRANT USAGE ON SCHEMA cron TO postgres;

-- Redémarrer le cron job
SELECT cron.unschedule('process-evolution-queue');
-- Puis recréer (voir Étape 5)
```

### Problème : Variables d'environnement non accessibles

```bash
# Lister toutes les variables
supabase secrets list

# Les redéfinir si nécessaire
supabase secrets set KEY=VALUE

# Redéployer les fonctions après modification
supabase functions deploy process-evolution-queue --no-verify-jwt
```

## 🔄 Rollback (Retour en Arrière)

Si vous devez annuler le déploiement :

### 1. Désactiver le cron job

```sql
SELECT cron.unschedule('process-evolution-queue');
```

### 2. Désactiver le trigger

```sql
ALTER TABLE profiles
DISABLE TRIGGER on_profile_created_create_evolution_instance;
```

### 3. Supprimer les Edge Functions (optionnel)

```bash
# Via Dashboard Supabase > Edge Functions > Delete
# Ou garder les fonctions mais ne plus les appeler
```

### 4. Nettoyer la queue (optionnel)

```sql
-- Supprimer les entrées en attente
DELETE FROM evolution_instance_creation_queue
WHERE status = 'pending';
```

## 📊 Monitoring en Production

### Dashboard de monitoring

Créez une vue pour surveiller l'état du système :

```sql
CREATE OR REPLACE VIEW v_webhook_health AS
WITH recent_queue AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM evolution_instance_creation_queue
    WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT
    (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '24 hours') AS new_profiles_24h,
    (SELECT COUNT(*) FROM evolution_instances WHERE created_at > NOW() - INTERVAL '24 hours') AS new_instances_24h,
    rq.total AS queue_entries_24h,
    rq.pending,
    rq.completed,
    rq.failed,
    ROUND(100.0 * rq.completed / NULLIF(rq.total, 0), 2) AS success_rate
FROM recent_queue rq;

-- Consulter la vue
SELECT * FROM v_webhook_health;
```

### Alertes

Configurez des alertes dans Supabase Dashboard :
- Alert si `pending > 10` pendant plus de 30 minutes
- Alert si `success_rate < 90%`
- Alert si `failed > 5`

## 📚 Ressources

- [Documentation complète](SETUP_AUTO_WEBHOOKS.md)
- [Requêtes de test](supabase/test-queries.sql)
- [Script de test](test-webhook-setup.sh)
- [Migration SQL](supabase/migrations/20251101011848_auto_create_evolution_instances.sql)

## ✅ Checklist de Déploiement Complète

Après déploiement, vérifiez que :

- [ ] Migration appliquée avec succès
- [ ] Table `evolution_instance_creation_queue` créée
- [ ] Trigger `on_profile_created_create_evolution_instance` actif
- [ ] Edge Function `process-evolution-queue` déployée
- [ ] Edge Function `create-evolution-instance` mise à jour
- [ ] Variables d'environnement configurées
- [ ] Cron job créé et actif
- [ ] Test avec un utilisateur réel réussi
- [ ] Instance créée automatiquement
- [ ] Webhooks configurés et fonctionnels
- [ ] Logs accessibles et clairs

---

**Version** : 1.0.0
**Date** : 2025-11-01
**Contact** : Consultez la documentation pour le support
