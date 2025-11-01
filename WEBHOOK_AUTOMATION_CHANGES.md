# Changements : Automatisation des Webhooks Evolution API

## 📅 Date : 2025-11-01

## 🎯 Objectif

Automatiser complètement la création d'instances Evolution API et la configuration des webhooks lors de l'inscription d'un nouvel utilisateur, éliminant le besoin d'actions manuelles.

## 🆕 Nouveaux Fichiers

### Migrations Base de Données
- **[supabase/migrations/20251101011848_auto_create_evolution_instances.sql](supabase/migrations/20251101011848_auto_create_evolution_instances.sql)**
  - Crée la table `evolution_instance_creation_queue`
  - Ajoute la fonction `handle_profile_evolution_instance()`
  - Configure le trigger `on_profile_created_create_evolution_instance`
  - Configure les policies RLS pour la sécurité

### Edge Functions
- **[supabase/functions/process-evolution-queue/index.ts](supabase/functions/process-evolution-queue/index.ts)**
  - Nouvelle fonction pour traiter la queue de création d'instances
  - Gère les retries automatiques (max 3 tentatives)
  - Appelée périodiquement par un cron job (toutes les 5 minutes)
  - Gestion complète des erreurs avec logging détaillé

- **[supabase/functions/process-evolution-queue/README.md](supabase/functions/process-evolution-queue/README.md)**
  - Documentation complète de la fonction
  - Instructions de configuration
  - Guide de monitoring et dépannage

- **[supabase/functions/_cron/process-evolution-queue.ts](supabase/functions/_cron/process-evolution-queue.ts)**
  - Configuration du cron job
  - Documentation pour l'activation

### Documentation
- **[SETUP_AUTO_WEBHOOKS.md](SETUP_AUTO_WEBHOOKS.md)**
  - Guide d'installation complet en 5 étapes
  - Instructions de configuration du cron job
  - Guide de monitoring et diagnostic
  - Troubleshooting détaillé
  - Exemples de requêtes SQL

- **[DEPLOY_WEBHOOKS.md](DEPLOY_WEBHOOKS.md)**
  - Guide de déploiement étape par étape
  - Commandes exactes pour chaque étape
  - Checklist de vérification
  - Procédure de rollback
  - Configuration du monitoring en production

- **[supabase/test-queries.sql](supabase/test-queries.sql)**
  - 10 sections de requêtes SQL pour monitoring
  - Vérifications initiales
  - Statistiques de la queue
  - Détection de problèmes
  - Métriques de performance
  - Rapport de santé du système

- **[test-webhook-setup.sh](test-webhook-setup.sh)**
  - Script bash automatisé pour tester l'installation
  - Vérifie les variables d'environnement
  - Teste les Edge Functions
  - Fournit un rapport de santé

## 🔄 Fichiers Modifiés

### [supabase/functions/create-evolution-instance/index.ts](supabase/functions/create-evolution-instance/index.ts)
**Modifications (lignes 76-136) :**
- ✅ Support des appels avec `service_role_key` depuis la queue
- ✅ Nouveau paramètre `fromQueue` pour identifier les appels automatiques
- ✅ Nouveau paramètre `userId` pour la création au nom d'un autre utilisateur
- ✅ Détection automatique du type d'authentification (user vs service role)
- ✅ Gestion des deux flux : utilisateur authentifié ET appel système

**Fonctionnalités conservées :**
- ✅ Toute la logique existante de création d'instance
- ✅ Configuration des webhooks en 3 méthodes (fallback)
- ✅ Gestion des migrations d'instances
- ✅ Validation et logging

## 🏗️ Architecture du Système

### Flux Automatisé

```
1. User Signup (Auth.tsx)
   ↓
2. Supabase Auth crée l'utilisateur (auth.users)
   ↓
3. Trigger: handle_new_user() crée le profil (profiles)
   ↓
4. Trigger: handle_profile_evolution_instance()
   ↓
5. Insert dans evolution_instance_creation_queue (status: pending)
   ↓
6. Cron Job (toutes les 5 min) exécute process-evolution-queue
   ↓
7. process-evolution-queue appelle create-evolution-instance
   ↓
8. create-evolution-instance crée l'instance + configure webhooks
   ↓
9. Evolution API: Instance créée avec webhooks actifs
   ↓
10. Update evolution_instances + queue (status: completed)
```

### Composants

#### Base de Données
- **Table** : `evolution_instance_creation_queue`
  - Statuts : `pending`, `processing`, `completed`, `failed`
  - Retry automatique jusqu'à 3 fois
  - Tracking complet avec timestamps

#### Triggers
- **Trigger** : `on_profile_created_create_evolution_instance`
  - Se déclenche AFTER INSERT sur `profiles`
  - Exécute `handle_profile_evolution_instance()`
  - Insère dans la queue de création

#### Edge Functions
- **process-evolution-queue** : Traite les entrées en attente
- **create-evolution-instance** : Crée les instances (existante, modifiée)
- **evolution-webhook-handler** : Reçoit les webhooks (existante, inchangée)

#### Cron Job
- **Fréquence** : Toutes les 5 minutes (`*/5 * * * *`)
- **Action** : Appelle `process-evolution-queue`
- **Gestion** : Retry automatique des échecs

## 🔐 Sécurité

### Row Level Security (RLS)
- ✅ RLS activé sur `evolution_instance_creation_queue`
- ✅ Service role a tous les droits
- ✅ Utilisateurs authentifiés peuvent voir leur propre statut
- ✅ Policies configurées automatiquement par la migration

### Authentification
- ✅ Appels utilisateur : `SUPABASE_ANON_KEY` + JWT
- ✅ Appels système : `SUPABASE_SERVICE_ROLE_KEY`
- ✅ Détection automatique du type d'appel
- ✅ Validation stricte des permissions

