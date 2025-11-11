# 🔍 Guide de Diagnostic - Problème de Réception des Messages

## 📋 Symptômes

- ✅ Evolution API connecté
- ✅ Numéro WhatsApp connecté
- ✅ Conversations ont `ai_enabled = true`
- ❌ **Aucun message n'est inséré dans la base de données**
- ❌ **La fonction `ai-auto-reply` ne se déclenche jamais**

## 🎯 Diagnostic

Le problème se situe **avant** le traitement de l'IA. Les messages n'atteignent jamais le webhook handler de Supabase.

---

## ✅ ÉTAPE 1 : Vérifier la Configuration en Base de Données

### 1.1 Vérifier l'instance Evolution

Exécutez la requête SQL suivante dans le SQL Editor de Supabase :

```sql
SELECT
  id,
  instance_name,
  instance_status,
  phone_number,
  webhook_url,
  CASE
    WHEN instance_token IS NOT NULL THEN '✅ Token présent'
    ELSE '❌ Token manquant'
  END as token_status,
  created_at
FROM evolution_instances
ORDER BY created_at DESC
LIMIT 1;
```

**Vérifications importantes :**

- ✅ `instance_name` : doit être au format `user_{uuid}` (ex: `user_12345678-1234-1234-1234-123456789abc`)
- ✅ `instance_token` : doit être présent (non null)
- ✅ `webhook_url` : doit être `https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/evolution-webhook-handler`
- ✅ `instance_status` : doit être `connected`

**Notez votre `instance_name` et `instance_token` pour les prochaines étapes.**

### 1.2 Vérifier les conversations

```sql
SELECT
  c.id,
  c.contact_name,
  c.contact_phone,
  c.ai_enabled,
  COUNT(m.id) as message_count
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY c.id, c.contact_name, c.contact_phone, c.ai_enabled
ORDER BY c.created_at DESC;
```

**Vérifications :**
- Si `message_count = 0` pour toutes les conversations → Le problème est au niveau du webhook
- Si `ai_enabled = false` ou `null` → Mettez à jour : `UPDATE conversations SET ai_enabled = true WHERE ai_enabled IS NULL;`

---

## ✅ ÉTAPE 2 : Vérifier les Logs Supabase

1. Allez sur le Dashboard Supabase : https://supabase.com/dashboard/project/mxzvvgpqxugirbwtmxys
2. Cliquez sur **Edge Functions** dans le menu de gauche
3. Cliquez sur **evolution-webhook-handler**
4. Cliquez sur **Logs**
5. Regardez les logs des dernières heures

### 2.1 Scénario 1 : Aucun log (le webhook n'est jamais appelé)

**→ Le webhook n'est PAS configuré dans Evolution API**

Passez à l'**ÉTAPE 3** pour configurer le webhook.

### 2.2 Scénario 2 : Logs avec erreur "Instance not found"

```
[evolution-webhook-handler] Instance not found: user_xxxxx
```

**→ Le nom d'instance ne correspond pas**

**Solution :**
1. Vérifiez le nom exact dans la base de données (étape 1.1)
2. Vérifiez le nom dans Evolution API (étape 3.1)
3. Si différents, supprimez et recréez l'instance

### 2.3 Scénario 3 : Logs avec "Message ignored - no text content"

```
[evolution-webhook-handler] Message ignored - no text content
```

**→ Le type de message n'est pas supporté**

Le webhook reçoit bien les messages mais ne peut pas extraire le texte. Types supportés :
- `conversation` (texte simple)
- `extendedTextMessage` (texte avec lien)
- `imageMessage` (avec caption)
- `videoMessage` (avec caption)

**Solution :**
Envoyez un simple message texte sans média pour tester.

### 2.4 Scénario 4 : Logs avec "Message stored in conversation"

```
[evolution-webhook-handler] Message stored in conversation xxx
```

**→ Le message est bien reçu et stocké !**

Si vous voyez ce log mais pas de message dans la DB :
1. Vérifiez la table `messages` : `SELECT * FROM messages ORDER BY created_at DESC LIMIT 10;`
2. Si le message est là mais l'IA ne répond pas, vérifiez que `ai_enabled = true`

---

## ✅ ÉTAPE 3 : Vérifier la Configuration du Webhook dans Evolution API

### 3.1 Utiliser le script de diagnostic

1. Ouvrez le fichier `test-webhook-config.ts`
2. Remplissez les variables :
   ```typescript
   const INSTANCE_NAME = 'user_xxxxx'; // De l'étape 1.1
   const INSTANCE_TOKEN = 'votre_token'; // De l'étape 1.1
   ```
3. Exécutez :
   ```bash
   deno run --allow-net --allow-env test-webhook-config.ts
   ```

### 3.2 Interpréter les résultats

#### ✅ Webhook correctement configuré

```
✅ Instance trouvée
✅ Configuration webhook récupérée
✅ Événement MESSAGES_UPSERT configuré
✅ Webhook activé
✅ URL semble correcte
```

