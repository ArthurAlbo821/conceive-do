# Configuration de Sécurité CORS

## Vue d'ensemble

La fonction `ai-auto-reply` utilise maintenant une configuration CORS sécurisée basée sur une liste blanche d'origines autorisées, au lieu du caractère générique `*` qui était dangereux en production.

## Changements Effectués

### 1. Fonction `getCorsHeaders()` (config.ts)

Une nouvelle fonction a été ajoutée qui :
- Lit les origines autorisées depuis les variables d'environnement
- Valide l'origine de la requête contre la liste blanche
- Retourne les en-têtes CORS appropriés
- Utilise un fallback localhost pour le développement local

### 2. Gestion des Requêtes OPTIONS (index.ts)

- Support complet des requêtes CORS preflight (OPTIONS)
- Gestion dynamique des en-têtes CORS basée sur l'origine de la requête
- Tous les points de réponse incluent maintenant les en-têtes CORS

### 3. Fonctions d'Erreur Mises à Jour

- `authErrorResponse()` (security/auth.ts)
- `rateLimitErrorResponse()` (security/ratelimit.ts)

Ces fonctions acceptent maintenant un paramètre optionnel pour les en-têtes CORS.

## Configuration

### Variables d'Environnement

Ajoutez l'une de ces variables d'environnement dans votre configuration Supabase :

#### Option 1 : Origine unique
```bash
ALLOWED_ORIGIN=https://votre-domaine.com
```

#### Option 2 : Plusieurs origines (recommandé)
```bash
ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com,https://app.votre-domaine.com
```

### Configuration dans Supabase Dashboard

1. Allez dans **Settings** → **Edge Functions** → **Environment Variables**
2. Ajoutez la variable `ALLOWED_ORIGINS` ou `ALLOWED_ORIGIN`
3. Valeur : liste des origines séparées par des virgules (sans espaces)

Exemple :
```
ALLOWED_ORIGINS=https://conceive-do.vercel.app,https://www.conceive-do.vercel.app
```

### Configuration via Supabase CLI

```bash
supabase secrets set ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com
```

## Comportement

### En Production
- Si `ALLOWED_ORIGINS` ou `ALLOWED_ORIGIN` est défini :
  - Seules les origines listées sont acceptées
  - Les requêtes d'origines non autorisées ne recevront pas l'en-tête `Access-Control-Allow-Origin`
  - Le navigateur bloquera les réponses pour les origines non autorisées

### En Développement Local
- Si aucune origine n'est configurée :
  - Fallback automatique vers `http://localhost:5173` et `http://localhost:3000`
  - Pratique pour le développement local sans configuration supplémentaire

### En-têtes Retournés

Pour une origine autorisée :
```http
Access-Control-Allow-Origin: https://votre-domaine.com
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
Access-Control-Allow-Credentials: true
```

Pour les requêtes preflight (OPTIONS) :
```http
Access-Control-Allow-Origin: https://votre-domaine.com
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Max-Age: 86400
Access-Control-Allow-Credentials: true
```

## Sécurité

### ✅ Avantages

1. **Protection contre les requêtes cross-origin non autorisées** : Seuls les domaines autorisés peuvent appeler votre API
2. **Support des credentials** : Les cookies et en-têtes d'authentification fonctionnent correctement
3. **Validation dynamique** : L'origine est vérifiée à chaque requête
4. **Pas d'exposition accidentelle** : Si l'origine n'est pas dans la liste, pas d'en-tête CORS

### ⚠️ Points d'Attention

1. **N'oubliez pas de configurer `ALLOWED_ORIGINS`** en production, sinon seuls localhost fonctionneront
2. **Incluez tous vos domaines** : production, staging, www, etc.
3. **Pas de wildcards** : Les sous-domaines doivent être explicitement listés
4. **Protocol matters** : `https://example.com` ≠ `http://example.com`

## Exemples de Configuration

### Application Vercel
```bash
ALLOWED_ORIGINS=https://conceive-do.vercel.app,https://conceive-do-preview.vercel.app
```

### Plusieurs Environnements
```bash
ALLOWED_ORIGINS=https://prod.example.com,https://staging.example.com,https://dev.example.com,http://localhost:5173
```

### Domaine Principal + WWW
```bash
ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

## Test

Pour tester la configuration CORS :

```bash
# Requête preflight
curl -X OPTIONS https://votre-projet.supabase.co/functions/v1/ai-auto-reply \
  -H "Origin: https://votre-domaine.com" \
  -H "Access-Control-Request-Method: POST" \
  -v

# Vérifiez la présence de :
# Access-Control-Allow-Origin: https://votre-domaine.com
```

## Dépannage

### Erreur CORS dans la console navigateur

```
Access to fetch at '...' from origin 'https://votre-domaine.com' has been blocked by CORS policy
```

**Solutions** :
1. Vérifiez que `ALLOWED_ORIGINS` est défini dans Supabase
2. Vérifiez que votre domaine est dans la liste
3. Vérifiez le protocole (http vs https)
4. Redéployez la fonction après avoir changé les variables d'environnement

### Les requêtes fonctionnent en local mais pas en production

1. Ajoutez explicitement vos domaines de production à `ALLOWED_ORIGINS`
2. Ne comptez pas sur le fallback localhost en production
3. Redéployez après modification des variables d'environnement

## Migration depuis l'ancienne configuration

Si vous utilisiez auparavant `corsHeaders` comme constante :

```typescript
// Ancien code
return new Response(data, { headers: { ...corsHeaders } });

// Nouveau code
const corsHeaders = getCorsHeaders(request.headers.get('Origin'));
return new Response(data, { headers: { ...corsHeaders } });
```

La migration a été effectuée automatiquement dans `index.ts`, `auth.ts` et `ratelimit.ts`.

