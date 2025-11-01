# 🚀 Quick Start : Rafraîchissement Automatique des QR Codes

> **Objectif** : QR codes WhatsApp rafraîchis automatiquement toutes les **60 secondes**

## ⚡ Installation en 3 Étapes

### 1. Déployer la fonction

```bash
supabase functions deploy refresh-qr-codes --no-verify-jwt
```

### 2. Activer le cron job

Ouvrez le **SQL Editor** dans Supabase Dashboard et exécutez :

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'refresh-qr-codes',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-qr-codes',
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
- `YOUR_PROJECT_REF` → Votre référence de projet
- `YOUR_SERVICE_ROLE_KEY` → Votre clé service role

### 3. Vérifier

```sql
-- Voir le cron job
SELECT * FROM cron.job WHERE jobname = 'refresh-qr-codes';

-- Tester manuellement
SELECT net.http_post(
  url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-qr-codes',
  headers := jsonb_build_object('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'),
  body := '{}'::jsonb
);
```

## ✅ C'est Tout !

**Résultat :**
- ✅ QR codes rafraîchis toutes les **60 secondes**
- ✅ Mise à jour automatique du frontend via real-time
- ✅ Fonctionne même si l'utilisateur n'a pas la page ouverte
- ✅ Les utilisateurs ont toujours un QR code valide

## 🔍 Monitoring Rapide

```sql
-- Voir les dernières exécutions
SELECT start_time, status, return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes')
ORDER BY start_time DESC
LIMIT 5;

-- Voir les QR codes récents
SELECT instance_name, last_qr_update, NOW() - last_qr_update AS age
FROM evolution_instances
WHERE instance_status = 'connecting'
ORDER BY last_qr_update DESC;
```

## 🐛 Problème ?

```bash
# Tester manuellement
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-qr-codes" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

# Voir les logs
supabase functions logs refresh-qr-codes --tail
```

## 📚 Documentation Complète

- **Guide complet** : [QR_REFRESH_SETUP.md](QR_REFRESH_SETUP.md)
- **Code source** : [supabase/functions/refresh-qr-codes/index.ts](supabase/functions/refresh-qr-codes/index.ts)
- **Script SQL** : [supabase/sql/setup-qr-refresh-cron.sql](supabase/sql/setup-qr-refresh-cron.sql)

---

**Temps d'installation** : ~5 minutes
**Maintenance** : Aucune (automatisé)
**Fréquence** : 60 secondes
