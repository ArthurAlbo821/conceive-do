# 🚀 Déploiement du Système de Notifications WhatsApp

## ✅ Résumé de l'Implémentation

Le système de notifications WhatsApp a été implémenté avec succès. Voici un guide rapide de déploiement.

---

## 📦 Ce qui a été Fait

### Nouveaux Fichiers Créés

1. **Migrations SQL** :
   - `supabase/migrations/20251103120000_add_notification_system.sql` - Crée les tables
   - `supabase/migrations/20251103120002_simple_notification_approach.sql` - Nettoie les triggers

2. **Edge Function** :
   - `supabase/functions/send-provider-notification/index.ts` - Gère l'envoi des notifications

3. **Documentation** :
   - `NOTIFICATION_SYSTEM_SETUP.md` - Guide complet d'utilisation
   - `DEPLOYMENT_NOTIFICATION_SYSTEM.md` - Ce fichier

### Fichiers Modifiés

1. **Frontend** :
   - `src/pages/Informations.tsx` - Ajout du champ "Numéro de notification"
   - `src/hooks/useUserInformations.ts` - Support du nouveau champ

2. **Edge Functions** :
   - `supabase/functions/ai-auto-reply/index.ts` - Appelle la notification après création RDV et détection arrivée client
   - `supabase/functions/send-access-info/index.ts` - Appelle la notification après envoi des infos d'accès

---

## 🚀 Étapes de Déploiement

### 1. Pousser les Modifications Git

```bash
git add .
git commit -m "feat: Add WhatsApp notification system for providers"
git push
```

### 2. Appliquer les Migrations

**Option A : Via Supabase CLI** (si vous l'utilisez)
```bash
supabase db push
```

**Option B : Automatique**
Les migrations seront appliquées automatiquement si vous avez configuré le CI/CD.

**Option C : Manuellement via SQL Editor**
Si les migrations ne s'appliquent pas automatiquement, copiez-collez le contenu des fichiers suivants dans le SQL Editor de Supabase :
1. `supabase/migrations/20251103120000_add_notification_system.sql`
2. `supabase/migrations/20251103120002_simple_notification_approach.sql`

### 3. Déployer les Edge Functions

```bash
# Déployer toutes les fonctions modifiées
supabase functions deploy send-provider-notification
supabase functions deploy ai-auto-reply
supabase functions deploy send-access-info
```

### 4. Vérification Post-Déploiement

#### Vérifier que les tables existent :

```sql
-- Vérifier la colonne notification_phone
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_informations'
AND column_name = 'notification_phone';

-- Vérifier la table appointment_notifications
SELECT * FROM appointment_notifications LIMIT 1;
```

#### Vérifier que les Edge Functions sont déployées :

Dashboard Supabase → Edge Functions → Vérifiez que ces 3 fonctions apparaissent :
- ✅ `send-provider-notification`
- ✅ `ai-auto-reply`
- ✅ `send-access-info`

---

## 👤 Configuration Utilisateur

### Pour Activer les Notifications

1. Se connecter à l'application
2. Aller dans **"Mes Informations"**
3. Faire défiler jusqu'à la section **"Numéro de notification"** (carte bleue avec icône 🔔)
4. Entrer son numéro WhatsApp personnel au format international : `+33612345678`
5. Cliquer sur **"Enregistrer"**

**Formats acceptés** :
- ✅ `+33612345678` (France)
- ✅ `+14155551234` (USA)
- ✅ `+447911123456` (UK)

**Formats refusés** :
- ❌ `0612345678` (pas de +)
- ❌ `+33 6 12 34 56 78` (espaces)
- ❌ `06-12-34-56-78` (tirets)

---

## 🧪 Tests

### Test 1 : Notification Nouveau RDV

1. Assurez-vous que votre instance WhatsApp Business est connectée
2. Configurez votre `notification_phone` dans "Mes Informations"
3. Utilisez un autre téléphone (ou WhatsApp Web) pour envoyer un message à votre bot
4. Laissez l'IA créer un rendez-vous complet
5. ✅ Vous devriez recevoir sur votre numéro personnel :

```
🤖 Nouveau RDV

👤 Client : Jean Dupont (+33612345678)
📅 Date : Lundi 3 novembre 2025
🕐 Heure : 14:00 - 15:30 (90min)

📋 Service : Toutes prestations incluses
Extras: Extra 1, Extra 2
```

### Test 2 : Notification Client Arrivé

1. Créez un RDV pour aujourd'hui (manuellement ou via l'IA)
2. Envoyez "je suis là" depuis le numéro du client
3. ✅ Vous devriez recevoir :

