# Instructions CodeRabbit - Conceive-Do

## 🎯 Objectif de cette Analyse

Analyse complète de **14,000 lignes de code** avant déploiement en production sur Vercel.

**Focus prioritaire** : Sécurité | Bugs Critiques | Performance

---

## 🔴 Points Critiques à Analyser en Priorité

### 1. Edge Functions Supabase (17 fonctions)

**Chemin**: `supabase/functions/`

#### Sécurité Obligatoire
- ✅ Validation stricte de tous les inputs utilisateur
- ✅ Protection contre injection SQL, XSS, SSRF
- ✅ Secrets et clés API jamais en dur dans le code
- ✅ Variables d'environnement utilisées correctement (`Deno.env.get()`)
- ✅ Rate limiting implémenté (protection DoS)
- ✅ CORS configuré de manière restrictive
- ✅ Headers de sécurité appropriés

#### JWT Authentication
- ✅ Vérifier cohérence avec `config.toml` (JWT enabled/disabled)
- ✅ Validation des tokens JWT quand nécessaire
- ✅ Pas de bypass possible de l'auth

#### Error Handling
- ✅ Try-catch sur toutes les opérations critiques
- ✅ Pas de leak d'informations sensibles dans les erreurs
- ✅ Codes HTTP appropriés (200, 400, 401, 403, 500)
- ✅ Logging sans données sensibles

#### Performance
- ✅ Timeouts configurés pour éviter les blocages
- ✅ Gestion mémoire pour les gros payloads
- ✅ Optimisation des requêtes base de données
- ✅ Pas de boucles infinies ou récursions non contrôlées

---

### 2. Webhooks (4 fonctions critiques)

**Fonctions concernées**:
- `evolution-webhook-handler` - Handler principal
- `diagnose-webhook` - Diagnostics
- `set-webhook` - Configuration
- `test-webhook` - Tests

#### Sécurité Webhook
- ✅ **Validation HMAC/Signature** : Vérifier que `_shared/webhook-security.ts` est utilisé
- ✅ **Idempotence** : Protection contre replay attacks
- ✅ **Rate Limiting** : Strict pour éviter flooding
- ✅ **Timeout Handling** : Pas de blocage indéfini
- ✅ **Payload Size Limits** : Limite de taille configurée
- ✅ **SSRF Prevention** : Validation des URLs webhook (pas de localhost, IPs internes)
- ✅ **HTTPS Enforcement** : Webhooks HTTPS uniquement

#### Error Handling Webhook
- ✅ Pas de révélation de l'architecture interne
- ✅ Logging approprié (debug sans exposer secrets)
- ✅ Retry logic si applicable

---

### 3. AI Auto-Reply

**Fonction**: `supabase/functions/ai-auto-reply/`

⚠️ **ATTENTION MAXIMALE** - Interaction avec API IA externe

#### Prompt Injection Prevention
- ✅ Sanitization stricte des inputs utilisateur
- ✅ Pas d'exécution de commandes dans les prompts
- ✅ Limitation de longueur des prompts
- ✅ Validation du contexte avant envoi à l'IA

