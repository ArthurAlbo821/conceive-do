# Edge Function: refresh-qr-codes

Rafraîchit automatiquement les QR codes WhatsApp pour toutes les instances Evolution API en statut "connecting".

## Description

Cette fonction est appelée périodiquement (toutes les minutes) par un cron job pour garantir que les utilisateurs non connectés aient toujours un QR code valide à scanner.

## Fonctionnement

1. **Récupération des instances** : Sélectionne toutes les instances avec `instance_status = 'connecting'`
2. **Pour chaque instance** :
   - Appelle Evolution API : `GET /instance/connect/{instanceName}`
   - Utilise le `instance_token` pour l'authentification
   - Extrait le QR code de la réponse (format base64)
3. **Mise à jour de la DB** :
   - Colonne `qr_code` : QR code en format `data:image/png;base64,...`
   - Colonne `last_qr_update` : Timestamp ISO de la mise à jour
4. **Notification frontend** : Le real-time Supabase propage automatiquement les changements

## Environnement

### Variables requises

```bash
SUPABASE_URL              # URL du projet Supabase
SUPABASE_SERVICE_ROLE_KEY # Clé service role (accès complet à la DB)
EVOLUTION_API_BASE_URL    # URL de l'API Evolution (optionnel)
```

### Variables optionnelles

```bash
EVOLUTION_API_BASE_URL    # Par défaut: https://cst-evolution-api-kaezwnkk.usecloudstation.com
```

## Déploiement

```bash
# Déployer la fonction
supabase functions deploy refresh-qr-codes --no-verify-jwt

# Configurer les variables d'environnement
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key_here
supabase secrets set EVOLUTION_API_BASE_URL=https://your-evolution-api.com
```

## Configuration du Cron Job

### Via SQL Editor

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'refresh-qr-codes',
  '*/1 * * * *',  -- Toutes les 1 minute
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

### Via Script SQL

```bash
supabase db execute -f ../sql/setup-qr-refresh-cron.sql
```

## API

### Endpoint

```
POST /functions/v1/refresh-qr-codes
```

### Headers

```
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type: application/json
```

### Request Body

```json
{}
```

Aucun paramètre requis - la fonction traite automatiquement toutes les instances "connecting".

### Response (Success)

```json
{
  "success": true,
  "total_instances": 3,
  "refreshed": 3,
  "failed": 0,
  "results": [
    {
      "instance_name": "user_abc123",
      "success": true,
      "qr_updated": true
    },
    {
      "instance_name": "user_def456",
      "success": true,
      "qr_updated": true
    },
    {
      "instance_name": "user_ghi789",
      "success": true,
      "qr_updated": false,
      "error": "No QR code available from Evolution API"
    }
  ]
}
```

### Response (Error)

```json
{
  "success": false,
  "error": "Missing required environment variables"
}
```

## Test Manuel

### Via curl

```bash
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-qr-codes" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Via Supabase CLI

```bash
supabase functions invoke refresh-qr-codes \
  --method POST \
  --body '{}'
```

### Via SQL (pg_net)

```sql
SELECT net.http_post(
  url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-qr-codes',
  headers := jsonb_build_object(
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
    'Content-Type', 'application/json'
  ),
  body := '{}'::jsonb
);
```

## Logs

### Consulter les logs

```bash
# Via CLI (temps réel)
supabase functions logs refresh-qr-codes --tail

# Via CLI (derniers logs)
supabase functions logs refresh-qr-codes --limit 100
```

### Format des logs

```
[refresh-qr-codes] Starting QR code refresh cycle...
[refresh-qr-codes] Found 3 connecting instance(s)
[refresh-qr-codes] Processing user_abc123...
[refresh-qr-codes] Fetching QR for user_abc123
[refresh-qr-codes] Successfully fetched QR for user_abc123
[refresh-qr-codes] ✓ Successfully refreshed QR for user_abc123
[refresh-qr-codes] Refresh cycle complete: 3 success, 0 failures
```

## Monitoring

### Vérifier l'exécution du cron

```sql
-- Voir le statut du cron job
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'refresh-qr-codes';

-- Voir l'historique d'exécution
SELECT
  start_time,
  end_time,
  status,
  return_message,
  (end_time - start_time) AS duration
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes')
ORDER BY start_time DESC
LIMIT 10;
```

### Vérifier les QR codes

```sql
-- Instances avec QR récemment rafraîchi
SELECT
  instance_name,
  instance_status,
  last_qr_update,
  NOW() - last_qr_update AS age,
  qr_code IS NOT NULL AS has_qr_code
FROM evolution_instances
WHERE instance_status = 'connecting'
ORDER BY last_qr_update DESC;

-- Alertes : Instances sans QR depuis > 5 minutes
SELECT
  instance_name,
  last_qr_update,
  NOW() - last_qr_update AS age
