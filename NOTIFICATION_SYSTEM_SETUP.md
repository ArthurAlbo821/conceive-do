# 🔔 Système de Notifications WhatsApp - Guide d'Installation

Ce document décrit la configuration requise pour activer le système de notifications WhatsApp pour les providers.

## 📋 Vue d'Ensemble

Le système envoie automatiquement 3 types de notifications au numéro WhatsApp personnel du provider :

1. **🤖 Nouveau RDV** - Quand l'IA book un rendez-vous automatiquement
2. **🚶 Client arrivé** - Quand le client indique son arrivée (détection automatique)
3. **✅ Infos d'accès envoyées** - Confirmation après l'envoi des infos d'accès au client

---

## 🚀 Étapes d'Installation

### 1. Appliquer la Migration de Base de Données

La migration crée automatiquement :
- Le champ `notification_phone` dans `user_informations`
- La table `appointment_notifications` pour l'historique
- Les triggers PostgreSQL pour les envois automatiques

```bash
# La migration sera appliquée automatiquement au prochain déploiement
# Fichier: supabase/migrations/20251103120000_add_notification_system.sql
```

### 2. Déployer les Edge Functions

Déployez les Edge Functions modifiées :

```bash
# Depuis le dossier racine du projet
supabase functions deploy send-provider-notification
supabase functions deploy ai-auto-reply
supabase functions deploy send-access-info
```

> 💡 **Note** : Les notifications sont déclenchées directement depuis les Edge Functions (pas via des triggers PostgreSQL), ce qui est plus fiable et plus facile à débugger.

---

## 👤 Configuration Utilisateur

### Pour le Provider

1. Connectez-vous à l'application
2. Allez dans **Mes Informations**
3. Trouvez la section **"Numéro de notification"** (carte bleue avec icône 🔔)
4. Entrez votre numéro WhatsApp personnel au **format international** : `+33612345678`
5. Cliquez sur **"Enregistrer"**

**Format requis :**
- ✅ Valide : `+33612345678`, `+14155551234`, `+447911123456`
- ❌ Invalide : `0612345678`, `+33 6 12 34 56 78`, `06-12-34-56-78`

> 💡 Si le champ est vide, aucune notification ne sera envoyée (fonctionnalité désactivée).

---

## 🔍 Vérification du Fonctionnement

### Test 1 : Nouveau RDV créé par l'IA

1. Assurez-vous que votre instance WhatsApp Business est connectée
2. Configurez votre `notification_phone` dans "Mes Informations"
3. Envoyez un message WhatsApp à votre bot et laissez l'IA créer un RDV
4. Vous devriez recevoir une notification sur votre numéro personnel avec les détails du RDV

**Format attendu :**
```
🤖 Nouveau RDV

👤 Client : Jean Dupont (+33612345678)
📅 Date : Lundi 3 novembre 2025
🕐 Heure : 14:00 - 15:30 (90min)
💰 Prix : 250€

📋 Services :
• Prestation 90min (200€)
• Extra 1 (30€)
• Extra 2 (20€)
```

### Test 2 : Client arrivé

1. Créez un RDV pour aujourd'hui (ou utilisez un existant)
2. Envoyez un message contenant "je suis là" ou "arrivé" depuis le numéro du client
3. L'IA détectera l'arrivée et vous devriez recevoir :

```
🚶 Client arrivé !

👤 Jean Dupont est arrivé pour le rendez-vous de 14:00.

📱 Rendez-vous dans l'app pour envoyer les infos d'accès.
```

### Test 3 : Infos d'accès envoyées

1. Cliquez sur le bouton "Prêt à Recevoir" dans l'app pour un RDV avec client arrivé
2. Vous devriez recevoir :

```
✅ Infos d'accès envoyées

Les informations d'accès ont été envoyées à Jean Dupont pour le RDV de 14:00.
```

---

## 🔧 Dépannage

### Les notifications ne sont pas envoyées

**Vérifications :**

1. **Le `notification_phone` est-il configuré ?**
   ```sql
   SELECT user_id, notification_phone FROM user_informations;
   ```

2. **L'instance WhatsApp Business est-elle connectée ?**
   ```sql
   SELECT instance_name, instance_status FROM evolution_instances;
   ```
   → Le status doit être `'connected'`

3. **Vérifier les logs des Edge Functions :**
   - Dashboard Supabase → Edge Functions → ai-auto-reply → Logs
   - Dashboard Supabase → Edge Functions → send-provider-notification → Logs
   - Cherchez les messages "[ai-auto-reply] Sending notification to provider"

4. **Vérifier les logs de la table `appointment_notifications` :**
   ```sql
   SELECT * FROM appointment_notifications ORDER BY created_at DESC LIMIT 10;
   ```
   → Cherchez les entrées avec `status = 'failed'` et regardez `error_details`

