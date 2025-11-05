# ✅ Checklist de Déploiement AI-Auto-Reply

## 📋 Pré-Déploiement

### 1. Base de Données - Créer Table Rate Limits

**Option A: Via Supabase Dashboard (Recommandé)**
1. Aller sur https://supabase.com/dashboard
2. Sélectionner votre projet
3. Aller dans **SQL Editor**
4. Créer nouvelle query et coller le contenu de `supabase/migrations/20251105015935_create_rate_limits_table.sql`
5. Exécuter la requête
6. Vérifier que la table existe: **Table Editor → ai_rate_limits**

**Option B: Via CLI (si DATABASE_URL configuré)**
```bash
psql $DATABASE_URL < supabase/migrations/20251105015935_create_rate_limits_table.sql
```

**Vérification:**
```sql
-- Dans SQL Editor, vérifier que la table existe
SELECT * FROM ai_rate_limits LIMIT 1;
```

---

### 2. Variables d'Environnement

**Aller dans:** Supabase Dashboard → Edge Functions → ai-auto-reply → Settings

**Variables REQUISES:**
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... (depuis Settings → API)
SUPABASE_JWT_SECRET=your-jwt-secret (depuis Settings → API → JWT Secret)
OPENAI_API_KEY=sk-proj-xxx (depuis OpenAI Dashboard)
```

**Variables OPTIONNELLES:**
```env
DUCKLING_API_URL=https://duckling.railway.app
```

**Vérification:**
- [ ] SUPABASE_URL est l'URL complète de votre projet
- [ ] SUPABASE_SERVICE_ROLE_KEY commence par "ey"
- [ ] SUPABASE_JWT_SECRET fait au moins 32 caractères
- [ ] OPENAI_API_KEY commence par "sk-"

---

## 🚀 Déploiement

### 3. Git Commit (optionnel mais recommandé)

```bash
cd /Users/arthurhernandes/conceive-do

# Ajouter tous les nouveaux fichiers
git add supabase/functions/ai-auto-reply/
git add supabase/functions/import_map.json
git add supabase/migrations/20251105015935_create_rate_limits_table.sql

# Créer commit
git commit -m "feat(ai-auto-reply): Add env validation, tests, and rate limiting

- Implement missing executeOpenAIRequest() function
- Add Zod environment variable validation
- Add 25 unit tests (availability, validation, temporal)
- Implement rate limiting (10 req/min per user)
- Create ai_rate_limits table
- Add comprehensive documentation

BREAKING CHANGES:
- Requires OPENAI_API_KEY environment variable
- Requires ai_rate_limits table in database"

# Push vers GitHub
git push origin Ai_structure
```

---

### 4. Déployer la Fonction

```bash
cd /Users/arthurhernandes/conceive-do

# Déployer
supabase functions deploy ai-auto-reply

# Vérifier le déploiement
supabase functions list
```

**Sortie attendue:**
```
┌─────────────────┬──────────┬─────────────┬────────────┐
│ NAME            │ STATUS   │ VERSION     │ UPDATED AT │
├─────────────────┼──────────┼─────────────┼────────────┤
│ ai-auto-reply   │ DEPLOYED │ v1.2.3      │ Just now   │
└─────────────────┴──────────┴─────────────┴────────────┘
```

---

## 🧪 Tests Post-Déploiement

### 5. Vérifier les Logs de Démarrage

```bash
# Voir les logs en temps réel
supabase functions logs ai-auto-reply --follow
```

**Logs à chercher:**
```
[env] ✅ Environment variables validated successfully
```

**Si erreur:**
```
[env] ❌ Environment variable validation failed:
  • OPENAI_API_KEY: Required
```
→ Retourner à l'étape 2 (Variables d'environnement)

---

### 6. Test WORKFLOW Mode (Nouveau RDV)

**Prérequis:**
- Un conversation_id valide
- Un JWT token valide

```bash
curl -X POST https://[VOTRE-PROJECT-REF].supabase.co/functions/v1/ai-auto-reply \
  -H "Authorization: Bearer [VOTRE-JWT-TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "uuid-de-conversation",
    "message_text": "Bonjour, je voudrais un rendez-vous demain à 14h pour 1h"
  }'
