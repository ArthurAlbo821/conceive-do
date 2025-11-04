# Instructions de Déploiement - Guide Rapide

## 🚀 Déploiement en Production - Actions Requises

Vous avez corrigé le code pour résoudre l'erreur "Invalid API key" / 401. Voici les étapes à suivre **maintenant** :

---

## ✅ Étape 1: Ajouter les Variables d'Environnement dans Vercel

Allez sur : [Vercel Dashboard → Votre Projet → Settings → Environment Variables](https://vercel.com/dashboard)

### Ajoutez cette NOUVELLE variable (en plus des 3 existantes) :

#### Variable: VITE_SITE_URL ⚠️ CRITIQUE
```
Name: VITE_SITE_URL
Value: https://conceive-do.vercel.app
Environments: ✅ Production ✅ Preview ✅ Development
```

**Remplacez** `https://conceive-do.vercel.app` par votre vraie URL Vercel si différente.

### Vérifiez que vous avez toutes ces variables :
- [x] `VITE_SUPABASE_URL`
- [x] `VITE_SUPABASE_PUBLISHABLE_KEY`
- [x] `VITE_SUPABASE_PROJECT_ID`
- [ ] `VITE_SITE_URL` ← **NOUVELLE VARIABLE À AJOUTER**

---

## ✅ Étape 2: Configurer Supabase URLs

Allez sur : [Supabase Dashboard → Authentication → URL Configuration](https://supabase.com/dashboard/project/mxzvvgpqxugirbwtmxys/auth/url-configuration)

### Site URL
```
https://conceive-do.vercel.app
```

### Redirect URLs (une par ligne)
```
https://conceive-do.vercel.app/dashboard
https://conceive-do.vercel.app/auth
https://conceive-do.vercel.app/reset-password
https://conceive-do.vercel.app/
https://conceive-do.vercel.app/**
http://localhost:8080/dashboard
http://localhost:8080/auth
http://localhost:8080/reset-password
http://localhost:8080/
http://localhost:8080/**
```

Cliquez **Save** !

---

## ✅ Étape 3: Commit et Push

```bash
git add .
git commit -m "fix: Add VITE_SITE_URL for proper email redirects and fix 401 error"
git push
```

**Ou si vous préférez** :
```bash
git add .env.example src/pages/Auth.tsx src/pages/ForgotPassword.tsx VERCEL_DEPLOYMENT_GUIDE.md
git commit -m "fix: Add VITE_SITE_URL for proper email redirects and fix 401 error"
git push
```

---

## ✅ Étape 4: Force Redeploy sur Vercel

### Option A: Vercel redeploie automatiquement après le push
Attendez que le déploiement automatique se termine.

### Option B: Force Redeploy manuel (si besoin)
1. Vercel Dashboard → Deployments
2. Cliquez les **3 points** (⋯) du dernier déploiement
3. **Redeploy**
4. **DÉCOCHEZ** "Use existing Build Cache" ⚠️
5. Cliquez **Redeploy**

---

## ✅ Étape 5: Tester en Production

1. Ouvrez `https://conceive-do.vercel.app/auth`
2. Ouvrez la console (F12)
3. Essayez de créer un compte avec un nouvel email

### Ce que vous devriez voir :

#### Dans la Console (F12)
```
✅ 🔍 Supabase Client Initialization
✅ Environment: production
✅ VITE_SUPABASE_URL: https://mxzvvgpqxugirbwtmxys...
✅ VITE_SUPABASE_PUBLISHABLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC...
```

#### Dans Network Tab
```
✅ POST https://mxzvvgpqxugirbwtmxys.supabase.co/auth/v1/signup
✅ 200 OK (ou 201 Created)
```

#### Sur la Page
```
✅ Toast "Compte créé !"
✅ Redirection vers /dashboard
```

### Si ça ne fonctionne toujours pas :

1. Vérifiez que `VITE_SITE_URL` est bien dans Vercel
2. Vérifiez les build logs Vercel pour voir si la variable est chargée
3. Vérifiez que les URLs sont bien dans Supabase Dashboard
4. Attendez 1-2 minutes après avoir changé les URLs Supabase
5. Videz le cache browser (Ctrl+Shift+R ou Cmd+Shift+R)

---

## 🔍 Debugging

### Vérifier que VITE_SITE_URL est chargée

Dans la console browser en production, tapez :
```javascript
// Cette commande devrait afficher votre URL Vercel
console.log(import.meta.env.VITE_SITE_URL)
```

Si ça affiche `undefined`, c'est que la variable n'est pas dans Vercel ou que vous n'avez pas redéployé.

### Vérifier les Build Logs Vercel

Cherchez ces lignes dans les logs :
```
============================================================
🔧 Vite Build Configuration
============================================================
Mode: production
VITE_SUPABASE_URL: https://mxzvvgpqxugirbwtmxys...
VITE_SUPABASE_PUBLISHABLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC...
============================================================
```

Si vous ne les voyez pas, les variables ne sont pas configurées correctement.

---

## 📋 Checklist Finale

Avant de tester :

- [ ] `VITE_SITE_URL` ajoutée dans Vercel avec votre URL
- [ ] Les 4 variables d'environnement sont cochées "Production"
- [ ] Site URL configurée dans Supabase
- [ ] Redirect URLs configurées dans Supabase (8 lignes)
- [ ] Code commité et pushé sur Git
- [ ] Vercel a redéployé (nouveau déploiement visible dans Dashboard)
- [ ] Build logs montrent les variables
- [ ] Cache browser vidé (Ctrl+Shift+R)

---

## 🎯 Résumé de Ce Qui a Été Corrigé

### Problème Original
L'URL de redirection email était mal formée :
```
❌ mxzvvgpqxugirbwtmxys.app%2Fdashboard:1
```

### Cause
`window.location.origin` retournait une valeur incorrecte ou mal encodée en production.

### Solution Implémentée
1. Ajout de `VITE_SITE_URL` dans `.env` et `.env.example`
2. Modification de `src/pages/Auth.tsx` pour utiliser `VITE_SITE_URL`
3. Modification de `src/pages/ForgotPassword.tsx` pour utiliser `VITE_SITE_URL`
4. Documentation mise à jour

### Résultat Attendu
Les URLs de redirection sont maintenant :
```
✅ https://conceive-do.vercel.app/dashboard
✅ https://conceive-do.vercel.app/reset-password
```

Au lieu de :
```
❌ mxzvvgpqxugirbwtmxys.app%2Fdashboard:1
```

---

## 📞 En Cas de Problème

Si après avoir suivi toutes ces étapes ça ne fonctionne toujours pas :

1. Consultez [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Consultez [SUPABASE_AUTH_CONFIG.md](./SUPABASE_AUTH_CONFIG.md)
3. Exécutez le script : `./scripts/verify-supabase-config.sh`
4. Prenez des screenshots de :
   - Variables Vercel
   - URLs Supabase
   - Console browser (erreurs)
   - Network tab (requête failed)

---

Bonne chance ! 🚀