**→ Le webhook est configuré. Le problème est ailleurs.**

Passez à l'**ÉTAPE 4** pour tester le endpoint.

#### ❌ Webhook non configuré (404)

```
❌ Erreur: 404 Not Found
```

**→ Le webhook n'est PAS configuré dans Evolution API**

**Solution :** Appelez la fonction Supabase `set-webhook`

**Méthode 1 : Depuis l'interface web de votre application**
1. Connectez-vous à votre application
2. Allez dans les paramètres ou la page de configuration Evolution
3. Cliquez sur "Reconfigurer le webhook" ou "Set Webhook"

**Méthode 2 : Depuis Supabase Dashboard**
1. Dashboard > Edge Functions > set-webhook
2. Cliquez sur "Invoke"
3. Laissez le body vide `{}`
4. Ajoutez le header `Authorization: Bearer YOUR_USER_JWT_TOKEN`

**Méthode 3 : Avec curl**
```bash
curl -X POST 'https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/set-webhook' \
  -H 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

Pour obtenir votre JWT token :
1. Ouvrez votre application web dans le navigateur
2. Ouvrez la console développeur (F12)
3. Dans l'onglet Application/Storage > Local Storage
4. Cherchez la clé contenant `supabase.auth.token`

#### ❌ Événement MESSAGES_UPSERT manquant

```
✅ Configuration webhook récupérée
❌ Événement MESSAGES_UPSERT MANQUANT !
```

**→ Les événements ne sont pas correctement configurés**

**Solution :** Appelez la fonction `set-webhook` (voir ci-dessus)

#### ❌ Webhook désactivé

```
✅ Configuration webhook récupérée
❌ Webhook DÉSACTIVÉ !
```

**→ Le webhook existe mais est désactivé**

**Solution :** Appelez la fonction `set-webhook` pour réactiver

---

## ✅ ÉTAPE 4 : Tester le Endpoint Webhook Directement

### 4.1 Utiliser le script de test

1. Ouvrez le fichier `test-webhook-endpoint.ts`
2. Remplissez la variable :
   ```typescript
   const INSTANCE_NAME = 'user_xxxxx'; // De l'étape 1.1
   ```
3. Exécutez :
   ```bash
   deno run --allow-net --allow-env test-webhook-endpoint.ts
   ```

### 4.2 Interpréter les résultats

#### ✅ Succès

```
✅ Le webhook a répondu avec succès !
```

**→ Le webhook fonctionne !**

1. Vérifiez les logs Supabase (étape 2)
2. Vérifiez la base de données :
   ```sql
   SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;
   ```
3. Si le message de test apparaît → **Le problème est résolu** côté Supabase
4. Si le message n'apparaît pas → Consultez les logs pour voir l'erreur

#### ❌ Erreur 404

```
❌ Le webhook a retourné une erreur !
🔍 Erreur 404 - Endpoint non trouvé
```

**→ La fonction Edge n'est pas déployée**

**Solution :**
```bash
cd supabase/functions
supabase functions deploy evolution-webhook-handler
```

#### ❌ Erreur 500

```
❌ Le webhook a retourné une erreur !
🔍 Erreur serveur (500)
```

**→ Erreur dans le code du webhook**

**Solution :**
1. Consultez les logs Supabase pour voir l'erreur exacte
2. Vérifiez que toutes les variables d'environnement sont configurées :
   ```bash
   supabase secrets list
   ```

---

## ✅ ÉTAPE 5 : Configurer le Webhook (si nécessaire)

Si l'étape 3 a révélé que le webhook n'est pas configuré, voici comment le configurer :

### 5.1 Méthode Recommandée : Via la Fonction Supabase

**Depuis votre application web :**

1. Connectez-vous à l'application
2. Ouvrez la console développeur (F12)
3. Exécutez ce code :

```javascript
// Récupérer le token d'authentification
const session = JSON.parse(localStorage.getItem('sb-mxzvvgpqxugirbwtmxys-auth-token'));
const accessToken = session.access_token;

// Appeler la fonction set-webhook
fetch('https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/set-webhook', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log('Résultat:', data))
.catch(err => console.error('Erreur:', err));
```

### 5.2 Méthode Alternative : Manuellement via l'API Evolution

**Si la fonction Supabase ne fonctionne pas, configurez manuellement :**

```bash
# Remplacez les valeurs
EVOLUTION_API_URL="https://evo.voxium.cloud"
INSTANCE_NAME="user_xxxxx"
INSTANCE_TOKEN="votre_token"
WEBHOOK_URL="https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/evolution-webhook-handler"

curl -X POST "${EVOLUTION_API_URL}/webhook/set/${INSTANCE_NAME}" \
  -H "apikey: ${INSTANCE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "'"${WEBHOOK_URL}"'",
      "enabled": true,
      "events": [
        "QRCODE_UPDATED",
        "CONNECTION_UPDATE",
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "SEND_MESSAGE"
      ]
    }
  }'