```

**Réponse attendue:**
```json
{
  "success": true,
  "ai_mode": "WORKFLOW",
  "message_sent": "...",
  "appointment_created": false
}
```

**Vérifier dans les logs:**
```
[1/13] 🔐 Authentication...
[auth] ✅ Authenticated as user: uuid
[4/13] 🚦 Check rate limit...
[ratelimit] ✅ Request allowed (1/10)
[10/13] 🧠 Call OpenAI...
[openai] ✅ Response received in 1234 ms
[13/13] ✅ Success!
```

---

### 7. Test Rate Limiting

**Envoyer 11 requêtes rapidement:**

```bash
# Script bash pour tester rate limiting
for i in {1..11}; do
  echo "Request $i"
  curl -X POST https://[VOTRE-PROJECT-REF].supabase.co/functions/v1/ai-auto-reply \
    -H "Authorization: Bearer [JWT-TOKEN]" \
    -H "Content-Type: application/json" \
    -d '{"conversation_id":"uuid","message_text":"test"}'
  echo ""
done
```

**Réponse attendue (11ème requête):**
```json
{
  "error": "Rate limit exceeded",
  "message": "Rate limit exceeded. Maximum 10 requests per 1 minute(s). Try again in 45 seconds.",
  "reset_at": "2025-01-15T14:35:00.000Z"
}
```

**Status code:** 429 Too Many Requests

**Headers:**
```
retry-after: 45
```

**Vérifier dans les logs:**
```
[ratelimit] ⚠️ Rate limit exceeded for user uuid-here: 10/10
```

**Vérifier dans la base:**
```sql
SELECT user_id, COUNT(*) as request_count, MAX(created_at) as last_request
FROM ai_rate_limits
WHERE created_at > NOW() - INTERVAL '1 minute'
GROUP BY user_id;
```

---

### 8. Vérifier Table ai_events

```sql
-- Derniers événements
SELECT
  event_type,
  metadata->>'latency_ms' as latency,
  created_at
FROM ai_events
ORDER BY created_at DESC
LIMIT 10;
```

**Événements attendus:**
- `openai_call`
- `appointment_created` (si RDV créé)
- `validation_error` (si erreur validation)

---

## ✅ Checklist Finale

- [ ] Table `ai_rate_limits` créée
- [ ] Toutes les variables d'environnement configurées
- [ ] Fonction déployée avec succès
- [ ] Logs montrent: `[env] ✅ Environment variables validated successfully`
- [ ] Test WORKFLOW mode fonctionne
- [ ] Test WAITING mode fonctionne (si RDV aujourd'hui)
- [ ] Rate limiting bloque après 10 requêtes
- [ ] Table `ai_events` est peuplée
- [ ] Table `ai_rate_limits` est peuplée

---

## 🐛 Troubleshooting

### Erreur: "OPENAI_API_KEY environment variable is not set"
**Solution:** Aller dans Supabase Dashboard → Edge Functions → ai-auto-reply → Settings → Add OPENAI_API_KEY

### Erreur: "relation ai_rate_limits does not exist"
**Solution:** Exécuter la migration SQL dans SQL Editor (étape 1)

### Erreur: "Rate limit exceeded" immédiatement
**Solution:** Nettoyer la table: `DELETE FROM ai_rate_limits WHERE user_id = 'votre-uuid';`

### Tests échouent localement
**Solution:** Les tests nécessitent Deno. Installer avec: `brew install deno` (macOS)

---

## 📊 Monitoring Continue

### Logs en temps réel
```bash
supabase functions logs ai-auto-reply --follow
```

### Métriques importantes

**Latence OpenAI moyenne (dernières 24h):**
```sql
SELECT AVG((metadata->>'latency_ms')::int) as avg_latency_ms
FROM ai_events
WHERE event_type = 'openai_call'
  AND created_at > NOW() - INTERVAL '24 hours';
```

**Requêtes par heure:**
```sql
SELECT
  date_trunc('hour', created_at) as hour,
  COUNT(*) as requests
FROM ai_rate_limits
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Taux d'erreurs validation:**
```sql
SELECT
  COUNT(*) FILTER (WHERE event_type = 'validation_error') as errors,
  COUNT(*) FILTER (WHERE event_type = 'appointment_created') as successes,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_type = 'validation_error') /
    NULLIF(COUNT(*), 0),
    2
  ) as error_rate_percent
FROM ai_events
WHERE created_at > NOW() - INTERVAL '24 hours';
```

---

## 🎉 Déploiement Réussi !

Si toutes les cases sont cochées, votre fonction AI-Auto-Reply est maintenant **en production** avec:

✅ Validation environnement robuste
✅ Rate limiting actif (10 req/min)
✅ Tests automatisés (25 tests)
✅ Monitoring et logs structurés

**Bravo !** 🚀
