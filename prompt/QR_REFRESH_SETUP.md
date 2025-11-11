# Configuration du Rafraîchissement Automatique des QR Codes

## 🎯 Objectif

Rafraîchir automatiquement le QR code de connexion WhatsApp **toutes les minutes** pour garantir que les utilisateurs non connectés aient toujours un QR code valide à scanner.

## 🔄 Fonctionnement

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Cron Job (pg_cron) - Toutes les 60 secondes               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Edge Function: refresh-qr-codes                            │
│  - Récupère toutes les instances "connecting"               │
│  - Pour chaque instance :                                   │
│    1. Appelle Evolution API avec le token de l'instance     │
│    2. Récupère le nouveau QR code                           │
│    3. Met à jour la DB (qr_code + last_qr_update)           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase Real-time                                         │
│  - Détecte les changements dans evolution_instances         │
│  - Envoie les mises à jour aux clients connectés            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React)                                           │
│  - Reçoit la mise à jour via real-time subscription         │
│  - QRCodeDisplay affiche le nouveau QR automatiquement      │
│  - Timer visuel redémarre à 1:00                            │
└─────────────────────────────────────────────────────────────┘
```

### Flux Temporel

```
Minute 0:00
  ├─ Cron job s'exécute
  ├─ Récupération des instances "connecting"
  ├─ Appel Evolution API pour chaque instance
  ├─ Mise à jour de la DB
  └─ Frontend reçoit update via real-time → QR rafraîchi ✓

Minute 1:00
  ├─ Cron job s'exécute à nouveau
  └─ Cycle se répète...

Minute 2:00
  └─ Cycle se répète...
```

## 🚀 Installation

### Étape 1 : Déployer l'Edge Function

```bash
# Déployer la fonction refresh-qr-codes
supabase functions deploy refresh-qr-codes --no-verify-jwt