FROM evolution_instances
WHERE instance_status = 'connecting'
AND (last_qr_update IS NULL OR last_qr_update < NOW() - INTERVAL '5 minutes');
```

## Gestion des Erreurs

### Codes d'erreur

| Erreur | Cause | Solution |
|--------|-------|----------|
| Missing required environment variables | Variables d'env non configurées | Configurer `SUPABASE_SERVICE_ROLE_KEY` |
| Error fetching instances | Problème DB | Vérifier les permissions RLS |
| Failed to fetch QR for {instance} | Evolution API indisponible | Vérifier `EVOLUTION_API_BASE_URL` |
| Database update failed | Erreur SQL | Vérifier les contraintes DB |
| Timeout | Appel API trop long | Augmenter le timeout (ligne 45) |

### Retry Logic

- **Timeout par appel** : 8 secondes (ligne 45)
- **Pas de retry automatique** dans la fonction
- **Retry via cron** : Nouvelle tentative à la prochaine exécution (1 minute)
- **Instances en échec** : Ne bloquent pas les autres instances

### Logs d'erreur

```
[refresh-qr-codes] Failed to fetch QR for user_abc123: 500 Internal Server Error
[refresh-qr-codes] Error processing user_abc123: Request timeout
[refresh-qr-codes] Refresh cycle complete: 2 success, 1 failures
```

## Performance

### Métriques

Pour **N instances "connecting"** :
- **Durée totale** : ~(N × 1s) + 2s overhead ≈ N secondes
- **Appels API** : N appels à Evolution API
- **Updates DB** : N updates (ou moins si échecs)
- **Mémoire** : ~5-10 MB

### Optimisations

1. **Timeout court** : 8s par appel (évite les blocages)
2. **Traitement séquentiel** : Une instance à la fois (évite la surcharge)
3. **Pas de retry immédiat** : Laisse le cron réessayer à la prochaine exécution
4. **Logging minimal** : Logs essentiels uniquement

### Limites

- **Max instances** : Aucune limite dans le code (peut être ajoutée via `.limit()`)
- **Timeout total** : 30s (défini dans `_cron/refresh-qr-codes.ts`)
- **Fréquence** : 1 minute (limite de pg_cron)

## Sécurité

### Authentification

- **Service role uniquement** : Fonction accessible uniquement avec `SERVICE_ROLE_KEY`
- **Pas de vérification JWT** : `--no-verify-jwt` car appelée par cron
- **Headers validés** : Vérifie l'Authorization header

### Permissions

- **RLS bypass** : Utilise service role pour contourner RLS
- **Lecture/écriture** : Accès complet à `evolution_instances`
- **Tokens d'instance** : Utilisés pour authentifier les appels Evolution API

### Bonnes pratiques

- ✅ Ne jamais exposer `SERVICE_ROLE_KEY` au frontend
- ✅ Logs ne contiennent pas de données sensibles (tokens masqués)
- ✅ Validation des données Evolution API avant stockage
- ✅ Gestion des erreurs sans exposition de détails internes

## Dépannage

### La fonction ne s'exécute pas

1. Vérifier le déploiement :
   ```bash
   supabase functions list | grep refresh-qr-codes
   ```

2. Tester manuellement :
   ```bash
   curl -X POST https://PROJECT.supabase.co/functions/v1/refresh-qr-codes \
     -H "Authorization: Bearer SERVICE_ROLE_KEY"
   ```

3. Vérifier les logs :
   ```bash
   supabase functions logs refresh-qr-codes --tail
   ```

### Les QR ne se rafraîchissent pas

1. Vérifier qu'il y a des instances "connecting" :
   ```sql
   SELECT COUNT(*) FROM evolution_instances WHERE instance_status = 'connecting';
   ```

2. Vérifier les tokens :
   ```sql
   SELECT instance_name, instance_token IS NOT NULL
   FROM evolution_instances
   WHERE instance_status = 'connecting';
   ```

3. Tester Evolution API manuellement :
   ```bash
   curl -H "apikey: INSTANCE_TOKEN" \
     https://evolution-api.com/instance/connect/INSTANCE_NAME
   ```

### Le cron ne s'exécute pas

1. Vérifier pg_cron :
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Vérifier le job :
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'refresh-qr-codes';
   ```

3. Vérifier l'historique :
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes')
   ORDER BY start_time DESC LIMIT 5;
   ```

## Documentation Complémentaire

- [Guide d'installation complet](../../../QR_REFRESH_SETUP.md)
- [Guide de démarrage rapide](../../../QUICK_START_QR_REFRESH.md)
- [Script de configuration SQL](../../sql/setup-qr-refresh-cron.sql)

## Changelog

### Version 1.0.0 (2025-11-01)

- ✨ Création initiale de la fonction
- ✨ Support du rafraîchissement automatique toutes les minutes
- ✨ Gestion des erreurs avec logging détaillé
- ✨ Intégration avec pg_cron pour exécution périodique

---

**Auteur** : Système de rafraîchissement automatique QR
**Version** : 1.0.0
**Dernière mise à jour** : 2025-11-01
