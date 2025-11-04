# Guide de Déploiement Vercel - Résolution "No API key found"

## 🔴 Symptôme du Problème

En production sur Vercel, lors de la création d'un compte, vous obtenez :
```
Failed to load resource: 401
"No API key found in request"
"No `apikey` request header or url param was found."
```

## 🎯 Cause Racine

Les variables d'environnement **VITE_*** ne sont **PAS** injectées dans le build de production par Vercel, ce qui fait que le client Supabase n'a pas l'API key.

### Pourquoi cela arrive ?

Vite injecte les variables d'environnement **au moment du build**, pas au runtime. Si les variables ne sont pas disponibles pendant `npm run build` sur Vercel, elles ne seront jamais dans votre JavaScript final.

## ✅ Solution Étape par Étape

### Étape 1: Vérifier les Variables d'Environnement dans Vercel

1. Allez sur [Vercel Dashboard](https://vercel.com/dashboard)
2. Sélectionnez votre projet
3. Allez dans **Settings** → **Environment Variables**
4. **VÉRIFIEZ QUE CES VARIABLES EXISTENT** :

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

5. **IMPORTANT** : Vérifiez que chaque variable a bien :
   - ✅ **Production** coché
   - ✅ **Preview** coché (optionnel)
   - ✅ **Development** coché (optionnel)

### Étape 2: Ajouter/Corriger les Variables Si Nécessaire

Si les variables manquent ou sont mal configurées :

1. Cliquez sur **Add New**
2. Pour chaque variable, entrez :

#### Variable 1
```
Name: VITE_SUPABASE_URL
Value: https://mxzvvgpqxugirbwtmxys.supabase.co
Environments: ✅ Production ✅ Preview ✅ Development
```

#### Variable 2
```
Name: VITE_SUPABASE_PUBLISHABLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14enZ2Z3BxeHVnaXJid3RteHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0ODQ0NzAsImV4cCI6MjA3NzA2MDQ3MH0.v6GibByY-GbnPIA9S4S8Z2tRp8plD2RxPKXiBvrnJRs
Environments: ✅ Production ✅ Preview ✅ Development
```

#### Variable 3
```
Name: VITE_SUPABASE_PROJECT_ID
Value: mxzvvgpqxugirbwtmxys
Environments: ✅ Production ✅ Preview ✅ Development
```

3. Cliquez **Save**

### Étape 3: Forcer un Redéploiement SANS Cache

**C'EST L'ÉTAPE LA PLUS IMPORTANTE !**

#### Option A: Via Dashboard (Recommandé)

1. Allez dans **Deployments**
2. Trouvez le dernier déploiement
3. Cliquez sur les **trois points** (⋯) à droite
4. Sélectionnez **Redeploy**
5. **DÉCOCHEZ** "Use existing Build Cache" ⚠️
6. Cliquez **Redeploy**

#### Option B: Via Git (Alternative)

```bash
# Faites un commit vide pour forcer un rebuild
git commit --allow-empty -m "fix: Force rebuild with environment variables"
git push
```

### Étape 4: Vérifier les Build Logs

1. Pendant que le déploiement se fait, cliquez dessus
2. Regardez les **Build Logs**
3. **Cherchez ces lignes** :

```
============================================================
🔧 Vite Build Configuration
============================================================
Mode: production
VITE_SUPABASE_URL: https://mxzvvgpqxugirbwtmxys...
VITE_SUPABASE_PUBLISHABLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC...
============================================================
```

#### ✅ Si vous voyez ces lignes
Les variables sont bien chargées ! Le problème devrait être résolu.

#### ❌ Si vous ne voyez PAS ces lignes
Les variables ne sont toujours pas disponibles au build. Retournez à l'Étape 1 et vérifiez que :
- Les noms sont EXACTEMENT `VITE_SUPABASE_URL` (pas `SUPABASE_URL`)
- L'environnement **Production** est bien coché
- Vous avez bien redéployé SANS cache

### Étape 5: Tester en Production

1. Ouvrez votre site déployé sur Vercel
2. Ouvrez la console du navigateur (F12)
3. Vous devriez voir :
```
🔍 Supabase Client Initialization
Environment: production
VITE_SUPABASE_URL: https://mxzvvgpqxugirbwtmxys...
VITE_SUPABASE_PUBLISHABLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC...
```

4. Essayez de créer un compte
5. Ça devrait fonctionner ! ✅

## 🔍 Diagnostic des Problèmes

### Problème 1: Les variables ne s'affichent pas dans les build logs

**Causes possibles** :
- Variables nommées incorrectement (doit commencer par `VITE_`)
- Variables pas cochées pour l'environnement Production
- Cache Vercel pas effacé

**Solution** :
1. Vérifiez l'orthographe exacte : `VITE_SUPABASE_URL` (pas `SUPABASE_URL`)
2. Vérifiez que Production est coché
3. Redéployez avec "Use existing Build Cache" DÉCOCHÉ

### Problème 2: Les variables s'affichent dans build logs mais pas dans le navigateur

**Cause** :
Le build s'est fait avec les anciennes variables, puis vous les avez changées.

**Solution** :
Refaites l'Étape 3 (redéploiement sans cache)

### Problème 3: Erreur "❌ NOT DEFINED" dans les logs

**Cause** :
Les variables ne sont pas préfixées avec `VITE_` ou ne sont pas dans le bon environnement.

**Solution** :
Vérifiez que les noms commencent par `VITE_` et que l'environnement Production est bien sélectionné.

## 📋 Checklist de Vérification Complète

Avant de contacter le support, vérifiez que :

- [ ] Les 3 variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`) existent dans Vercel Settings
- [ ] Chaque variable a l'environnement **Production** coché
- [ ] Les noms commencent bien par `VITE_` (pas juste `SUPABASE_`)
- [ ] Vous avez redéployé SANS cache ("Use existing Build Cache" décoché)
- [ ] Les build logs montrent les variables avec le préfixe `🔧 Vite Build Configuration`
- [ ] La console du navigateur en production montre `🔍 Supabase Client Initialization`
- [ ] Vous ne voyez PAS l'erreur "Missing Supabase environment variables"

## 🚀 Commandes Utiles

### Tester localement que tout fonctionne :
```bash
npm run build
npm run preview
# Ouvrez http://localhost:4173 et testez
```

### Vérifier les variables localement :
```bash
cat .env
# Devrait afficher vos variables VITE_*
```

### Forcer un redéploiement via CLI :
```bash
# Installer Vercel CLI si pas déjà fait
npm i -g vercel

# Se connecter
vercel login

# Forcer un redéploiement
vercel --prod --force
```

## 📞 Besoin d'Aide ?

Si après avoir suivi toutes ces étapes le problème persiste :

1. Prenez une capture d'écran de :
   - Vercel Settings → Environment Variables (page complète)
   - Build Logs (section avec `🔧 Vite Build Configuration`)
   - Console navigateur (erreurs complètes)

2. Vérifiez que vous n'avez pas un fichier `.vercelignore` qui ignore `.env`

3. Vérifiez que votre `package.json` a bien :
```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

## 🎯 Résumé Rapide

**Le problème** : Vite n'a pas accès aux variables d'environnement pendant le build Vercel.

**La solution** :
1. Ajouter les variables dans Vercel Settings avec le préfixe `VITE_`
2. Cocher l'environnement Production
3. Redéployer SANS cache

**La vérification** : Les build logs doivent montrer les variables avec `🔧 Vite Build Configuration`

---

**Note** : Ce problème est spécifique à Vite. Les variables doivent être préfixées avec `VITE_` pour être injectées au build. C'est différent de Next.js qui utilise `NEXT_PUBLIC_` ou d'autres frameworks.
