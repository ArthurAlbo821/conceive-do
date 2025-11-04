# Configuration Supabase Authentication pour Production

## 🎯 Problème : 401 Unauthorized lors de la création de compte

Si vous voyez cette erreur en production :
```
POST https://[project].supabase.co/auth/v1/signup
401 (Unauthorized)
```

C'est que **Supabase bloque les requêtes provenant de votre domaine Vercel** car il n'est pas autorisé.

---

## ✅ Solution : Configurer les URLs Autorisées

### Étape 1: Accéder aux Paramètres d'Authentification

1. Allez sur [Supabase Dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet : **mxzvvgpqxugirbwtmxys**
3. Dans le menu de gauche, cliquez sur **Authentication**
4. Cliquez sur **URL Configuration**

### Étape 2: Configurer "Site URL"

**Site URL** : L'URL principale de votre application

1. Trouvez le champ **Site URL**
2. Remplacez la valeur par votre URL Vercel :
```
https://your-app.vercel.app
```

**Exemple** : Si votre déploiement Vercel est `https://conceive-do.vercel.app`, utilisez exactement cette URL.

**Important** :
- ✅ Utilisez `https://` (pas `http://`)
- ✅ N'ajoutez PAS de slash à la fin
- ✅ Utilisez votre URL de production principale (pas les URLs de preview)

### Étape 3: Configurer "Redirect URLs"

**Redirect URLs** : Les URLs vers lesquelles Supabase peut rediriger après authentification

1. Trouvez le champ **Redirect URLs**
2. Ajoutez chacune de ces URLs (une par ligne) :

```
https://your-app.vercel.app/dashboard
https://your-app.vercel.app/auth
https://your-app.vercel.app/
https://your-app.vercel.app/**
```

**Remplacez** `your-app.vercel.app` par votre vrai domaine Vercel.

**Explications** :
- `/dashboard` : Redirection après connexion réussie
- `/auth` : Page d'authentification
- `/` : Page d'accueil
- `/**` : Wildcard pour autoriser toutes les routes

**Si vous avez un domaine personnalisé** :
Ajoutez aussi les URLs de votre domaine custom :
```
https://yourdomain.com/dashboard
https://yourdomain.com/auth
https://yourdomain.com/
https://yourdomain.com/**
```

### Étape 4: Configurer pour Localhost (Développement)

Pour que le développement local continue à fonctionner, ajoutez aussi :

**Dans Site URL** (si vous testez localement) :
```
http://localhost:8080
```

**Dans Redirect URLs** :
```
http://localhost:8080/dashboard
http://localhost:8080/auth
http://localhost:8080/
http://localhost:8080/**
```

### Étape 5: Sauvegarder

1. Cliquez sur **Save** en bas de la page
2. Attendez la confirmation "Settings updated successfully"

---

## ⚙️ Vérifier les Autres Paramètres d'Authentification

### Providers d'Authentification

1. Toujours dans **Authentication**
2. Cliquez sur **Providers**
3. Vérifiez que **Email** est activé :
   - ✅ Email provider enabled : **ON**
   - ✅ Confirm email : **OFF** (ou ON si vous voulez la confirmation par email)

### Configuration Email (Optionnel mais Recommandé)

Si vous voulez que les utilisateurs confirment leur email :

1. **Authentication** → **Email Templates**
2. Vérifiez que le template "Confirm signup" est configuré
3. **Important** : Si "Confirm email" est ON, les utilisateurs devront cliquer sur un lien de confirmation avant de se connecter

**Recommandation pour commencer** : Désactivez "Confirm email" pour simplifier les tests

### Rate Limiting (Important pour la Production)

1. **Authentication** → **Rate Limits**
2. Vérifiez les limites par défaut :
   - Signups : 5 per hour (par IP)
   - Logins : 30 per hour (par IP)
3. Ajustez si nécessaire selon vos besoins

---

## 🧪 Tester la Configuration

### Test 1: Vérifier l'URL dans le Dashboard

Dans l'onglet **URL Configuration**, vous devriez voir :

```
Site URL:
https://your-app.vercel.app

Redirect URLs:
https://your-app.vercel.app/dashboard
https://your-app.vercel.app/auth
https://your-app.vercel.app/
https://your-app.vercel.app/**
http://localhost:8080/dashboard
http://localhost:8080/auth
http://localhost:8080/
http://localhost:8080/**
```

### Test 2: Tester la Création de Compte

1. Ouvrez votre site Vercel en production
2. Essayez de créer un compte avec un nouvel email
3. Ouvrez la console (F12) et vérifiez :
   - ✅ Pas d'erreur 401
   - ✅ La requête POST à `/auth/v1/signup` retourne 200 (succès)
   - ✅ Vous êtes redirigé vers le dashboard

### Test 3: Vérifier dans Supabase

1. **Authentication** → **Users**
2. Vous devriez voir le nouvel utilisateur créé
3. Vérifiez son statut :
   - Si "Confirm email" est OFF : statut = **Confirmed**
   - Si "Confirm email" est ON : statut = **Waiting for confirmation**

---

## 🔍 Diagnostic des Problèmes

### Problème 1: Toujours erreur 401 après configuration

**Causes possibles** :
1. L'URL entrée ne correspond pas exactement à celle de Vercel
2. Vous avez oublié `https://`
3. Il y a un slash à la fin de l'URL
4. Les changements ne sont pas encore pris en compte (cache)

**Solutions** :
1. Vérifiez l'orthographe exacte de votre URL Vercel
2. Attendez 1-2 minutes que les changements se propagent
3. Videz le cache du navigateur (Ctrl+Shift+R ou Cmd+Shift+R)
4. Testez en navigation privée

### Problème 2: "Email rate limit exceeded"

**Cause** : Trop de tentatives de création de compte

**Solution** :
1. Attendez 1 heure
2. Ou augmentez la limite dans **Rate Limits**
3. Ou testez avec une IP différente (utilisez votre téléphone en 4G)

### Problème 3: "Email not confirmed"

**Cause** : "Confirm email" est activé mais l'utilisateur n'a pas cliqué sur le lien

**Solutions** :
1. Désactivez "Confirm email" pour les tests
2. Ou vérifiez la boîte email de l'utilisateur (spam inclus)
3. Ou confirmez manuellement dans **Authentication** → **Users** → cliquez sur l'utilisateur → **Confirm user**

### Problème 4: Redirect vers mauvaise URL

**Cause** : L'URL de redirection n'est pas autorisée

**Solution** :
Vérifiez que toutes vos routes sont dans "Redirect URLs" avec le wildcard `/**`

---

## 📋 Checklist de Configuration Complète

### Configuration URLs
- [ ] Site URL configuré avec votre domaine Vercel (https://...)
- [ ] Redirect URLs incluent `/dashboard`
- [ ] Redirect URLs incluent `/auth`
- [ ] Redirect URLs incluent `/`
- [ ] Redirect URLs incluent `/**` (wildcard)
- [ ] Localhost ajouté pour le développement
- [ ] Changements sauvegardés

### Configuration Auth
- [ ] Email provider activé
- [ ] "Confirm email" configuré selon vos besoins
- [ ] Email templates vérifiés (si confirmation activée)
- [ ] Rate limits vérifiés et adaptés

### Tests
- [ ] Création de compte fonctionne en production
- [ ] Pas d'erreur 401 dans la console
- [ ] Utilisateur apparaît dans Authentication → Users
- [ ] Redirection vers dashboard fonctionne
- [ ] Login fonctionne aussi

---

## 🎯 URLs Vercel à Connaître

### URL de Production Principale
```
https://[votre-projet].vercel.app
```
C'est celle à configurer dans "Site URL"

### URLs de Preview (branches)
```
https://[votre-projet]-[branch]-[team].vercel.app
```
Optionnel : Ajoutez-les si vous voulez tester sur les deployments de preview

### Domaine Personnalisé
Si vous avez configuré un domaine custom dans Vercel :
```
https://yourdomain.com
```
Ajoutez-le AUSSI dans Site URL et Redirect URLs

---

## 📞 Commandes Utiles

### Obtenir l'URL Vercel actuelle
```bash
# Via Vercel CLI
vercel ls

# Ou regardez dans Vercel Dashboard
```

### Tester une URL de signup
```bash
# Testez si Supabase accepte les requêtes depuis votre domaine
curl -X POST https://mxzvvgpqxugirbwtmxys.supabase.co/auth/v1/signup \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Origin: https://your-app.vercel.app" \
  -d '{"email":"test@example.com","password":"password123"}'

# Si ça retourne 401 → URL pas autorisée
# Si ça retourne 200 ou 422 → URL autorisée (422 = email déjà existant, c'est normal)
```

### Vérifier la configuration actuelle
```sql
-- Dans Supabase SQL Editor
SELECT * FROM auth.config;
```

---

## 🚀 Workflow Recommandé

### Pour le Développement
1. Site URL = `http://localhost:8080`
2. Confirm email = OFF (pour accélérer les tests)
3. Rate limits = généreuses

### Pour la Production
1. Site URL = URL Vercel de production
2. Confirm email = ON (recommandé pour la sécurité)
3. Rate limits = stricts mais réalistes
4. Ajoutez aussi votre domaine custom si vous en avez un

### Mise à Jour après un Changement de Domaine
Si vous changez de domaine (nouveau deployment Vercel, domaine custom, etc.) :
1. Ajoutez le nouveau domaine dans "Redirect URLs"
2. Attendez 1-2 minutes
3. Testez avec le nouveau domaine
4. Supprimez l'ancien domaine si vous ne l'utilisez plus

---

## 📖 Ressources Supabase

- [Documentation officielle Auth Config](https://supabase.com/docs/guides/auth/auth-helpers/auth-ui#configuration)
- [Guide des Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)

---

**Date de création** : 2025-11-04
**Dernière mise à jour** : 2025-11-04