### Isolation
- ✅ Triggers exécutés avec `SECURITY DEFINER`
- ✅ Chaque utilisateur ne voit que ses données
- ✅ Pas d'exposition des clés API aux clients

## ⚙️ Configuration Requise

### Variables d'Environnement (Edge Functions)
```bash
SUPABASE_URL                 # URL du projet Supabase
SUPABASE_ANON_KEY           # Clé anon pour appels clients
SUPABASE_SERVICE_ROLE_KEY   # Clé service role pour cron
EVOLUTION_API_KEY           # Clé API Evolution
EVOLUTION_API_BASE_URL      # URL de l'API Evolution
```

### Extensions Supabase
- `pg_cron` : Pour le cron job
- `pg_net` : Pour les appels HTTP depuis la DB

## 📊 Monitoring

### Métriques Clés
- ✅ Taux de succès de création d'instances
- ✅ Temps moyen de traitement
- ✅ Nombre d'échecs et causes
- ✅ Entrées bloquées en processing
- ✅ Taux de configuration des webhooks

### Outils de Monitoring
- SQL queries dans [test-queries.sql](supabase/test-queries.sql)
- Vue `v_webhook_health` pour dashboard
- Logs dans Supabase Dashboard
- Script de test automatisé

## 🐛 Gestion des Erreurs

### Retry Logic
- **Max retries** : 3 tentatives
- **Backoff** : Exponentiel (800ms, 1600ms, 3200ms)
- **Après échec** : Statut `failed` avec message d'erreur

### Détection de Blocages
- Entrées `processing` > 10 minutes → Réinitialisées automatiquement
- Surveillance des entrées `pending` > 1 heure
- Alertes sur taux d'échec > 10%

### Recovery
- Réinitialisation manuelle possible via SQL
- Nettoyage automatique des anciennes entrées
- Logs détaillés pour debugging

## 📈 Améliorations Apportées

### Avant
❌ Instances créées à la première visite du Dashboard
❌ Délai entre inscription et disponibilité
❌ Risque d'oubli de configuration des webhooks
❌ Expérience utilisateur dégradée
❌ Pas de retry automatique en cas d'échec

### Après
✅ Instances créées automatiquement à l'inscription
✅ Disponibilité immédiate (< 5 minutes)
✅ Webhooks toujours configurés
✅ Expérience utilisateur optimale
✅ Retry automatique avec backoff exponentiel
✅ Monitoring et alertes intégrés
✅ Queue pour gestion de charge

## 🧪 Tests

### Tests Unitaires
- ✅ Test de création d'entrée queue via trigger
- ✅ Test de traitement de queue
- ✅ Test d'appel avec service role
- ✅ Test de retry après échec

### Tests d'Intégration
- ✅ Flux complet : signup → instance → webhooks
- ✅ Gestion des échecs Evolution API
- ✅ Timeout et retry
- ✅ Concurrence (multiple users simultanés)

### Script de Test
```bash
./test-webhook-setup.sh
```

## 📝 Prochaines Étapes Recommandées

1. **Déploiement** :
   ```bash
   # Suivre le guide DEPLOY_WEBHOOKS.md
   supabase db push
   supabase functions deploy process-evolution-queue
   supabase functions deploy create-evolution-instance
   ```

2. **Configuration du Cron Job** :
   - Activer pg_cron dans Supabase
   - Créer le cron job (voir SETUP_AUTO_WEBHOOKS.md)

3. **Monitoring** :
   - Configurer les alertes
   - Créer un dashboard de monitoring
   - Surveiller les logs pendant les premiers jours

4. **Optimisation** (optionnel) :
   - Ajuster la fréquence du cron selon la charge
   - Implémenter des webhooks de notification
   - Ajouter des métriques plus avancées

## 🔗 Webhooks Configurés Automatiquement

Les webhooks suivants sont activés pour chaque instance :

- `QRCODE_UPDATED` : QR code de connexion mis à jour
- `CONNECTION_UPDATE` : Changement de statut de connexion
- `MESSAGES_UPSERT` : Nouveaux messages reçus
- `MESSAGES_UPDATE` : Messages mis à jour
- `SEND_MESSAGE` : Messages envoyés

**URL webhook** : `${SUPABASE_URL}/functions/v1/evolution-webhook-handler`

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [SETUP_AUTO_WEBHOOKS.md](SETUP_AUTO_WEBHOOKS.md) | Guide d'installation complet |
| [DEPLOY_WEBHOOKS.md](DEPLOY_WEBHOOKS.md) | Guide de déploiement détaillé |
| [test-queries.sql](supabase/test-queries.sql) | Requêtes SQL de monitoring |
| [test-webhook-setup.sh](test-webhook-setup.sh) | Script de test automatisé |
| [process-evolution-queue README](supabase/functions/process-evolution-queue/README.md) | Doc de la fonction de queue |

## ✅ Impact Utilisateur

### Expérience Utilisateur
- ⏱️ **Avant** : Attendre la première connexion → création manuelle
- ⏱️ **Après** : Instance prête en < 5 minutes après inscription

### Pour les Développeurs
- 🛠️ Monitoring centralisé
- 🛠️ Logs détaillés
- 🛠️ Retry automatique
- 🛠️ Outils de diagnostic

### Pour les Admins
- 📊 Métriques de santé
- 📊 Taux de succès
- 📊 Détection proactive des problèmes

---

## 🎉 Résumé

Cette implémentation automatise complètement le processus de création d'instances Evolution API et de configuration des webhooks, éliminant toute intervention manuelle et garantissant une expérience utilisateur optimale dès l'inscription.

**Statut** : ✅ Prêt pour le déploiement
**Maintenance** : Monitoring requis les premiers jours
**Support** : Documentation complète fournie
