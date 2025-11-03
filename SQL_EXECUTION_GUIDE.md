# 📋 Guide d'Exécution SQL - Configuration Complète

## ✅ Fonctions Déjà Déployées

Les Edge Functions suivantes sont déjà déployées sur Supabase :
- ✅ refresh-qr-codes
- ✅ create-evolution-instance
- ✅ process-evolution-queue

---

## 🚀 EXÉCUTION SQL (2 scripts à exécuter)

### Script 1 : Migration de la Queue (CORRIGÉ)

**Fichier** : `supabase/sql/apply-migration-queue.sql`

1. **Ouvrir le SQL Editor** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

2. **Copier le contenu du fichier** :
   ```bash
   cat supabase/sql/apply-migration-queue.sql
   ```

3. **Coller dans le SQL Editor et Exécuter** (bouton RUN ou Ctrl+Enter)

4. **Vérifier le résultat** - Vous devriez voir :
   ```
   ✅ MIGRATION APPLIQUÉE AVEC SUCCÈS
   ✓ Table evolution_instance_creation_queue créée
   ✓ Trigger on_profile_created_create_evolution_instance créé
   ✓ Policies RLS: 2 créées
   ```

---

### Script 2 : Configuration des Cron Jobs

**Prérequis** : Récupérer votre Service Role Key

1. **Récupérer la clé** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/api
   - Section "Project API keys"
   - Cliquez sur "Reveal" à côté de **service_role**
   - Copiez la longue clé (commence par `eyJ...`)

2. **Ouvrir le SQL Editor** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

3. **Copier ce SQL** et **REMPLACER** `VOTRE_SERVICE_ROLE_KEY` (2 fois) :

```sql
-- Activer les extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Supprimer les anciens jobs s'ils existent
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-qr-codes') THEN
    PERFORM cron.unschedule('refresh-qr-codes');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-evolution-queue') THEN
    PERFORM cron.unschedule('process-evolution-queue');
  END IF;
END $$;

-- Cron job 1: Rafraîchir les QR codes toutes les 1 minute
SELECT cron.schedule(
  'refresh-qr-codes',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/refresh-qr-codes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer VOTRE_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  $$
);

-- Cron job 2: Traiter la queue toutes les 5 minutes
SELECT cron.schedule(
  'process-evolution-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/process-evolution-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer VOTRE_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  $$
);

-- Vérifier que les jobs sont créés
SELECT
  jobname,
  schedule,
  active,
  CASE WHEN active THEN '✓ Actif' ELSE '✗ Inactif' END AS status
FROM cron.job
WHERE jobname IN ('refresh-qr-codes', 'process-evolution-queue')
ORDER BY jobname;
```

4. **Vérifier le résultat** - Vous devriez voir :
   ```
   jobname                  | schedule    | active | status
   -------------------------|-------------|--------|--------
   process-evolution-queue  | */5 * * * * | t      | ✓ Actif
   refresh-qr-codes         | */1 * * * * | t      | ✓ Actif
   ```

---

## ✅ Vérification Finale

Après avoir exécuté les 2 scripts, vérifiez que tout fonctionne :

```sql
-- 1. Vérifier la table queue
SELECT COUNT(*) as total FROM evolution_instance_creation_queue;

-- 2. Vérifier le trigger
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'on_profile_created_create_evolution_instance';

-- 3. Vérifier les cron jobs
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('refresh-qr-codes', 'process-evolution-queue');

-- 4. Attendre 1-2 minutes puis vérifier l'historique d'exécution
SELECT
  job.jobname,
  details.start_time,
  details.status
FROM cron.job_run_details details
JOIN cron.job job ON details.jobid = job.jobid
WHERE job.jobname IN ('refresh-qr-codes', 'process-evolution-queue')
ORDER BY details.start_time DESC
LIMIT 5;
```

---

## 🧪 Test Complet

### Test 1 : Rafraîchissement QR Code

```sql
-- Voir les instances connecting
SELECT instance_name, last_qr_update, NOW() - last_qr_update AS age
FROM evolution_instances
WHERE instance_status = 'connecting';

-- Attendre 1-2 minutes puis réexécuter la requête
-- Si age < 2 minutes, le rafraîchissement automatique fonctionne ! ✅
```

### Test 2 : Création Automatique d'Instance

1. Créez un nouveau compte utilisateur via votre application
2. Vérifiez la queue :
   ```sql
   SELECT * FROM evolution_instance_creation_queue
   ORDER BY created_at DESC
   LIMIT 5;
   ```
3. Attendez 5 minutes (ou testez manuellement)
4. Vérifiez l'instance créée :
   ```sql
   SELECT * FROM evolution_instances
   ORDER BY created_at DESC
   LIMIT 5;
   ```

---

## 🎯 Résultat Attendu

### QR Codes :
- ✅ Rafraîchis automatiquement toutes les 60 secondes
- ✅ Mise à jour en temps réel dans le frontend
- ✅ Fonctionne en arrière-plan

### Instances :
- ✅ Création automatique lors de l'inscription
- ✅ Webhooks configurés automatiquement
- ✅ Traitement de la queue toutes les 5 minutes

---

## 📊 Monitoring

### Dashboard Supabase

- **Fonctions** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/functions
- **Logs** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/logs/edge-functions

### Via CLI

```bash
# Logs en temps réel
npx supabase functions logs refresh-qr-codes --tail
npx supabase functions logs process-evolution-queue --tail
```

---

## 🐛 Dépannage

### Erreur "syntax error at or near ||"
✅ **Corrigé** ! Utilisez `supabase/sql/apply-migration-queue.sql` au lieu de la migration originale.

### Le cron job ne s'exécute pas
1. Vérifiez que pg_cron est activé : `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Vérifiez que vous avez bien remplacé `VOTRE_SERVICE_ROLE_KEY`
3. Regardez les logs : `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

### Les QR ne se rafraîchissent pas
1. Vérifiez qu'il y a des instances "connecting"
2. Testez manuellement la fonction refresh-qr-codes
3. Consultez les logs des fonctions

---

## ✅ Checklist

- [ ] Script 1 exécuté (migration queue) ✓
- [ ] Script 2 exécuté (cron jobs) ✓
- [ ] Table `evolution_instance_creation_queue` existe
- [ ] Trigger `on_profile_created_create_evolution_instance` actif
- [ ] Cron job `refresh-qr-codes` actif
- [ ] Cron job `process-evolution-queue` actif
- [ ] Test QR : age < 2 minutes
- [ ] Test instance : création automatique

---

**Temps total** : ~10 minutes
**Difficulté** : Facile (copier-coller)
**Support** : Voir [FINAL_SETUP_INSTRUCTIONS.md](FINAL_SETUP_INSTRUCTIONS.md)
