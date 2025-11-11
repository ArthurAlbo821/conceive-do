# AI Auto-Reply Function - Production Ready

## 🎯 Overview

Edge Function pour réponses automatiques IA avec réservation de rendez-vous via WhatsApp.

**Version:** V4 (avec améliorations de sécurité et validation)
**Status:** ✅ Production Ready

---

## 🏗️ Architecture

### Modules (29 fichiers)
- **config/** - Configuration et validation environnement
- **security/** - Authentification JWT et rate limiting
- **utils/** - Timezone, enums dynamiques, pricing
- **temporal/** - Parsing temporel (Duckling + Chrono fallback)
- **data/** - Fetching données utilisateur et conversations
- **availability/** - Calcul et validation créneaux horaires
- **ai/** - Intégration OpenAI et prompts (WORKFLOW + WAITING)
- **appointments/** - Création, validation, confirmation RDV
- **messaging/** - Envoi WhatsApp avec retry
- **logging/** - Événements structurés dans ai_events
- **tests/** - 25 tests unitaires

### Flow (13 étapes)
1. Authentication (JWT)
2. Parse request body
3. Initialize Supabase
4. **Rate limiting check** ⭐ NEW
5. Fetch data (user + conversation)
6. Temporal parsing (Duckling → Chrono fallback)
7. Build contexts
8. Determine AI mode (WORKFLOW vs WAITING)
9. Build system prompt
10. Call OpenAI API
11. Process response (mode-specific)
12. Send WhatsApp message
13. Return success response

---

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Supabase CLI installed
supabase --version

# Environment variables ready
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...
SUPABASE_JWT_SECRET=your-secret
OPENAI_API_KEY=sk-...
DUCKLING_API_URL=https://duckling.railway.app (optional)
```

### 2. Database Setup

```bash
# Run migration to create rate_limits table
supabase db push

# Or manually run the SQL:
psql $DATABASE_URL < supabase/migrations/create_rate_limits_table.sql
```

### 3. Configure Environment

Dans Supabase Dashboard → Edge Functions → ai-auto-reply → Settings:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_JWT_SECRET=your-jwt-secret-min-32-chars
OPENAI_API_KEY=sk-proj-xxx
DUCKLING_API_URL=https://duckling.railway.app
```

### 4. Deploy

```bash
cd supabase/functions
supabase functions deploy ai-auto-reply
```

### 5. Test

```bash
# Test with curl
curl -X POST https://xxx.supabase.co/functions/v1/ai-auto-reply \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "uuid-here",
    "message_text": "Bonjour, je voudrais un rendez-vous demain à 14h"
  }'
```

---

## 🧪 Testing

### Run Tests Locally

```bash
cd supabase/functions/ai-auto-reply

# Run all tests
deno task test

# Watch mode
deno task test:watch

# With coverage
deno task test:coverage
```

### Test Suites
- **availability-calculator.test.ts** - 10 tests (créneaux, minuit, lead time)
- **appointment-validation.test.ts** - 10 tests (enums, formats, cas limites)
- **temporal-parser.test.ts** - 5 tests (enrichissement temporel)

**Total:** 25 tests unitaires

---

## 🔒 Security Features

### 1. Environment Validation ⭐ NEW
- Validation Zod au démarrage
- Exit si variables manquantes/invalides
- Messages d'erreur clairs

### 2. JWT Authentication
- Validation signature + expiration
- Extraction user_id depuis token

### 3. Rate Limiting ⭐ NEW
- **Limite:** 10 requêtes/minute par user
- **Table:** ai_rate_limits (auto-cleanup 24h)
- **Réponse:** 429 avec retry-after header
- **Stratégie:** Fail-open (meilleure UX)

### 4. Validation Triple Couche
- Format (regex date/time)
- Enums (durée, extras depuis catalogue)
- Duplicates (query DB)

---

## 📊 Monitoring

### Logs Structurés

```bash
# Voir les logs en temps réel
supabase functions logs ai-auto-reply --follow

# Logs importants à surveiller:
[env] ✅ Environment variables validated successfully
[ratelimit] ✅ Request allowed (5/10)
[openai] ✅ Response received in 1234 ms
[whatsapp] ✅ Message sent
```

### Métriques Clés (table ai_events)

```sql
-- Latence moyenne OpenAI
SELECT AVG((metadata->>'latency_ms')::int) FROM ai_events
WHERE event_type = 'openai_call'
AND created_at > NOW() - INTERVAL '24 hours';

-- Taux de succès validation
SELECT
  event_type,
  COUNT(*) as count
FROM ai_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type;

-- Rate limit violations
SELECT COUNT(*) FROM ai_rate_limits
WHERE created_at > NOW() - INTERVAL '1 hour';
```

---

## 🐛 Troubleshooting

### Error: "OPENAI_API_KEY environment variable is not set"
**Solution:** Vérifier que la variable est bien configurée dans Supabase Dashboard

### Error: "Rate limit exceeded"
**Cause:** User a dépassé 10 requêtes/minute
**Solution:** Attendre 1 minute ou ajuster RATE_LIMIT_CONFIG dans security/ratelimit.ts

### Error: "Validation failed: SUPABASE_URL must be a valid URL"
**Cause:** Variable d'environnement manquante ou invalide
**Solution:** Vérifier toutes les variables requises (voir logs au démarrage)

### Tests qui échouent
**Cause:** Timezone ou données de test invalides
**Solution:** Vérifier que les dates de test sont dans le futur

---

## 📚 Documentation

- **PROJET-FINAL-RECAP.md** - Vue d'ensemble architecture
- **DEPLOY-GUIDE.md** - Guide de déploiement détaillé
- **IMPROVEMENTS-RECAP.md** - Récapitulatif des améliorations (2025-01-15)
- **README.md** - Ce fichier

### JSDoc
Toutes les fonctions exportées ont une documentation JSDoc complète avec exemples.

---

## 🔄 Updates History

### 2025-01-15 - V4 Security & Validation Update
- ✅ Ajout fonction `executeOpenAIRequest()` manquante
- ✅ Validation environnement avec Zod
- ✅ 25 tests unitaires automatisés
- ✅ Rate limiting (10 req/min)
- ✅ Migration SQL pour ai_rate_limits

### Before - V4 Initial Refactoring
- ✅ Refactoring monolithe → 29 fichiers modulaires
- ✅ Dual AI mode (WORKFLOW + WAITING)
- ✅ Enums dynamiques anti-hallucination
- ✅ Temporal parsing avec fallback
- ✅ Support créneaux minuit
- ✅ Logging structuré

---

## 🤝 Contributing

### Ajouter un nouveau test

```typescript
// tests/my-feature.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { myFunction } from '../my-module.ts';

Deno.test('myFunction - description', () => {
  const result = myFunction('input');
  assertEquals(result, 'expected');
});
```

### Modifier la configuration

```typescript
// config.ts
export const MY_CONFIG = {
  SETTING: 'value'
};
```

### Ajouter un module

```typescript
// new-module/my-feature.ts
/**
 * My feature description
 * @param input - Input description
 * @returns Output description
 */
export function myFeature(input: string): string {
  return `Processed: ${input}`;
}
```

---

## 📞 Support

**Issues:** GitHub Issues
**Documentation:** See docs/ folder
**Logs:** `supabase functions logs ai-auto-reply`

---

## 📄 License

Proprietary - Joblya V4

---

**Status:** ✅ Production Ready
**Last Updated:** 2025-01-15
**Maintainer:** Development Team
