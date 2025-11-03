# 📋 Instructions Finales de Configuration

## ✅ Ce qui a été déployé

### Edge Functions (Déployées ✓)
- ✅ **refresh-qr-codes** - Rafraîchit les QR codes toutes les minutes
- ✅ **create-evolution-instance** - Version mise à jour avec support queue
- ✅ **process-evolution-queue** - Traite la queue de création d'instances

**Dashboard** : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/functions

---

## 🚨 ACTIONS REQUISES (À faire maintenant)

### Étape 1 : Appliquer la Migration SQL pour la Queue

Ouvrez le SQL Editor : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

Copiez et exécutez le contenu du fichier :
```bash
cat supabase/migrations/20251101011848_auto_create_evolution_instances.sql
```

Ou copiez ce SQL directement :

```sql
-- Migration: Auto-create Evolution API instances when user profiles are created

CREATE TABLE IF NOT EXISTS evolution_instance_creation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_evolution_queue_status
  ON evolution_instance_creation_queue(status, created_at);

ALTER TABLE evolution_instance_creation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage evolution instance queue"
  ON evolution_instance_creation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view their own queue status"
  ON evolution_instance_creation_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION handle_profile_evolution_instance()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_request_id uuid;
BEGIN
  v_request_id := gen_random_uuid();

  INSERT INTO evolution_instance_creation_queue (
    user_id,
    request_id,
    status,
    created_at
  ) VALUES (
    NEW.id,
    v_request_id,
    'pending',
    NOW()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    request_id = EXCLUDED.request_id,
    status = 'pending',
    updated_at = NOW(),
    retry_count = evolution_instance_creation_queue.retry_count + 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_create_evolution_instance ON profiles;

CREATE TRIGGER on_profile_created_create_evolution_instance
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_profile_evolution_instance();

GRANT USAGE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON evolution_instance_creation_queue TO postgres, service_role;
GRANT SELECT ON evolution_instance_creation_queue TO authenticated;
```

### Étape 2 : Configurer les Cron Jobs

#### A. Récupérer votre Service Role Key

1. Allez sur : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/api
2. Dans la section "Project API keys", trouvez la clé **service_role**
3. Cliquez sur "Reveal" et **copiez la clé** (elle commence par `eyJ...`)

#### B. Créer les Cron Jobs

Ouvrez le SQL Editor : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

Copiez ce SQL et **REMPLACEZ** `VOTRE_SERVICE_ROLE_KEY` par la clé copiée à l'étape A :

```sql
-- 1. Activer les extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Supprimer les anciens jobs s'ils existent
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-qr-codes') THEN
    PERFORM cron.unschedule('refresh-qr-codes');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-evolution-queue') THEN
    PERFORM cron.unschedule('process-evolution-queue');
  END IF;
END $$;

-- 3. Créer le job de rafraîchissement des QR codes (toutes les 1 minute)
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

-- 4. Créer le job de traitement de queue (toutes les 5 minutes)
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

-- 5. Vérifier que les jobs sont créés
SELECT
  jobname,
  schedule,
  active,
  CASE WHEN active THEN '✓ Actif' ELSE '✗ Inactif' END AS status
FROM cron.job
WHERE jobname IN ('refresh-qr-codes', 'process-evolution-queue')
ORDER BY jobname;
```

**⚠️ IMPORTANT** : Cherchez `VOTRE_SERVICE_ROLE_KEY` dans le SQL et remplacez-le !

### Étape 3 : Vérifier l'Installation

Après avoir exécuté les SQL ci-dessus, vérifiez que tout fonctionne :

```sql
-- Vérifier que la table queue existe
SELECT COUNT(*) FROM evolution_instance_creation_queue;

-- Vérifier que le trigger existe
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname = 'on_profile_created_create_evolution_instance';

-- Vérifier que les cron jobs sont actifs
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('refresh-qr-codes', 'process-evolution-queue');
```

**Résultat attendu** :
- `evolution_instance_creation_queue` : retourne 0 ou plus (table existe)
- `on_profile_created_create_evolution_instance` : `tgenabled = 't'` (trigger actif)
- `refresh-qr-codes` : `active = 't'`, `schedule = '*/1 * * * *'`
- `process-evolution-queue` : `active = 't'`, `schedule = '*/5 * * * *'`

