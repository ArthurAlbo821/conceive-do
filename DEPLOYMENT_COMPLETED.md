# ✅ Déploiement Complété - Prochaines Étapes

## 🎉 Fonctions Déployées avec Succès

Les Edge Functions suivantes ont été déployées sur Supabase :

- ✅ **refresh-qr-codes** - Rafraîchit les QR codes toutes les minutes
- ✅ **create-evolution-instance** - Créer des instances (version mise à jour)
- ✅ **process-evolution-queue** - Traite la queue de création d'instances

Dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/functions

## 🔧 Configuration Restante

### Étape 1 : Configurer le Cron Job (REQUIS)

Le cron job n'a pas encore été configuré car il nécessite votre **Service Role Key** (qui ne devrait jamais être commitée dans le code).

#### Option A : Via SQL Editor (Recommandé)

1. **Récupérer votre Service Role Key** :
   - Allez sur: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/api
   - Copiez la clé **service_role** (la longue clé secrète, PAS l'anon key)

2. **Ouvrir le SQL Editor** :
   - https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

3. **Copier le script SQL** :
   ```bash
   cat supabase/sql/execute-qr-refresh-cron.sql
   ```

4. **Coller dans le SQL Editor et remplacer** :
   - Cherchez `YOUR_SERVICE_ROLE_KEY` (2 occurrences)
   - Remplacez par votre vraie clé service_role

5. **Exécuter le script** (bouton RUN ou Ctrl+Enter)

6. **Vérifier le résultat** :
   Vous devriez voir :
   ```
   ✅ Cron job "refresh-qr-codes" créé avec succès!
   Fréquence: Toutes les 1 minute
   ```

#### Option B : Script Simplifié (Alternative)

Si l'Option A ne fonctionne pas, utilisez ce script simplifié :

```sql
-- 1. Activer les extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Créer le cron job pour refresh-qr-codes
SELECT cron.schedule(
  'refresh-qr-codes',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/refresh-qr-codes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer VOTRE_SERVICE_ROLE_KEY_ICI'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- 3. Créer le cron job pour process-evolution-queue
SELECT cron.schedule(
  'process-evolution-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/process-evolution-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer VOTRE_SERVICE_ROLE_KEY_ICI'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- 4. Vérifier
SELECT * FROM cron.job WHERE jobname IN ('refresh-qr-codes', 'process-evolution-queue');
```

**⚠️ N'oubliez pas de remplacer `VOTRE_SERVICE_ROLE_KEY_ICI` !**

### Étape 2 : Vérifier l'Installation

Une fois le cron job créé, vérifiez que tout fonctionne :

```sql
-- Voir les cron jobs actifs
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('refresh-qr-codes', 'process-evolution-queue');

-- Attendre 1-2 minutes, puis vérifier l'historique
SELECT
  job.jobname,
  details.start_time,
  details.status,
  details.return_message
FROM cron.job_run_details details
JOIN cron.job job ON details.jobid = job.jobid
WHERE job.jobname IN ('refresh-qr-codes', 'process-evolution-queue')
ORDER BY details.start_time DESC
LIMIT 5;
```

### Étape 3 : Appliquer la Migration (Si pas déjà fait)

La migration pour la queue d'instances doit être appliquée :

```bash
npx supabase db push
```

Cela va créer :
- Table `evolution_instance_creation_queue`
- Trigger `on_profile_created_create_evolution_instance`

## 🧪 Tests

### Test Manuel des Fonctions

```bash
# Tester refresh-qr-codes (nécessite SERVICE_ROLE_KEY)
curl -X POST \
  "https://YOUR_PROJECT_ID.supabase.co/functions/v1/refresh-qr-codes" \
  -H "Authorization: Bearer VOTRE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"

# Tester process-evolution-queue
curl -X POST \
  "https://YOUR_PROJECT_ID.supabase.co/functions/v1/process-evolution-queue" \
  -H "Authorization: Bearer VOTRE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### Test avec le Script

```bash
# Ajoutez d'abord SUPABASE_SERVICE_ROLE_KEY dans .env
echo "SUPABASE_SERVICE_ROLE_KEY=votre_cle_ici" >> .env

# Puis exécutez le test
./test-qr-refresh.sh
```

## 📊 Monitoring

### Voir les Logs des Fonctions

```bash
# Logs de refresh-qr-codes
npx supabase functions logs refresh-qr-codes --tail

# Logs de process-evolution-queue
npx supabase functions logs process-evolution-queue --tail
```

### Dashboard Supabase

- **Fonctions** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/functions
- **Logs** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/logs/edge-functions

### Vérifier les QR Codes

```sql
-- Voir les QR codes récemment rafraîchis
SELECT
  instance_name,
  instance_status,
  last_qr_update,
  NOW() - last_qr_update AS age,
  qr_code IS NOT NULL AS has_qr
FROM evolution_instances
WHERE instance_status = 'connecting'
ORDER BY last_qr_update DESC;

-- Si age < 2 minutes, le rafraîchissement automatique fonctionne ✓
```

## ✅ Checklist de Vérification

Après avoir suivi ce guide, vérifiez que :

- [ ] Edge Function `refresh-qr-codes` déployée
- [ ] Edge Function `create-evolution-instance` mise à jour
- [ ] Edge Function `process-evolution-queue` déployée
- [ ] Extensions `pg_cron` et `pg_net` activées
- [ ] Cron job `refresh-qr-codes` créé et actif
- [ ] Cron job `process-evolution-queue` créé et actif
- [ ] Migration appliquée (`evolution_instance_creation_queue` existe)
- [ ] Test manuel réussi
- [ ] QR codes se rafraîchissent automatiquement

## 🐛 Dépannage

### Le cron job ne s'exécute pas

1. Vérifiez que pg_cron est activé :
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Vérifiez que le job est actif :
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'refresh-qr-codes';
   ```

3. Regardez les erreurs :
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes')
   ORDER BY start_time DESC LIMIT 5;
   ```

### Les QR codes ne se rafraîchissent pas

1. Testez la fonction manuellement (voir section Tests ci-dessus)
2. Vérifiez les logs dans le Dashboard
3. Assurez-vous qu'il y a des instances en statut "connecting"

## 📚 Documentation

- **Guide complet** : [QR_REFRESH_SETUP.md](QR_REFRESH_SETUP.md)
- **Guide rapide** : [QUICK_START_QR_REFRESH.md](QUICK_START_QR_REFRESH.md)
- **Changements** : [QR_REFRESH_CHANGES.md](QR_REFRESH_CHANGES.md)

## 🎯 Résumé

**Ce qui est fait** :
- ✅ 3 Edge Functions déployées
- ✅ Code frontend optimisé
- ✅ Scripts SQL préparés
- ✅ Documentation complète

**Ce qui reste à faire** :
- ⏳ Configurer le cron job (5 minutes)
- ⏳ Appliquer la migration si nécessaire
- ⏳ Tester et vérifier

**Temps estimé** : ~10 minutes

---

**Projet** : conceive-do
**Date** : 2025-11-01
**Statut** : Déploiement des fonctions complété, configuration du cron job requise
