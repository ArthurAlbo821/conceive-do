# 🔒 Déploiement Sécurité Webhook - PHASE 2 TERMINÉE ✅

## Résumé des Changements

Le webhook `evolution-webhook-handler` a été **sécurisé avec succès** !

### ✅ Ce qui a été fait :

#### 1. Fichier de Sécurité Créé
- **Fichier** : `supabase/functions/_shared/webhook-security.ts`
- **Contient** : Vérification HMAC, rate limiting, validation

#### 2. Webhook Handler Modifié
- **Fichier** : `supabase/functions/evolution-webhook-handler/index.ts`
- **Backup** : `index.ts.backup` (version originale sauvegardée)
- **Lignes** : 690 lignes (vs 561 avant)
- **Ajouts** :
  - 🔒 Import des utilitaires de sécurité (lignes 2-7)
  - 🔒 Header `x-webhook-signature` dans CORS (ligne 12)
  - 🔒 Couche de sécurité complète (lignes 200-273)
  - 🔒 Gestion d'erreurs sécurisée (ligne 685)

---

## 🔐 Fonctionnalités de Sécurité Actives

### 1. ✅ Rate Limiting
- **Limite** : 100 requêtes/minute par IP
- **Réponse** : HTTP 429 si dépassé
- **Headers** : `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

### 2. ✅ Validation Payload
- Vérifie que `event` existe
- Vérifie que `instance` existe
- Rejette JSON malformé (HTTP 400)

### 3. ✅ Vérification HMAC (Optionnelle)
- **Si `WEBHOOK_SECRET` configuré** : Vérifie signature SHA-256
- **Si pas configuré** : Log WARNING mais accepte (mode dégradé)
- **Signature invalide** : HTTP 401 Unauthorized

### 4. ✅ Gestion Erreurs Sécurisée
- Production : Messages génériques
- Development : Messages détaillés
- Logs des tentatives d'attaque

---

## 🚀 PHASE 3 : Déploiement

### Étape 1 : Vérifier que WEBHOOK_SECRET est configuré

Allez sur **Supabase Dashboard** :
1. Project Settings → Edge Functions → Secrets
2. Vérifiez que `WEBHOOK_SECRET` existe
3. Valeur : `[VOTRE_SECRET_WEBHOOK_ICI]`

✅ **Confirmé** par l'utilisateur

---

### Étape 2 : Déployer le Nouveau Webhook

#### Option A : Via Supabase CLI (Recommandé)

```bash
# 1. Se placer dans le dossier du projet
cd /Users/arthurhernandes/conceive-do

# 2. Déployer l'edge function
supabase functions deploy evolution-webhook-handler

# 3. Vérifier le déploiement
# Vous devriez voir : "Deployed function evolution-webhook-handler"
```

#### Option B : Via Supabase Dashboard

1. Allez dans **Edge Functions**
2. Cliquez sur `evolution-webhook-handler`
3. Cliquez sur **Deploy new version**
4. Uploadez `supabase/functions/evolution-webhook-handler/index.ts`
5. Cliquez **Deploy**

---

### Étape 3 : Tester la Sécurité

Une fois déployé, utilisez le script de test :

```bash
# Remplacez YOUR_PROJECT par votre project ID Supabase
./scripts/test-webhook-security.sh \
  https://YOUR_PROJECT.supabase.co/functions/v1/evolution-webhook-handler \
  05c6e76513e63310905c2eca7d3e6c56db6a079cafb334bca195db4544a56ceb
```

**Résultats attendus** :
```
✅ Test 1: Request WITHOUT signature → 401 Unauthorized ✅
✅ Test 2: Request WITH invalid signature → 401 Unauthorized ✅
✅ Test 3: Request WITH valid signature → 200 OK ✅
✅ Test 4: Rate limiting active → 429 after 100 requests ✅
✅ Test 5: Malformed JSON → 400 Bad Request ✅
```

---

## ⚙️ Configuration Evolution API (IMPORTANT)

Pour que Evolution API envoie la signature HMAC, configurez le webhook :

### Méthode : Via Evolution API

```bash
# Mettre à jour l'instance avec la signature
curl -X PUT 'https://your-evolution-api.com/instance/YOUR_INSTANCE' \
  -H 'apikey: YOUR_EVOLUTION_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "webhook": {
      "url": "https://YOUR_PROJECT.supabase.co/functions/v1/evolution-webhook-handler",
      "enabled": true,
      "webhookByEvents": false,
      "headers": {
        "x-webhook-signature": "CALCULATED_HMAC_HERE"
      }
    }
  }'