---

## 🧪 Test Final

### Test 1 : Tester le rafraîchissement des QR codes

```sql
-- Voir s'il y a des instances "connecting"
SELECT instance_name, instance_status, last_qr_update
FROM evolution_instances
WHERE instance_status = 'connecting';

-- Attendre 1-2 minutes, puis vérifier que last_qr_update a changé
SELECT
  instance_name,
  last_qr_update,
  NOW() - last_qr_update AS age
FROM evolution_instances
WHERE instance_status = 'connecting'
ORDER BY last_qr_update DESC;

-- Si age < 2 minutes, le rafraîchissement fonctionne ! ✅
```

### Test 2 : Tester la création automatique d'instances

1. Créez un nouveau compte utilisateur via votre application
2. Vérifiez qu'une entrée est créée dans la queue :

```sql
SELECT * FROM evolution_instance_creation_queue
ORDER BY created_at DESC
LIMIT 5;
```

3. Attendez 5 minutes (ou déclenchez manuellement) :

```bash
curl -X POST \
  "https://YOUR_PROJECT_ID.supabase.co/functions/v1/process-evolution-queue" \
  -H "Authorization: Bearer VOTRE_SERVICE_ROLE_KEY"
```

4. Vérifiez que l'instance a été créée :

```sql
SELECT * FROM evolution_instances
ORDER BY created_at DESC
LIMIT 5;
```

---

## 📊 Monitoring

### Voir l'historique des cron jobs

```sql
SELECT
  job.jobname,
  details.start_time,
  details.end_time,
  details.status,
  (details.end_time - details.start_time) AS duration
FROM cron.job_run_details details
JOIN cron.job job ON details.jobid = job.jobid
WHERE job.jobname IN ('refresh-qr-codes', 'process-evolution-queue')
ORDER BY details.start_time DESC
LIMIT 10;
```

### Voir les logs des fonctions

Dashboard : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/logs/edge-functions

Ou via CLI :
```bash
npx supabase functions logs refresh-qr-codes --tail
npx supabase functions logs process-evolution-queue --tail
```

---

## ✅ Checklist Finale

Cochez chaque élément après l'avoir complété :

- [ ] Migration SQL exécutée (table `evolution_instance_creation_queue` créée)
- [ ] Trigger créé (`on_profile_created_create_evolution_instance`)
- [ ] Extensions activées (`pg_cron`, `pg_net`)
- [ ] Cron job `refresh-qr-codes` créé et actif
- [ ] Cron job `process-evolution-queue` créé et actif
- [ ] Test de rafraîchissement QR : age < 2 minutes ✓
- [ ] Test de création d'instance : nouvelle instance créée automatiquement ✓

---

## 🎯 Résultat Attendu

Après avoir suivi ces instructions :

### Pour le rafraîchissement des QR codes :
- ✅ Les QR codes se rafraîchissent automatiquement **toutes les 60 secondes**
- ✅ Les utilisateurs voient le QR se mettre à jour sans recharger la page
- ✅ Fonctionne même si l'utilisateur n'a pas la page ouverte

### Pour la création automatique d'instances :
- ✅ Quand un utilisateur s'inscrit, une entrée est créée dans la queue
- ✅ Dans les 5 minutes, l'instance Evolution API est créée automatiquement
- ✅ Les webhooks sont configurés automatiquement

---

## 🆘 Besoin d'aide ?

- **Documentation complète** : [QR_REFRESH_SETUP.md](QR_REFRESH_SETUP.md)
- **Guide de démarrage** : [QUICK_START_QR_REFRESH.md](QUICK_START_QR_REFRESH.md)
- **Changements détaillés** : [QR_REFRESH_CHANGES.md](QR_REFRESH_CHANGES.md)
- **Setup des webhooks** : [SETUP_AUTO_WEBHOOKS.md](SETUP_AUTO_WEBHOOKS.md)

---

**Temps estimé** : 10-15 minutes
**Difficulté** : Facile (copier-coller du SQL)
**Date** : 2025-11-01