```
🚶 Client arrivé !

👤 Jean Dupont est arrivé pour le rendez-vous de 14:00.

📱 Rendez-vous dans l'app pour envoyer les infos d'accès.
```

### Test 3 : Notification Infos Envoyées

1. Cliquez sur "Prêt à Recevoir" pour un RDV avec client arrivé
2. ✅ Vous devriez recevoir :

```
✅ Infos d'accès envoyées

Les informations d'accès ont été envoyées à Jean Dupont pour le RDV de 14:00.
```

---

## 🔍 Vérification des Logs

### Consulter l'historique des notifications

```sql
SELECT
  n.created_at,
  n.notification_type,
  n.status,
  a.contact_name,
  a.appointment_date,
  a.start_time,
  n.message_text
FROM appointment_notifications n
JOIN appointments a ON n.appointment_id = a.id
ORDER BY n.created_at DESC
LIMIT 10;
```

### Vérifier les notifications échouées

```sql
SELECT
  n.created_at,
  n.notification_type,
  n.error_details,
  a.contact_name
FROM appointment_notifications n
JOIN appointments a ON n.appointment_id = a.id
WHERE n.status = 'failed'
ORDER BY n.created_at DESC;
```

### Logs des Edge Functions

Dashboard Supabase → Edge Functions → Nom de la fonction → Logs

Recherchez :
- `[ai-auto-reply] Sending notification to provider`
- `[send-provider-notification] Processing`
- `[send-provider-notification] Message sent successfully`

---

## ❓ Problèmes Courants

### "Pas de notification reçue"

**Checklist :**
- [ ] Le `notification_phone` est configuré dans "Mes Informations"
- [ ] Le format du numéro est correct (`+33...`)
- [ ] L'instance WhatsApp Business est connectée (status = 'connected')
- [ ] Les Edge Functions sont bien déployées
- [ ] Vérifier les logs de `appointment_notifications` pour voir si une tentative a été faite

### "Format invalide"

- Le numéro DOIT commencer par `+`
- Le numéro NE DOIT PAS contenir d'espaces ni de tirets
- Exemple valide : `+33612345678`

### "Instance not connected"

- Reconnectez votre WhatsApp Business dans la page "Connexion WhatsApp"
- Vérifiez le statut dans la table `evolution_instances`

---

## 🎯 Architecture Simplifiée

```
Événement (RDV créé, Client arrivé, Infos envoyées)
    ↓
Edge Function (ai-auto-reply ou send-access-info)
    ↓
Appelle send-provider-notification
    ↓
Vérifie notification_phone + instance connectée
    ↓
Envoie via Evolution API (WhatsApp)
    ↓
Enregistre dans appointment_notifications
```

**Points clés :**
- ✅ Pas de triggers PostgreSQL (plus fiable)
- ✅ Appels directs depuis les Edge Functions
- ✅ Logs complets pour debugging
- ✅ Gestion d'erreurs gracieuse (ne casse pas le flow principal)

---

## 📚 Ressources

- Guide complet : [NOTIFICATION_SYSTEM_SETUP.md](NOTIFICATION_SYSTEM_SETUP.md)
- Code source : [supabase/functions/send-provider-notification/](supabase/functions/send-provider-notification/)

---

**Date de déploiement** : 3 novembre 2025
**Version** : 1.0.0
**Statut** : ✅ Prêt pour la production
