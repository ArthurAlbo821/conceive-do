# 🔍 Instructions de Diagnostic Webhook

## Problème Identifié

L'instance Evolution API `user_a64ff7e6-5e00-4ff9-9fe6-66ab85386d80` a été créée avec succès, mais les webhooks ne sont PAS configurés automatiquement.

D'après l'analyse du code, la fonction `create-evolution-instance` essaie 3 méthodes différentes pour configurer les webhooks, mais **toutes les erreurs sont silencieuses** - l'instance est créée même si les webhooks échouent.

---

## 🎯 Étapes de Diagnostic

### Étape 1 : Récupérer les informations de l'instance

1. Allez sur le **SQL Editor** de Supabase :
   - https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

2. Exécutez cette requête :

```sql
SELECT
  instance_name,
  instance_token,
  webhook_url,
  instance_status,
  created_at
FROM evolution_instances
WHERE instance_name = 'user_a64ff7e6-5e00-4ff9-9fe6-66ab85386d80';
```

3. **Copiez le `instance_token`** (toute la valeur complète)

---

### Étape 2 : Tester la configuration webhook

1. Ouvrez un terminal ou un outil comme **Postman**

2. Remplacez `INSTANCE_TOKEN_ICI` par le token que vous avez copié à l'étape 1

3. Exécutez cette commande curl :

```bash
curl -X POST \
  https://YOUR_PROJECT_ID.supabase.co/functions/v1/diagnose-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "user_a64ff7e6-5e00-4ff9-9fe6-66ab85386d80",
    "instanceToken": "INSTANCE_TOKEN_ICI",
    "userId": "a64ff7e6-5e00-4ff9-9fe6-66ab85386d80"
  }'
```

4. **Copiez TOUT le résultat** et partagez-le avec moi

---

### Étape 3 : Analyser les résultats

Le résultat vous montrera :

```json
{
  "success": true/false,
  "methods": [
    {
      "method": "Method 1 - Standard",
      "success": true/false,
      "status": 200/400/401/404/500,
      "error": "Message d'erreur détaillé"
    },
    ...
  ],
  "recommendation": "Explication de ce qui fonctionne ou ne fonctionne pas",
  "currentWebhookStatus": { ... }
}
```

---

## 🔧 Solutions Possibles (selon le résultat)

### Si `status: 401` (Non autorisé)
**Cause** : Le token de l'instance est invalide ou expiré

**Solution** :
- Vérifier que le token dans la base de données correspond au token Evolution API
- Recréer l'instance si nécessaire
- Utiliser le token API principal au lieu du token de l'instance

### Si `status: 404` (Non trouvé)
**Cause** : L'endpoint `/webhook/set/{instanceName}` n'existe pas

**Solution** :
- Vérifier la documentation Evolution API pour le bon endpoint
- Tester des endpoints alternatifs (`/webhook/instance`, `/instance/webhook`, etc.)
- Mettre à jour le code avec le bon endpoint

### Si `status: 400` (Requête invalide)
**Cause** : Le format du payload est incorrect

**Solution** :
- Examiner le message d'erreur dans `response`
- Ajuster le format du payload selon l'API
- Essayer les 3 méthodes alternatives du diagnostic

### Si `status: 500` (Erreur serveur)
**Cause** : Problème côté Evolution API

**Solution** :
- Vérifier que l'URL webhook est accessible depuis Evolution API
- Tester avec une URL webhook publique (ex: webhook.site)
- Contacter le support Evolution API

### Si exception réseau
**Cause** : Timeout ou problème de connectivité

**Solution** :
- Augmenter le timeout dans le code
- Vérifier que l'URL Evolution API est correcte
- Tester la connexion manuellement

---

## ⚡ Solution Rapide : Configuration Manuelle

Si le diagnostic prend trop de temps, vous pouvez configurer manuellement les webhooks pour cette instance :

### Option A : Via l'interface Evolution API
1. Allez sur le dashboard Evolution API
2. Sélectionnez l'instance `user_a64ff7e6-5e00-4ff9-9fe6-66ab85386d80`
3. Dans les paramètres Webhook :
   - **Enabled** : ON (activez le toggle)
   - **URL** : `https://YOUR_PROJECT_ID.supabase.co/functions/v1/evolution-webhook-handler`
   - **Webhook by Events** : OFF
   - **Webhook Base64** : OFF
   - **Events** : Sélectionnez :
     - QRCODE_UPDATED
     - CONNECTION_UPDATE
     - MESSAGES_UPSERT
     - MESSAGES_UPDATE
     - SEND_MESSAGE
4. Sauvegardez

### Option B : Via l'Edge Function `set-webhook`

Utilisez la fonction dédiée qui existe déjà dans votre projet :

```bash
curl -X POST \
  https://YOUR_PROJECT_ID.supabase.co/functions/v1/set-webhook \
  -H "Authorization: Bearer VOTRE_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "ID_DE_LINSTANCE_DANS_LA_DB"
  }'
```

---

## 📊 Prochaines Étapes

Une fois le diagnostic effectué et les résultats obtenus :

1. **Je vais analyser les résultats** pour identifier la cause exacte
2. **Je corrigerai le code** de `create-evolution-instance` pour utiliser la bonne méthode
3. **J'ajouterai une vérification** que les webhooks sont bien configurés
4. **Je déploierai** la version corrigée
5. **Nous testerons** avec une nouvelle instance

---

## 🆘 Besoin d'Aide ?

Si vous avez des difficultés avec les étapes ci-dessus :

1. **Partagez une capture d'écran** du résultat SQL (Étape 1)
2. **Partagez le résultat** du curl de diagnostic (Étape 2)
3. **Ou simplement dites-moi** : "Je n'arrive pas à faire l'Étape X"

Je vous guiderai étape par étape !

---

**Date** : 2025-11-01
**Instance concernée** : `user_a64ff7e6-5e00-4ff9-9fe6-66ab85386d80`
**Fonction de diagnostic déployée** : ✅ `diagnose-webhook`
