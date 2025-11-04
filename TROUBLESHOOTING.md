# Guide de Dépannage - Problèmes de Déploiement Production

## 🔴 Problème : "No API key found in request" en Production

### Symptômes
- ✅ L'application se charge correctement
- ✅ Le frontend s'affiche
- ❌ Erreur lors de la création de compte : "Invalid API key"
- ❌ Console browser : "No API key found in request"

### Diagnostic Rapide

Ouvrez la console du navigateur (F12) sur votre site en production et cherchez :

#### ✅ Cas 1: Vous voyez ces logs
```
🔍 Supabase Client Initialization
Environment: production
VITE_SUPABASE_URL: https://mxzvvgpqxugirbwtmxys...
VITE_SUPABASE_PUBLISHABLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC...
```
**→ Bon signe !** Les variables sont chargées. Le problème est ailleurs.
→ Passez à la section "Problèmes Supabase Edge Functions"

#### ❌ Cas 2: Vous voyez cette erreur
```
❌ Supabase Client Error: Missing Supabase environment variables.
VITE_SUPABASE_URL: ❌ MISSING
VITE_SUPABASE_PUBLISHABLE_KEY: ❌ MISSING
```
**→ C'est le problème principal !** Les variables ne sont pas injectées au build.
→ Suivez le guide [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)

#### ⚠️ Cas 3: Vous ne voyez aucun log Supabase
**→ Le JavaScript ne se charge pas correctement**
→ Vérifiez les erreurs 404 dans l'onglet Network de la console

---

## 📊 Arbre de Décision

```
Votre site en production charge-t-il le frontend ?
│
├─ NON (Page blanche)
│  └─ Problème: Configuration Vercel routing
│     Solution: Vérifiez vercel.json (voir section "Page Blanche")
│
└─ OUI (Frontend visible)
   │
   └─ La console montre-t-elle les logs "🔍 Supabase Client" ?
      │
      ├─ NON (Pas de logs ou erreur "Missing env variables")
      │  └─ Problème: Variables d'environnement Vercel
      │     Solution: VERCEL_DEPLOYMENT_GUIDE.md
      │
      └─ OUI (Les variables sont présentes)
         │
         └─ L'erreur survient-elle après l'inscription ?
            │
            ├─ NON (Erreur immédiate au chargement)
            │  └─ Problème: CORS ou configuration Supabase
            │     Solution: Voir section "Problèmes CORS"
            │
            └─ OUI (Erreur après signup/dashboard)
               └─ Problème: Secrets Supabase Edge Functions
                  Solution: Voir section "Edge Functions"
```

---

## 🔧 Solutions par Type de Problème

### Problème 1: Page Blanche (Frontend ne charge pas)

**Cause**: Vercel ne sait pas servir `index.html` pour les routes React Router.

**Solution**:
1. Vérifiez que [vercel.json](./vercel.json) existe avec :
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

2. Si le fichier manque ou est incorrect, créez-le/corrigez-le
3. Commit et push :
```bash
git add vercel.json
git commit -m "fix: Add Vercel SPA routing config"
git push
```

---

### Problème 2: Variables d'Environnement Manquantes

**Cause**: Les variables `VITE_*` ne sont pas configurées dans Vercel ou pas disponibles au build.

**Diagnostic**:
```bash
# Vérifiez vos build logs Vercel
# Cherchez cette section :
============================================================
🔧 Vite Build Configuration
============================================================
Mode: production
VITE_SUPABASE_URL: ❌ NOT DEFINED  ← PROBLÈME ICI
VITE_SUPABASE_PUBLISHABLE_KEY: ❌ NOT DEFINED
============================================================
```

**Solution Complète**: Voir [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)

**Solution Rapide**:
1. Vercel Dashboard → Settings → Environment Variables
2. Ajoutez :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
3. Cochez **Production**
4. Redéployez SANS cache

---

### Problème 3: Supabase Edge Functions Secrets Manquants