5. **Vérifier les logs ai_logs :**
   ```sql
   SELECT * FROM ai_logs
   WHERE event_type LIKE 'notification_%'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

### Erreur "WhatsApp instance is not connected"

- Vérifiez que l'instance WhatsApp Business du provider est bien connectée
- Reconnectez l'instance si nécessaire dans la page "Connexion WhatsApp"

### Erreur "Evolution API error"

- Vérifiez que `EVOLUTION_API_KEY` est configuré dans les variables d'environnement de Supabase
- Vérifiez que l'URL `EVOLUTION_API_BASE_URL` est correcte
- Vérifiez que l'instance Evolution API est en ligne

### Format de numéro invalide

- Le numéro doit être au format E.164 : `^\+[1-9]\d{1,14}$`
- Commence par `+` suivi du code pays (sans zéro)
- Exemple : `+33612345678` (France), pas `+330612345678`

---

## 📊 Monitoring

### Consulter l'historique des notifications

```sql
SELECT
  n.created_at,
  n.notification_type,
  n.status,
  a.contact_name,
  a.appointment_date,
  a.start_time
FROM appointment_notifications n
JOIN appointments a ON n.appointment_id = a.id
WHERE n.user_id = 'YOUR_USER_ID'
ORDER BY n.created_at DESC
LIMIT 20;
```

### Statistiques de notifications

```sql
SELECT
  notification_type,
  status,
  COUNT(*) as count
FROM appointment_notifications
GROUP BY notification_type, status
ORDER BY notification_type, status;
```

### Notifications échouées

```sql
SELECT
  n.*,
  a.contact_name,
  a.appointment_date
FROM appointment_notifications n
JOIN appointments a ON n.appointment_id = a.id
WHERE n.status = 'failed'
ORDER BY n.created_at DESC;
```

---

## 🛡️ Sécurité

- ✅ **Isolation multi-tenant** : Chaque provider reçoit uniquement SES notifications
- ✅ **Format strict** : Validation E.164 du numéro de téléphone
- ✅ **Prévention des doublons** : UNIQUE constraint sur (appointment_id, notification_type)
- ✅ **Logs exhaustifs** : Toutes les tentatives d'envoi sont loggées
- ✅ **Envoi depuis l'instance du provider** : Chaque provider utilise sa propre instance WhatsApp Business
- ✅ **RLS activé** : Row Level Security sur la table `appointment_notifications`

---

## 📝 Architecture Technique

### Flux de Notification

```
1. Événement dans une Edge Function
   - ai-auto-reply : Nouveau RDV créé OU client arrivé détecté
   - send-access-info : Infos d'accès envoyées
   ↓
2. Edge Function appelle send-provider-notification
   - Passe appointment_id et notification_type
   ↓
3. Edge Function send-provider-notification
   - Récupère les infos du RDV
   - Récupère le notification_phone
   - Vérifie que l'instance est connectée
   - Vérifie qu'aucune notification dupliquée n'existe
   - Formate le message selon le type
   ↓
4. Envoi via Evolution API
   - Depuis l'instance WhatsApp Business du provider
   - Vers le numéro personnel du provider
   ↓
5. Enregistrement dans appointment_notifications
   - Status 'sent' ou 'failed'
   - Message complet stocké
   - Error_details si échec
   ↓
6. Log dans ai_logs pour audit complet
```

### Fichiers Créés/Modifiés

**Nouveaux fichiers :**
- `supabase/migrations/20251103120000_add_notification_system.sql` - Schema + tables
- `supabase/migrations/20251103120002_simple_notification_approach.sql` - Suppression des triggers
- `supabase/functions/send-provider-notification/index.ts` - Edge Function de notification

**Fichiers modifiés :**
- `src/pages/Informations.tsx` - Ajout du champ notification_phone
- `src/hooks/useUserInformations.ts` - Support du nouveau champ
- `supabase/functions/ai-auto-reply/index.ts` - Appels de notification après création RDV et détection arrivée
- `supabase/functions/send-access-info/index.ts` - Appel de notification après envoi infos d'accès

---

## 🎯 Prochaines Améliorations Possibles

- [ ] Notifications de rappel 1h avant le RDV
- [ ] Notifications de rappel 30 min avant
- [ ] Notification si client en retard (15 min après l'heure)
- [ ] Résumé quotidien des RDV du jour (le matin)
- [ ] Templates de messages personnalisables par provider
- [ ] Historique consultable dans l'interface web
- [ ] Retry automatique en cas d'échec temporaire
- [ ] Notifications push web en complément

---

## 📞 Support

En cas de problème :
1. Consultez les logs dans `appointment_notifications` et `ai_logs`
2. Vérifiez les logs de l'Edge Function dans le dashboard Supabase
3. Vérifiez que tous les prérequis sont remplis (section Dépannage)

---

**Date de création** : 3 novembre 2025
**Version** : 1.0.0
**Statut** : ✅ Prêt pour la production