```

---

## ✅ ÉTAPE 6 : Validation Finale

### 6.1 Envoyer un message de test

1. Depuis un autre numéro WhatsApp, envoyez un simple message texte au numéro connecté
2. Le message doit contenir uniquement du texte (pas d'emoji complexe, pas de média)
3. Exemple : "Bonjour, c'est un test"

### 6.2 Vérifier en temps réel

**Dans les 5 secondes après l'envoi, vérifiez :**

1. **Logs Supabase :**
   - Dashboard > Edge Functions > evolution-webhook-handler > Logs
   - Cherchez : `[evolution-webhook-handler] Received event`

2. **Base de données :**
   ```sql
   SELECT * FROM messages ORDER BY created_at DESC LIMIT 1;
   ```

3. **Réponse AI :**
   - Si tout fonctionne, l'IA devrait répondre automatiquement au message

### 6.3 Résultats attendus

#### ✅ Succès complet

1. Log dans Supabase : `[evolution-webhook-handler] Received event`
2. Log : `[webhook] Message stored in conversation {id}`
3. Log : `[webhook] AI auto-reply enabled for this conversation, triggering...`
4. Message dans la table `messages`
5. Réponse de l'IA envoyée sur WhatsApp

#### ⚠️ Succès partiel : Message reçu mais pas de réponse AI

1. Log : `[webhook] Message stored in conversation {id}`
2. Mais **PAS** de log : `[webhook] AI auto-reply enabled`

**→ Problème avec `ai_enabled`**

**Solution :**
```sql
UPDATE conversations SET ai_enabled = true WHERE id = 'conversation_id';
```

#### ❌ Échec : Aucun log

**→ Le webhook n'est toujours pas configuré**

Recommencez l'**ÉTAPE 5**.

---

## 📊 Checklist de Diagnostic Rapide

Utilisez cette checklist pour un diagnostic rapide :

- [ ] 1. Instance existe dans `evolution_instances`
- [ ] 2. `instance_token` est présent (non null)
- [ ] 3. `webhook_url` est correct : `https://mxzvvgpqxugirbwtmxys.supabase.co/functions/v1/evolution-webhook-handler`
- [ ] 4. `instance_status` = 'connected'
- [ ] 5. Conversations ont `ai_enabled = true`
- [ ] 6. Logs Supabase montrent des webhooks reçus
- [ ] 7. Webhook configuré dans Evolution API (test avec script)
- [ ] 8. Événement `MESSAGES_UPSERT` est activé
- [ ] 9. Webhook est `enabled: true`
- [ ] 10. Test endpoint Supabase réussit (200 OK)

**Si tous les checks sont ✅ mais ça ne fonctionne toujours pas :**
→ Contactez le support ou vérifiez les logs Evolution API

---

## 🆘 Solutions aux Problèmes Courants

### Problème : "Instance not found in database"

**Causes :**
- Le nom d'instance dans Evolution API ≠ nom dans la DB
- L'instance a été supprimée de la DB mais existe encore dans Evolution API

**Solution :**
1. Supprimez l'instance dans Evolution API
2. Recréez-la depuis votre application
3. Attendez 10 secondes que le webhook se configure
4. Testez

### Problème : Messages reçus mais IA ne répond pas

**Causes :**
- `ai_enabled = false` ou `null`
- Problème avec la clé OpenAI
- Erreur dans la fonction `ai-auto-reply`

**Solution :**
1. Vérifiez `ai_enabled` : `SELECT ai_enabled FROM conversations;`
2. Vérifiez les secrets : `supabase secrets list | grep OPENAI`
3. Consultez les logs de `ai-auto-reply`

### Problème : Webhook désactivé automatiquement

**Causes :**
- Evolution API a désactivé le webhook après trop d'erreurs
- Le webhook a été désactivé manuellement

**Solution :**
Réactivez avec la fonction `set-webhook`

### Problème : "Rate limit exceeded"

**Causes :**
- Trop de requêtes depuis la même IP en peu de temps

**Solution :**
Attendez 1 minute et réessayez

---

## 🔧 Scripts de Diagnostic Disponibles

1. **diagnose-webhook.sql** : Requêtes SQL pour vérifier la DB
2. **test-webhook-config.ts** : Test de la configuration Evolution API
3. **test-webhook-endpoint.ts** : Test direct du endpoint Supabase

---

## 📞 Support

Si après avoir suivi toutes ces étapes le problème persiste :

1. **Collectez les informations :**
   - Résultats des scripts de diagnostic
   - Logs Supabase (dernières 24h)
   - Configuration de l'instance (SQL query)
   - Réponse du test webhook

2. **Vérifiez la documentation Evolution API :**
   - https://doc.evolution-api.com/

3. **Ouvrez un ticket avec :**
   - Description du problème
   - Tous les résultats des diagnostics
   - Logs d'erreur

---

**Dernière mise à jour :** 2025-11-07