#### Données Sensibles & RGPD
- ✅ Pas de PII (Personally Identifiable Information) dans les prompts
- ✅ Masquage des données confidentielles (numéros, emails, etc.)
- ✅ Conformité RGPD (droit à l'oubli, minimisation données)
- ✅ Pas de stockage inutile de données personnelles

#### Rate Limiting & Coûts
- ✅ Protection contre abus API IA (coûts élevés possibles)
- ✅ Quotas par utilisateur/instance
- ✅ Circuit breaker si budget dépassé

#### Reliability
- ✅ Fallback si API IA indisponible
- ✅ Timeout approprié (pas de blocage)
- ✅ Gestion des erreurs API gracieuse
- ✅ Pas de leak de la logique IA dans les erreurs

---

### 4. Authentication & Gestion de Compte

**Fonctions & Pages concernées**:
- `supabase/functions/delete-account/`
- `supabase/functions/send-access-info/`
- `src/pages/Auth.tsx`
- `src/pages/ForgotPassword.tsx`
- `src/pages/ResetPassword.tsx`

#### Sécurité Authentification
- ✅ Pas de credentials en clair (ni code, ni logs, ni DB non chiffrée)
- ✅ Hashing sécurisé des mots de passe (bcrypt, argon2)
- ✅ HTTPS obligatoire (vérifier config Vite/Vercel)
- ✅ Protection CSRF
- ✅ Input validation (email format, password strength)
- ✅ Rate limiting (login attempts, password reset)

#### Password Reset Flow
- ✅ Token unique et expiré après utilisation
- ✅ Expiration temporelle du token (15-60 min)
- ✅ Pas d'énumération utilisateurs (même message si email existe ou non)
- ✅ Token généré côté serveur, jamais côté client

#### Suppression de Compte
- ✅ Auth JWT obligatoire
- ✅ Confirmation utilisateur (double opt-in)
- ✅ Soft delete vs hard delete documenté
- ✅ Cascade deletion des données personnelles
- ✅ Audit log de la suppression
- ✅ RGPD compliant (droit à l'oubli)

#### Envoi Informations d'Accès
- ✅ Pas de credentials en clair par email/SMS
- ✅ Tokens temporaires avec expiration
- ✅ Canal de communication sécurisé
- ✅ Rate limiting (prévention brute force)

---

### 5. Gestion des Données Sensibles

**Éléments à vérifier dans tout le code**:

#### Supabase Client Configuration
**Fichier**: `src/integrations/supabase/client.ts`

- ✅ `anon key` exposée uniquement si nécessaire (RLS actif)
- ✅ **JAMAIS** de `service_role` key côté client
- ✅ RLS (Row Level Security) enforcement
- ✅ Auth persistence sécurisée
- ✅ Error handling sans leak d'info

#### Messages & Conversations
**Fichiers**:
- `src/pages/Messages.tsx`
- `src/components/messages/`
- `supabase/functions/send-whatsapp-message/`

- ✅ Chiffrement end-to-end si applicable
- ✅ Pas de logging des messages en clair
- ✅ XSS prevention dans le rendu des messages
- ✅ Sanitization du contenu utilisateur
- ✅ Validation des pièces jointes (type, taille)
- ✅ Rate limiting sur envoi de messages

#### Variables d'Environnement
**Fichiers**: `.env*`, `vite.config.ts`

- ✅ Pas de secrets committés dans le repo
- ✅ `.env` dans `.gitignore`
- ✅ `.env.example` documente toutes les vars nécessaires
- ✅ Source maps désactivées en production
- ✅ Minification activée en production

---

## 📊 Catégories d'Analyse

### Frontend (src/)
- **Pages** (9 routes) - 2,000+ lignes
- **Components** (58 composants) - 5,000+ lignes
- **Hooks** (8 custom hooks) - 800+ lignes
- **Supabase Integration** - 500+ lignes

### Backend (supabase/)
- **Edge Functions** (17 fonctions) - 4,000+ lignes
- **Shared Utilities** - 800+ lignes
- **Configuration** - 200+ lignes

---

## ✅ Checklist de Sécurité pour Déploiement Vercel

### Build Configuration
- [ ] Variables d'environnement configurées dans Vercel Dashboard
- [ ] Pas de secrets dans le code source
- [ ] HTTPS enforced
- [ ] Source maps désactivées en production
- [ ] Error tracking configuré (Sentry, LogRocket, etc.)

### Supabase Configuration
- [ ] RLS activé sur toutes les tables sensibles
- [ ] Policies testées et validées
- [ ] Edge functions déployées et testées
- [ ] Webhooks configurés avec HTTPS
- [ ] Rate limiting actif

### Performance
- [ ] Code splitting optimisé (Vite)
- [ ] Images optimisées
- [ ] Caching headers appropriés
- [ ] CDN configuré (Vercel)

### Monitoring
- [ ] Logs centralisés
- [ ] Alertes configurées (erreurs critiques)
- [ ] Uptime monitoring
- [ ] Performance monitoring (Core Web Vitals)

---

## 🎨 Standards de Code Attendus

### TypeScript
- Typage strict (pas de `any` non justifié)
- Null safety (`strict: true` dans tsconfig)
- Types exportés pour réutilisation

### React
- Hooks rules respectées (ESLint)
- useEffect avec cleanup approprié (pas de memory leaks)
- Error boundaries pour robustesse
- Loading states gérés
- Optimistic updates sécurisés

### Async/Await
- Try-catch sur toutes les operations async
- Promise.all pour parallélisation quand possible
- Pas de Promise non awaited

### Code Quality
- Pas de code mort (dead code)
- Pas de console.log en production
- Pas de debugger statements
- Comments pour logique complexe uniquement

---

## 🔍 Niveaux de Priorité

CodeRabbit doit classer les findings par priorité :

### 🔴 Critique (Bloquant Déploiement)
- Failles de sécurité
- Bugs pouvant causer perte de données
- Credentials exposés
- SQL Injection possible
- XSS exploitable
- CSRF non protégé

### ⚠️ Important (À Corriger Rapidement)
- Performance degradation significative
- Memory leaks
- Race conditions
- Error handling manquant
- Rate limiting insuffisant

### 💡 Suggestion (Amélioration)
- Code smell
- Refactoring possible
- Optimisation potentielle
- Documentation manquante
- Tests unitaires suggérés

---

## 📋 Format de Rapport Attendu

Pour chaque finding, CodeRabbit devrait fournir :

1. **Catégorie** : 🔴 Critique | ⚠️ Important | 💡 Suggestion
2. **Fichier & Ligne** : Lien direct vers le code
3. **Description** : Problème identifié
4. **Risque** : Impact potentiel
5. **Solution** : Code suggestion si possible
6. **Ressources** : Liens vers documentation/best practices

---

## 🚀 Post-Analyse

Après l'analyse CodeRabbit complète :

1. **Rapport consolidé** : Tous les findings dans la PR
2. **Priorisation** : Liste des critiques à corriger d'abord
3. **Session de correction** : Travailler avec Claude pour corriger les points critiques
4. **Re-validation** : S'assurer que les corrections n'introduisent pas de nouveaux bugs
5. **Déploiement** : Vert pour production Vercel

---

## 📚 Références

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [React Security Best Practices](https://react.dev/learn/security)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [Vercel Security](https://vercel.com/docs/security)

---

**Dernière mise à jour** : 2025-11-03
**Analysé par** : CodeRabbit AI
**Configuré par** : Claude Code Agent