# Vérifier le déploiement
supabase functions list
```

### Étape 2 : Configurer le Cron Job

#### Option A : Via SQL Editor (Recommandé)

1. Ouvrez le **SQL Editor** dans votre Supabase Dashboard
2. Exécutez le script suivant :

```sql
-- Activer les extensions requises
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Créer le cron job
SELECT cron.schedule(
  'refresh-qr-codes',
  '*/1 * * * *',  -- Toutes les 1 minute
  $$
  SELECT
    net.http_post(
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

**⚠️ IMPORTANT : Remplacez :**
- `YOUR_PROJECT_REF` par votre référence de projet Supabase
- `YOUR_SERVICE_ROLE_KEY` par votre clé service role

#### Option B : Via fichier SQL

```bash
# Modifier le fichier avec vos valeurs
nano supabase/sql/setup-qr-refresh-cron.sql

# Exécuter le fichier
supabase db execute -f supabase/sql/setup-qr-refresh-cron.sql
```

### Étape 3 : Vérifier l'Installation

```sql
-- Vérifier que le cron job est créé
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'refresh-qr-codes';

-- Devrait retourner:
-- jobid | jobname           | schedule    | active
-- ------|-------------------|-------------|-------
-- XXX   | refresh-qr-codes  | */1 * * * * | t
```

### Étape 4 : Test Manuel

Testez la fonction avant d'attendre la prochaine exécution du cron :

```bash
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-qr-codes" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Réponse attendue :
```json
{
  "success": true,
  "total_instances": 2,
  "refreshed": 2,
  "failed": 0,
  "results": [
    {
      "instance_name": "user_abc123",
      "success": true,
      "qr_updated": true
    }
  ]
}
```

## 📊 Monitoring

### Vérifier l'Historique d'Exécution

```sql
-- Voir les 20 dernières exécutions
SELECT
  job.jobname,
  details.start_time,
  details.end_time,
  details.status,
  details.return_message,
  (details.end_time - details.start_time) AS duration
FROM cron.job_run_details details
JOIN cron.job job ON details.jobid = job.jobid
WHERE job.jobname = 'refresh-qr-codes'
ORDER BY details.start_time DESC
LIMIT 20;
```

### Vérifier les QR Codes Rafraîchis

```sql
-- Voir les dernières mises à jour de QR codes
SELECT
  instance_name,
  instance_status,
  last_qr_update,
  NOW() - last_qr_update AS age,
  qr_code IS NOT NULL AS has_qr
FROM evolution_instances
WHERE instance_status = 'connecting'
ORDER BY last_qr_update DESC;

-- Si last_qr_update est rafraîchi toutes les minutes,
-- la colonne "age" devrait montrer < 1 minute
```

### Consulter les Logs de la Fonction

```bash
# Via Supabase CLI
supabase functions logs refresh-qr-codes --tail

# Via Dashboard
# Allez sur Edge Functions > refresh-qr-codes > Logs
```

### Statistiques de Rafraîchissement

```sql
-- Statistiques de rafraîchissement par heure (dernières 24h)
SELECT
  DATE_TRUNC('hour', last_qr_update) AS hour,
  COUNT(*) AS refresh_count,
  COUNT(DISTINCT instance_name) AS unique_instances
FROM evolution_instances
WHERE last_qr_update >= NOW() - INTERVAL '24 hours'
AND instance_status = 'connecting'
GROUP BY DATE_TRUNC('hour', last_qr_update)
ORDER BY hour DESC;
```

## 🛠️ Configuration Avancée

### Ajuster la Fréquence de Rafraîchissement

Pour changer la fréquence (par exemple, toutes les 30 secondes) :

```sql
-- Modifier le cron existant
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes'),
  schedule := '*/30 * * * *'  -- Toutes les 30 secondes (0.5 min)
);

-- OU désactiver et recréer
SELECT cron.unschedule('refresh-qr-codes');

SELECT cron.schedule(
  'refresh-qr-codes',
  '*/30 * * * *',  -- Toutes les 30 secondes
  $$ ... $$  -- Même commande qu'avant
);
```

**Fréquences possibles :**
- `*/1 * * * *` - Toutes les minutes (recommandé)
- `*/30 * * * *` - Toutes les 30 secondes (plus agressif)
- `*/2 * * * *` - Toutes les 2 minutes (plus économe)

⚠️ **Attention** : pg_cron a une granularité minimale d'1 minute. Pour des intervalles < 1 minute, vous auriez besoin d'un autre mécanisme.

### Limiter aux Instances Spécifiques

Modifiez la fonction `refresh-qr-codes` pour filtrer par critères :

```typescript
// Dans refresh-qr-codes/index.ts, ligne ~115
const { data: instances, error: fetchError } = await supabase
  .from('evolution_instances')
  .select('...')
  .eq('instance_status', 'connecting')
  // Ajouter des filtres supplémentaires :
  .gt('last_qr_update', new Date(Date.now() - 5*60*1000).toISOString())  // Seulement si > 5 min
  .limit(10);  // Limiter à 10 instances max par exécution
```

### Ajouter des Notifications

Pour recevoir des alertes en cas d'échec :

```sql
-- Créer une fonction qui vérifie les échecs
CREATE OR REPLACE FUNCTION check_qr_refresh_failures()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  failed_count INTEGER;
BEGIN
  -- Compter les instances sans QR depuis > 5 minutes
  SELECT COUNT(*) INTO failed_count
  FROM evolution_instances
  WHERE instance_status = 'connecting'
  AND (last_qr_update IS NULL OR last_qr_update < NOW() - INTERVAL '5 minutes');

  -- Si échecs détectés, envoyer notification (à implémenter)
  IF failed_count > 0 THEN
    RAISE WARNING 'QR refresh failures detected: % instances', failed_count;
    -- Ici : appeler un webhook, envoyer un email, etc.
  END IF;
END;
$$;

-- Programmer la vérification toutes les 10 minutes
SELECT cron.schedule(
  'check-qr-failures',
  '*/10 * * * *',
  $$ SELECT check_qr_refresh_failures(); $$
);
```

## 🐛 Dépannage

### Problème : Le cron job ne s'exécute pas

**Vérifications :**

1. **pg_cron activé ?**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   -- Devrait retourner une ligne
   ```

2. **Cron job actif ?**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'refresh-qr-codes';
   -- Vérifier que active = true
   ```

3. **Permissions ?**
   ```sql
   GRANT USAGE ON SCHEMA cron TO postgres;
   ```

4. **Logs d'erreur ?**
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes')
   AND status = 'failed'
   ORDER BY start_time DESC;
   ```

### Problème : Les QR codes ne se rafraîchissent pas

**Solutions :**

1. **Tester manuellement la fonction :**
   ```bash
   curl -X POST https://PROJECT.supabase.co/functions/v1/refresh-qr-codes \
     -H "Authorization: Bearer SERVICE_ROLE_KEY"
   ```

2. **Vérifier les logs de la fonction :**
   ```bash
   supabase functions logs refresh-qr-codes --tail
   ```

3. **Vérifier l'URL Evolution API :**
   ```bash
   echo $EVOLUTION_API_BASE_URL
   # Devrait être configuré dans les variables d'environnement
   ```

4. **Vérifier les tokens d'instance :**
   ```sql
   SELECT instance_name, instance_token IS NOT NULL AS has_token
   FROM evolution_instances
   WHERE instance_status = 'connecting';
   ```

### Problème : Frontend ne reçoit pas les mises à jour

**Vérifications :**

1. **Real-time activé dans Supabase ?**
   - Dashboard > Database > Replication
   - Vérifier que `evolution_instances` est dans les tables répliquées

2. **RLS configurée correctement ?**
   ```sql
   SELECT * FROM evolution_instances WHERE user_id = auth.uid();
   -- Devrait fonctionner pour l'utilisateur connecté
   ```

3. **Subscription active dans le code ?**
   - Vérifier `src/hooks/useEvolutionInstance.ts` ligne ~148
   - La subscription doit être active

## 🔄 Désactivation Temporaire

### Désactiver le cron job

```sql
-- Désactiver sans supprimer
UPDATE cron.job
SET active = false
WHERE jobname = 'refresh-qr-codes';

-- Réactiver
UPDATE cron.job
SET active = true
WHERE jobname = 'refresh-qr-codes';
```

### Supprimer complètement le cron job

```sql
SELECT cron.unschedule('refresh-qr-codes');
```

## 📈 Performance

### Optimisations

1. **Index sur instance_status** (normalement déjà créé) :
   ```sql
   CREATE INDEX IF NOT EXISTS idx_evolution_instances_status
   ON evolution_instances(instance_status);
   ```

2. **Limiter le nombre d'instances traitées** :
   ```typescript
   // Dans refresh-qr-codes/index.ts
   .limit(20)  // Maximum 20 instances par exécution
   ```

3. **Timeout optimisé** :
   ```typescript
   // Dans refresh-qr-codes/index.ts, ligne ~45
   signal: AbortSignal.timeout(8000)  // 8 secondes max par appel
   ```

### Métriques Attendues

Pour un système avec **10 instances "connecting"** :
- **Durée d'exécution** : ~5-10 secondes
- **Appels API** : 10 appels à Evolution API
- **Mises à jour DB** : 10 updates

## 📚 Fichiers Créés

| Fichier | Description |
|---------|-------------|
| `supabase/functions/refresh-qr-codes/index.ts` | Edge Function principale |
| `supabase/functions/_cron/refresh-qr-codes.ts` | Configuration du cron job |
| `supabase/sql/setup-qr-refresh-cron.sql` | Script SQL de configuration |
| `QR_REFRESH_SETUP.md` | Cette documentation |

## 🔗 Références

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [pg_cron Extension](https://github.com/citusdata/pg_cron)
- [pg_net Extension](https://github.com/supabase/pg_net)
- [Evolution API Documentation](https://doc.evolution-api.com)

## ✅ Checklist Post-Installation

Après avoir suivi ce guide, vérifiez que :

- [ ] Edge Function `refresh-qr-codes` déployée
- [ ] Cron job créé et actif
- [ ] Test manuel réussi
- [ ] Historique d'exécution visible
- [ ] QR codes se rafraîchissent toutes les minutes
- [ ] Frontend reçoit les mises à jour en temps réel
- [ ] Logs accessibles et clairs
- [ ] Monitoring en place

---

**Version** : 1.0.0
**Date** : 2025-11-01
**Fréquence de rafraîchissement** : 60 secondes (1 minute)
