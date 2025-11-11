# 🚀 Quick Start : Activation Automatique des Webhooks

> **Objectif** : Activer automatiquement les webhooks Evolution API lors de la création d'un utilisateur

## ⚡ Installation Rapide (3 commandes)

```bash
# 1. Appliquer la migration
supabase db push

# 2. Déployer les fonctions
supabase functions deploy process-evolution-queue
supabase functions deploy create-evolution-instance

# 3. Configurer le cron job (via SQL Editor dans Dashboard)
# Copiez-collez dans https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
```

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
    'process-evolution-queue',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
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

**⚠️ Remplacez :**
- `YOUR_PROJECT_REF`
- `YOUR_SERVICE_ROLE_KEY`

## ✅ C'est Tout !

**Maintenant, à chaque inscription :**
1. ✅ Utilisateur créé
2. ✅ Instance Evolution API créée automatiquement
3. ✅ Webhooks configurés automatiquement
4. ✅ Prêt à utiliser en < 5 minutes

## 🔍 Vérification Rapide

```sql
-- Voir la queue
SELECT * FROM evolution_instance_creation_queue ORDER BY created_at DESC LIMIT 5;

-- Voir les instances
SELECT instance_name, status, webhook_url FROM evolution_instances ORDER BY created_at DESC LIMIT 5;
```

## 📚 Documentation Complète

- **Guide complet** : [SETUP_AUTO_WEBHOOKS.md](SETUP_AUTO_WEBHOOKS.md)
- **Déploiement détaillé** : [DEPLOY_WEBHOOKS.md](DEPLOY_WEBHOOKS.md)
- **Changements** : [WEBHOOK_AUTOMATION_CHANGES.md](WEBHOOK_AUTOMATION_CHANGES.md)
- **Tests SQL** : [supabase/test-queries.sql](supabase/test-queries.sql)
- **Script de test** : `./test-webhook-setup.sh`

## 🆘 Problème ?

```bash
# Tester manuellement
curl -X POST \
    "https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-evolution-queue" \
    -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

# Voir les logs
supabase functions logs process-evolution-queue --tail
```

---

**Temps total d'installation** : ~10 minutes
**Maintenance requise** : Aucune (automatisé)
