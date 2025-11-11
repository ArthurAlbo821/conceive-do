# Checklist Configuration Supabase pour Production

## 🎯 Objectif
S'assurer que Supabase est correctement configuré pour fonctionner avec votre application déployée sur Vercel.

---

## ✅ Checklist Étape par Étape

### 1. Authentication - URL Configuration ⚠️ CRITIQUE

Allez sur : [Supabase Dashboard → Authentication → URL Configuration](https://supabase.com/dashboard/project/mxzvvgpqxugirbwtmxys/auth/url-configuration)

#### Site URL
- [ ] **Site URL** est configurée
- [ ] Valeur = votre URL Vercel de production (ex: `https://your-app.vercel.app`)
- [ ] Format correct : `https://` sans trailing slash
- [ ] Si domaine custom : ajoutez-le aussi

**Exemple** :
```
https://conceive-do.vercel.app
```

#### Redirect URLs
- [ ] **Redirect URLs** configurées (une par ligne)
- [ ] Inclut `/dashboard`
- [ ] Inclut `/auth`
- [ ] Inclut `/` (racine)
- [ ] Inclut `/**` (wildcard)
- [ ] Format correct pour chaque URL

**Exemple** :
```
https://conceive-do.vercel.app/dashboard
https://conceive-do.vercel.app/auth
https://conceive-do.vercel.app/
https://conceive-do.vercel.app/**
http://localhost:8080/dashboard
http://localhost:8080/auth
http://localhost:8080/
http://localhost:8080/**
```

#### Localhost (pour le développement)
- [ ] URLs localhost ajoutées pour le dev local
- [ ] `http://localhost:8080` dans les Redirect URLs
- [ ] Routes principales ajoutées (`/dashboard`, `/auth`, `/`, `/**`)

---

### 2. Authentication - Providers

Allez sur : [Supabase Dashboard → Authentication → Providers](https://supabase.com/dashboard/project/mxzvvgpqxugirbwtmxys/auth/providers)

#### Email Provider
- [ ] **Email** provider est activé (toggle ON)
- [ ] "Confirm email" configuré selon vos besoins :
  - [ ] OFF = inscription immédiate (recommandé pour tests)
  - [ ] ON = l'utilisateur doit confirmer son email
- [ ] Si "Confirm email" est ON, email templates vérifiés

#### Autres Providers (Optionnel)
- [ ] Google, GitHub, etc. selon vos besoins
- [ ] Credentials configurées pour chaque provider activé

---

### 3. Authentication - Email Templates (si Confirm Email = ON)

Allez sur : [Supabase Dashboard → Authentication → Email Templates](https://supabase.com/dashboard/project/mxzvvgpqxugirbwtmxys/auth/email-templates)

- [ ] Template "Confirm signup" vérifié
- [ ] Variables correctes dans le template (`{{ .ConfirmationURL }}`)
- [ ] "Confirmation URL" pointe vers votre domaine production
- [ ] Template "Reset password" configuré (si applicable)

---

### 4. Authentication - Rate Limits

Allez sur : [Supabase Dashboard → Authentication → Rate Limits](https://supabase.com/dashboard/project/mxzvvgpqxugirbwtmxys/auth/rate-limits)

- [ ] Limites vérifiées et adaptées :
  - [ ] Signups : ____ per hour (défaut: 5)
  - [ ] Logins : ____ per hour (défaut: 30)
  - [ ] Password resets : ____ per hour (défaut: 5)
- [ ] Limites pas trop restrictives pour vos tests
- [ ] Limites suffisamment strictes pour la production

**Recommandation** :
- Tests : Augmenter temporairement
- Production : Garder les valeurs par défaut ou adapter à vos besoins

---

### 5. API Keys & Secrets

Allez sur : [Supabase Dashboard → Settings → API](https://supabase.com/dashboard/project/mxzvvgpqxugirbwtmxys/settings/api)

#### Frontend (Variables Vercel)
- [ ] `anon` / `public` key copiée
- [ ] Ajoutée dans Vercel comme `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Project URL copié
- [ ] Ajouté dans Vercel comme `VITE_SUPABASE_URL`

#### Backend (Secrets Supabase Edge Functions)
- [ ] `service_role` key copiée (⚠️ JAMAIS dans le frontend!)
- [ ] Ajoutée via `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`
- [ ] `anon` key aussi ajoutée via `supabase secrets set SUPABASE_ANON_KEY=...`

---

### 6. Edge Functions Secrets

Vérifier via CLI : `supabase secrets list`

#### Secrets Obligatoires
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_ANON_KEY`

#### Secrets API Externes (selon vos fonctionnalités)
- [ ] `EVOLUTION_API_KEY` (si WhatsApp)
- [ ] `EVOLUTION_API_BASE_URL` (si WhatsApp)
- [ ] `EVOLUTION_API_GLOBAL_KEY` (si WhatsApp)
- [ ] `OPENAI_API_KEY` (si IA)
- [ ] `WEBHOOK_SECRET` (pour webhooks)
- [ ] `DUCKLING_API_URL` (optionnel)

#### Vérification
- [ ] `supabase secrets list` montre tous les secrets nécessaires
- [ ] Aucun secret sensible dans le code source
- [ ] `.env` dans `.gitignore`

---

### 7. Database & Migrations

#### Migrations
- [ ] Toutes les migrations locales appliquées
- [ ] `supabase db push` exécuté avec succès
- [ ] Schéma de base de données cohérent entre local et production

#### Tables Principales
- [ ] Table `profiles` existe
- [ ] Table `appointments` existe
- [ ] Table `evolution_instances` existe
- [ ] Table `messages` existe
- [ ] Trigger `on_auth_user_created` existe

#### Row Level Security (RLS)
- [ ] RLS activé sur toutes les tables sensibles
- [ ] Policies testées et fonctionnelles
- [ ] Pas de bypass RLS non intentionnel

---

### 8. Edge Functions Deployment

#### Vérification CLI
- [ ] Projet lié : `supabase link --project-ref mxzvvgpqxugirbwtmxys`
- [ ] `supabase functions list` montre les fonctions déployées

#### Fonctions Critiques
- [ ] `create-evolution-instance` déployée
- [ ] `evolution-webhook-handler` déployée
- [ ] `ai-auto-reply` déployée (si IA)
- [ ] `send-whatsapp-message` déployée (si WhatsApp)

#### Test des Fonctions
- [ ] Chaque fonction testable via curl ou dashboard
- [ ] Logs accessibles : `supabase functions logs <function-name>`
- [ ] Pas d'erreurs critiques dans les logs

---

### 9. Storage (si utilisé)

Allez sur : [Supabase Dashboard → Storage](https://supabase.com/dashboard/project/mxzvvgpqxugirbwtmxys/storage/buckets)

- [ ] Buckets créés selon vos besoins
- [ ] Policies configurées (public/privé)
- [ ] CORS configuré si accès depuis frontend
- [ ] Quotas vérifiés

---

### 10. Monitoring & Logs

#### API Logs
- [ ] Supabase Dashboard → Logs → API explorés
- [ ] Pas d'erreurs 401 ou 403 en masse
- [ ] Pattern d'erreurs identifié si présent

#### Auth Logs
- [ ] Dashboard → Logs → Auth explorés
- [ ] Signups/Logins fonctionnels
- [ ] Pas de rate limiting abusif

#### Function Logs
- [ ] Dashboard → Edge Functions → Logs vérifiés
- [ ] Chaque fonction critique testée
- [ ] Erreurs corrigées

---

## 🧪 Tests de Validation

### Test 1: Création de Compte
```bash
# Depuis votre site en production
1. Ouvrir https://your-app.vercel.app/auth
2. Créer un compte avec un nouvel email
3. Vérifier : pas d'erreur 401
4. Vérifier : redirection vers /dashboard réussie
5. Vérifier : user apparaît dans Supabase → Authentication → Users
```

### Test 2: Connexion
```bash
1. Se déconnecter
2. Se reconnecter avec les mêmes identifiants
3. Vérifier : login réussi
4. Vérifier : session persistée (refresh page = toujours connecté)
```

### Test 3: API Requests
```bash
# Tester depuis la console browser (F12)
fetch('https://mxzvvgpqxugirbwtmxys.supabase.co/rest/v1/profiles', {
  headers: {
    'apikey': 'YOUR_ANON_KEY',
    'Authorization': 'Bearer YOUR_ANON_KEY'
  }
}).then(r => r.json()).then(console.log)

# Devrait retourner les profils (ou 200 avec array vide)
```

### Test 4: Edge Function
```bash
# Tester une fonction simple
curl -X POST https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/check-instance-status \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"

# Devrait retourner 200 (ou erreur structurée si secrets manquants)
```

---

## 🔧 Script de Vérification Automatique

Exécutez le script de vérification :
```bash
./scripts/verify-supabase-config.sh
```

Ce script vérifie automatiquement :
- ✅ Variables d'environnement
- ✅ Connectivité Supabase
- ✅ Auth endpoint
- ✅ Secrets configurés
- ✅ Projet lié

---

## ❌ Problèmes Fréquents

### ❌ Erreur 401 lors du signup
**Cause** : URL pas autorisée dans Redirect URLs
**Solution** : Vérifier section 1 de cette checklist

### ❌ "Rate limit exceeded"
**Cause** : Trop de tentatives
**Solution** : Attendre ou augmenter les limites (section 4)

### ❌ "Email not confirmed"
**Cause** : "Confirm email" est ON
**Solution** : Désactiver pour tests ou vérifier l'email

### ❌ Edge Function errors
**Cause** : Secrets manquants
**Solution** : Vérifier section 6 de cette checklist

---

## 📚 Documentation Complémentaire

- [SUPABASE_AUTH_CONFIG.md](./SUPABASE_AUTH_CONFIG.md) - Configuration détaillée Auth
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Guide de dépannage complet
- [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) - Configuration Vercel

---

## 📊 Statut de Votre Configuration

Date de dernière vérification : ___________

- [ ] Toutes les sections de cette checklist complétées
- [ ] Tous les tests de validation passés
- [ ] Script de vérification exécuté avec succès
- [ ] Application fonctionnelle en production

**Signature** : ___________

---

**Version** : 1.0
**Dernière mise à jour** : 2025-11-04