**Symptôme**:
- Frontend fonctionne
- Variables VITE_* sont présentes
- Erreur "Invalid API key" APRÈS la création de compte

**Cause**: Les Edge Functions Supabase n'ont pas accès aux secrets (EVOLUTION_API_KEY, etc.)

**Diagnostic**:
```bash
# Vérifiez les secrets actuels
supabase secrets list

# Si la liste est vide ou incomplète, c'est le problème
```

**Solution**:

#### Étape 1: Lier le CLI à votre projet production
```bash
cd /Users/arthurhernandes/conceive-do
supabase link --project-ref mxzvvgpqxugirbwtmxys
```

#### Étape 2: Obtenir vos clés Supabase
1. Allez sur [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet
3. Settings → API
4. Copiez :
   - `service_role` key (secret, ne jamais mettre dans le frontend !)
   - `anon` key (public)

#### Étape 3: Déployer les secrets
```bash
# Secrets Supabase (OBLIGATOIRES)
supabase secrets set SUPABASE_URL="https://mxzvvgpqxugirbwtmxys.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="votre-anon-key-ici"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="votre-service-role-key-ici"

# Evolution API (si vous utilisez WhatsApp)
supabase secrets set EVOLUTION_API_KEY="votre-evolution-key"
supabase secrets set EVOLUTION_API_BASE_URL="https://votre-evolution-api.com"
supabase secrets set EVOLUTION_API_GLOBAL_KEY="votre-global-key"

# OpenAI (si vous utilisez l'IA)
supabase secrets set OPENAI_API_KEY="sk-votre-openai-key"

# Webhook secret (généré aléatoirement)
supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)"

# Duckling (optionnel)
supabase secrets set DUCKLING_API_URL="https://duckling-production-0c9c.up.railway.app/parse"
```

#### Étape 4: Vérifier
```bash
supabase secrets list
# Devrait afficher tous les secrets
```

#### Étape 5: Redéployer les Edge Functions (si nécessaire)
```bash
# Déployer toutes les fonctions
supabase functions deploy create-evolution-instance
supabase functions deploy evolution-webhook-handler
supabase functions deploy ai-auto-reply
supabase functions deploy check-instance-status
```

---

### Problème 4: CORS Errors

**Symptôme**:
```
Access to fetch at 'https://...' from origin 'https://your-app.vercel.app'
has been blocked by CORS policy
```

**Cause**: Supabase ou Evolution API bloque les requêtes depuis votre domaine Vercel.

**Solution**:

#### Pour Supabase:
1. Supabase Dashboard → Authentication → URL Configuration
2. Ajoutez votre URL Vercel dans "Site URL" :
   ```
   https://your-app.vercel.app
   ```
3. Ajoutez aussi dans "Redirect URLs" :
   ```
   https://your-app.vercel.app/dashboard
   https://your-app.vercel.app/auth
   ```

#### Pour Evolution API:
Configurez l'API pour accepter les requêtes depuis votre domaine Vercel.

---

## 🧪 Tests de Vérification

### Test 1: Variables Frontend
```bash
# Localement
npm run build
grep -r "mxzvvgpqxugirbwtmxys" dist/

# Devrait trouver votre URL Supabase dans les fichiers JS
```

### Test 2: Client Supabase
Ouvrez la console browser en production et tapez :
```javascript
// Dans la console browser
console.log(window.localStorage.getItem('supabase.auth.token'))
// Devrait afficher un token après connexion
```

### Test 3: Edge Functions
```bash
# Tester une Edge Function
curl https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/health \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Test 4: Vérifier les secrets Supabase
```bash
supabase secrets list
# Devrait afficher au minimum :
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - SUPABASE_ANON_KEY
```

---

## 📝 Checklist Complète de Déploiement

### Frontend (Vercel)
- [ ] `vercel.json` existe avec configuration SPA routing
- [ ] Variables d'environnement configurées :
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_PUBLISHABLE_KEY`
  - [ ] `VITE_SUPABASE_PROJECT_ID`
- [ ] Environnement **Production** coché pour chaque variable
- [ ] Redéployé SANS cache
- [ ] Build logs montrent `🔧 Vite Build Configuration` avec les variables
- [ ] Console browser montre `🔍 Supabase Client Initialization`

### Backend (Supabase)
- [ ] Projet lié : `supabase link --project-ref mxzvvgpqxugirbwtmxys`
- [ ] Secrets déployés : `supabase secrets list` montre tous les secrets
- [ ] Edge Functions déployées : `supabase functions list`
- [ ] Migrations appliquées : `supabase db push`
- [ ] URLs autorisées dans Auth Configuration

### Tests
- [ ] Page d'accueil charge correctement
- [ ] Refresh d'une route fonctionne (pas de 404)
- [ ] Console browser ne montre pas d'erreurs
- [ ] Création de compte fonctionne
- [ ] Dashboard affiche le QR code
- [ ] Messages WhatsApp fonctionnent (si applicable)

---

## 🆘 Si Rien ne Fonctionne

### 1. Collectez les Informations
Prenez des captures d'écran de :
- Vercel Settings → Environment Variables (liste complète)
- Vercel Build Logs (section complète avec les variables)
- Console browser (onglet Console ET Network)
- Supabase Dashboard → Settings → API

### 2. Vérifiez les Basiques
```bash
# Le projet est-il lié ?
cat supabase/config.toml | grep project_id
# Devrait afficher : project_id = "mxzvvgpqxugirbwtmxys"

# Les secrets sont-ils présents ?
supabase secrets list
# Devrait afficher au moins 7 secrets

# Le build local fonctionne-t-il ?
npm run build && npm run preview
# Testez sur http://localhost:4173
```

### 3. Reset Complet (dernier recours)
```bash
# 1. Supprimer le node_modules et dist
rm -rf node_modules dist

# 2. Réinstaller
npm install

# 3. Rebuild
npm run build

# 4. Test local
npm run preview

# 5. Si ça marche localement, force push sur Vercel
git commit --allow-empty -m "fix: Force complete rebuild"
git push

# 6. Dans Vercel Dashboard
# Deployments → Latest → ⋯ → Redeploy (SANS cache)
```

---

## 📞 Support

### Logs Importants à Consulter

#### Vercel Build Logs
```
Vercel Dashboard → Deployments → [Votre déploiement] → Building
```
Cherchez : `🔧 Vite Build Configuration`

#### Vercel Function Logs
```
Vercel Dashboard → Deployments → [Votre déploiement] → Functions
```

#### Supabase Edge Function Logs
```bash
supabase functions logs create-evolution-instance
supabase functions logs ai-auto-reply
```

#### Browser Console
```
F12 → Console (pour les erreurs JavaScript)
F12 → Network (pour les requêtes HTTP)
```

### Commandes de Diagnostic
```bash
# Vérifier la version Node locale vs Vercel
node --version

# Vérifier la configuration Vercel
cat vercel.json

# Vérifier les variables d'environnement locales
cat .env

# Vérifier le projet Supabase
supabase status

# Lister les secrets
supabase secrets list

# Lister les fonctions déployées
supabase functions list
```

---

## 🎯 Résumé des Causes Fréquentes

| Symptôme | Cause Probable | Solution |
|----------|----------------|----------|
| Page blanche | Pas de `vercel.json` | Créer le fichier de config SPA |
| "Missing env variables" | Variables VITE_ pas dans Vercel | Ajouter dans Settings + Redeploy sans cache |
| "No API key found" après signup | Secrets Edge Functions manquants | `supabase secrets set` pour chaque secret |
| CORS errors | URLs pas autorisées | Ajouter URLs dans Supabase Auth Config |
| 404 sur refresh | Routing SPA mal configuré | Vérifier `vercel.json` rewrites |
| Variables "undefined" en prod | Cache Vercel | Redeploy SANS "Use existing Build Cache" |

---

**Dernière mise à jour** : 2025-11-04
**Version** : 1.0