```

**Note** : Evolution API doit calculer la signature HMAC en utilisant le même secret (`WEBHOOK_SECRET`).

---

## 🔍 Monitoring et Logs

### Voir les logs du webhook :

```bash
# Via Supabase CLI
supabase functions logs evolution-webhook-handler

# Rechercher les logs de sécurité
supabase functions logs evolution-webhook-handler | grep "webhook-security"
```

### Logs à surveiller :

✅ **Normal** :
```
[webhook-security] ✅ Signature verified for instance: your-instance
```

⚠️ **Warning** (Mode dégradé - pas de vérification signature) :
```
[webhook-security] ⚠️  WEBHOOK_SECRET not configured
[webhook-security] ⚠️  Webhook is VULNERABLE to spoofing attacks
```

🚨 **Alerte Sécurité** (Tentative d'attaque) :
```
[webhook-security] 🚨 SECURITY ALERT: Invalid signature from 1.2.3.4
[webhook-security] 🚨 Payload preview: {"event":"test"...
```

---

## 🛡️ Mode de Fonctionnement

### Cas 1 : WEBHOOK_SECRET configuré (Production - Sécurisé)
```
Requête → Rate Limit Check → Parse JSON → Validate Structure → Verify HMAC
         ↓ (OK)            ↓ (OK)        ↓ (OK)              ↓ (OK)
         Process webhook   ✅
         ↓ (Rate limit)    ↓ (Invalid)   ↓ (Invalid)         ↓ (Invalid)
         429 Error         400 Error     400 Error            401 Error
```

### Cas 2 : WEBHOOK_SECRET non configuré (Mode dégradé - WARNING)
```
Requête → Rate Limit Check → Parse JSON → Validate Structure → ⚠️ Skip HMAC
         ↓ (OK)            ↓ (OK)        ↓ (OK)
         Process webhook + Log WARNING ⚠️
```

---

## 📊 Différences Entre Ancien et Nouveau

| Aspect | Avant (index.ts.backup) | Après (index.ts) |
|--------|------------------------|------------------|
| **Lignes de code** | 561 | 690 |
| **Authentification** | ❌ Aucune | ✅ HMAC SHA-256 |
| **Rate limiting** | ❌ Non | ✅ 100 req/min |
| **Validation payload** | ❌ Non | ✅ Oui |
| **Gestion erreurs** | ⚠️ Basique | ✅ Sécurisée |
| **Logs sécurité** | ❌ Non | ✅ Oui |
| **Headers CORS** | 4 headers | 5 headers (+signature) |

---

## 🆘 Dépannage

### Problème : "Cannot find module webhook-security.ts"

**Solution** : Le fichier `_shared/webhook-security.ts` doit être déployé aussi.

```bash
# Déployer les fichiers partagés
cd supabase/functions
# Le dossier _shared est automatiquement inclus lors du déploiement
supabase functions deploy evolution-webhook-handler
```

### Problème : Webhook ne reçoit plus de messages

**Causes possibles** :
1. Evolution API n'envoie pas la signature
2. La signature est invalide

**Solution temporaire** :
- Supprimer `WEBHOOK_SECRET` de Supabase (mode dégradé avec warnings)
- Ou configurer Evolution API correctement

### Problème : 429 Rate Limit Exceeded

**Normal** si vous testez beaucoup.
**Solution** : Attendez 1 minute ou augmentez la limite dans le code (ligne 208).

---

## ✅ Checklist Finale

Avant de marquer comme complété :

- [x] ✅ Backup original créé (`index.ts.backup`)
- [x] ✅ Nouveau webhook créé avec sécurité
- [x] ✅ WEBHOOK_SECRET configuré dans Supabase
- [ ] ⏳ Webhook déployé sur Supabase
- [ ] ⏳ Tests de sécurité exécutés
- [ ] ⏳ Evolution API configuré avec signature
- [ ] ⏳ Monitoring activé

---

## 📝 Prochaines Étapes

1. **Maintenant** : Déployer le webhook (Étape 2)
2. **Ensuite** : Tester la sécurité (Étape 3)
3. **Puis** : Configurer Evolution API (si pas déjà fait)
4. **Enfin** : Monitorer les logs pendant 24h

---

**Fichiers Modifiés** :
- ✅ `supabase/functions/_shared/webhook-security.ts` (créé)
- ✅ `supabase/functions/evolution-webhook-handler/index.ts` (sécurisé)
- ✅ `supabase/functions/evolution-webhook-handler/index.ts.backup` (backup)

**Votre secret webhook** : `[VOTRE_SECRET_WEBHOOK_ICI]`

---

🎉 **Félicitations ! La Phase 2 est terminée.**
🚀 **Passez à la Phase 3 : Déploiement**
