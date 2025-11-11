# 📦 GUIDE DE DÉPLOIEMENT - JOBLYA V4

## 🎯 FICHIERS À DÉPLOYER

Tous les fichiers sont disponibles dans `/mnt/user-data/outputs/`

### **Structure complète à copier dans `supabase/functions/ai-auto-reply/`**

```
supabase/functions/ai-auto-reply/
│
├── index.ts                          ⭐ FICHIER PRINCIPAL (380 lignes)
├── config.ts                         📋 Constantes
├── types.ts                          📝 Types TypeScript
│
├── security/
│   └── auth.ts                       🔐 JWT validation
│
├── utils/
│   ├── timezone.ts                   🌍 Timezone France
│   ├── enums.ts                      📊 Build enums dynamiques
│   └── pricing.ts                    💰 Build price mappings
│
├── temporal/
│   ├── duckling.ts                   🦆 API Duckling (primary)
│   ├── chrono.ts                     ⏰ Chrono-node (fallback)
│   ├── enrichment.ts                 ✨ Enrichissement messages
│   └── parser.ts                     🔄 Orchestration parsing
│
├── data/
│   ├── user.ts                       👤 Fetch user data
│   ├── conversation.ts               💬 Fetch conversation data
│   └── context.ts                    🏗️  Build contexts
│
├── availability/
│   ├── calculator.ts                 🧮 Compute créneaux dispos
│   └── validator.ts                  ✅ Validate appointment time
│
├── ai/
│   ├── modes.ts                      🤖 Determine AI mode
│   ├── openai.ts                     🧠 OpenAI API
│   └── prompts/
│       ├── context.ts                📍 Build appointment context
│       ├── waiting.ts                ⏳ WAITING prompt
│       └── workflow.ts               🔄 WORKFLOW prompt
│
├── appointment/
│   ├── tool.ts                       🛠️  Function calling schema
│   ├── validation.ts                 ✅ Enum + duplicate validation
│   ├── creation.ts                   ➕ Create appointment
│   └── confirmation.ts               ✉️  Build confirmation message
│
├── messaging/
│   └── whatsapp.ts                   📱 Send WhatsApp messages
│
└── logging/
    └── events.ts                     📊 Log AI events
```

---

## 🚀 COMMANDES DE DÉPLOIEMENT

### **Option 1 : Copie manuelle**

```bash
# Créer la structure
mkdir -p supabase/functions/ai-auto-reply/security
mkdir -p supabase/functions/ai-auto-reply/utils
mkdir -p supabase/functions/ai-auto-reply/temporal
mkdir -p supabase/functions/ai-auto-reply/data
mkdir -p supabase/functions/ai-auto-reply/availability
mkdir -p supabase/functions/ai-auto-reply/ai/prompts
mkdir -p supabase/functions/ai-auto-reply/appointment
mkdir -p supabase/functions/ai-auto-reply/messaging
mkdir -p supabase/functions/ai-auto-reply/logging

# Copier les fichiers (depuis /mnt/user-data/outputs/)
cp /mnt/user-data/outputs/index.ts supabase/functions/ai-auto-reply/
cp /mnt/user-data/outputs/config.ts supabase/functions/ai-auto-reply/
cp /mnt/user-data/outputs/types.ts supabase/functions/ai-auto-reply/

cp /mnt/user-data/outputs/security/* supabase/functions/ai-auto-reply/security/
cp /mnt/user-data/outputs/utils/* supabase/functions/ai-auto-reply/utils/
cp /mnt/user-data/outputs/temporal/* supabase/functions/ai-auto-reply/temporal/
cp /mnt/user-data/outputs/data/* supabase/functions/ai-auto-reply/data/
cp /mnt/user-data/outputs/availability/* supabase/functions/ai-auto-reply/availability/
cp /mnt/user-data/outputs/ai/*.ts supabase/functions/ai-auto-reply/ai/
cp /mnt/user-data/outputs/ai/prompts/* supabase/functions/ai-auto-reply/ai/prompts/
cp /mnt/user-data/outputs/appointment/* supabase/functions/ai-auto-reply/appointment/
cp /mnt/user-data/outputs/messaging/* supabase/functions/ai-auto-reply/messaging/
cp /mnt/user-data/outputs/logging/* supabase/functions/ai-auto-reply/logging/

# Déployer
supabase functions deploy ai-auto-reply
```

### **Option 2 : Script automatique**

Créer un fichier `deploy.sh` :

```bash
#!/bin/bash

# deploy.sh - Deploy JOBLYA V4 refactored code

echo "🚀 Deploying JOBLYA V4..."

# Source directory
SRC="/mnt/user-data/outputs"

# Destination directory
DEST="supabase/functions/ai-auto-reply"

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p $DEST/{security,utils,temporal,data,availability,ai/prompts,appointment,messaging,logging}

# Copy files
echo "📦 Copying files..."

# Root files
cp $SRC/index.ts $DEST/
cp $SRC/config.ts $DEST/
cp $SRC/types.ts $DEST/

# Module files
cp $SRC/security/* $DEST/security/
cp $SRC/utils/* $DEST/utils/
cp $SRC/temporal/* $DEST/temporal/
cp $SRC/data/* $DEST/data/
cp $SRC/availability/* $DEST/availability/
cp $SRC/ai/*.ts $DEST/ai/
cp $SRC/ai/prompts/* $DEST/ai/prompts/
cp $SRC/appointment/* $DEST/appointment/
cp $SRC/messaging/* $DEST/messaging/
cp $SRC/logging/* $DEST/logging/

echo "✅ Files copied successfully!"

# Deploy to Supabase
echo "🚀 Deploying to Supabase..."
supabase functions deploy ai-auto-reply

echo "🎉 Deployment complete!"
```

Puis :
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 🔍 VÉRIFICATION POST-DÉPLOIEMENT

### **1. Vérifier les variables d'environnement**

```bash
supabase secrets list
```

Vérifier que ces secrets existent :
- `OPENAI_API_KEY`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DUCKLING_API_URL` (optionnel, si Duckling configuré)

### **2. Tester la fonction**

```bash
# Test basique
curl -X POST https://[PROJECT_REF].supabase.co/functions/v1/ai-auto-reply \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "test-conversation-id",
    "message_text": "Salut, t'\''es dispo ?"
  }'
```

### **3. Surveiller les logs**

```bash
supabase functions logs ai-auto-reply
```

Chercher :
- `✅` pour les succès
- `❌` pour les erreurs
- Les 12 étapes qui s'exécutent

---

## 📊 MONITORING

### **Logs à surveiller :**

```
=== 🚀 JOBLYA V4 - AI Auto-Reply Request ===
[1/12] 🔐 Authentication...
[auth] ✅ Authenticated as user: xxx
[2/12] 📦 Parse request body...
[3/12] 🗄️  Initialize Supabase...
[4/12] 📊 Fetch data...
[5/12] ⏰ Temporal parsing...
[6/12] 🏗️  Build contexts...
[7/12] 🤖 Determine AI mode...
[8/12] 📝 Build system prompt...
[9/12] 🧠 Call OpenAI...
[10/12] 🔄 Process response...
[11/12] 📤 Send WhatsApp message...
[12/12] ✅ Success!
=== 🎉 Request completed successfully ===
```

### **Métriques à tracker :**

```sql
-- Latence OpenAI moyenne
SELECT 
  AVG((metadata->>'latency_ms')::int) as avg_latency_ms
FROM ai_events
WHERE event_type = 'openai_call'
AND created_at > now() - interval '1 hour';

-- Taux de succès création RDV
SELECT 
  COUNT(*) FILTER (WHERE event_type = 'appointment_created') as success,
  COUNT(*) FILTER (WHERE event_type = 'validation_error') as errors,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_type = 'appointment_created') / 
    NULLIF(COUNT(*), 0),
    2
  ) as success_rate_pct
FROM ai_events
WHERE created_at > now() - interval '1 hour';

-- Répartition modes IA
SELECT 
  metadata->>'ai_mode' as ai_mode,
  COUNT(*) as count
FROM ai_events
WHERE event_type = 'openai_call'
GROUP BY metadata->>'ai_mode';
```

---

## 🎯 CHECKLIST PRE-PRODUCTION

- [ ] Tous les fichiers copiés
- [ ] Variables d'environnement configurées
- [ ] Duckling API accessible (ou chrono fallback OK)
- [ ] Test WORKFLOW mode (création RDV)
- [ ] Test WAITING mode (détection arrivée)
- [ ] Test validation (enum, duplicates, time)
- [ ] Test créneaux minuit
- [ ] Test retry WhatsApp
- [ ] Logs structurés visibles
- [ ] ai_events table peuplée
- [ ] Monitoring configuré

---

## 🆘 TROUBLESHOOTING

### **Erreur : Module not found**
```
Solution : Vérifier que tous les fichiers sont copiés
Commande : ls -R supabase/functions/ai-auto-reply/
```

### **Erreur : JWT validation failed**
```
Solution : Vérifier SUPABASE_JWT_SECRET
Commande : supabase secrets list
```

### **Erreur : Duckling timeout**
```
Solution : Normal, fallback sur Chrono-node activé automatiquement
Log : "[temporal] ⚠️ Duckling failed, trying Chrono-node fallback"
```

### **Erreur : Appointment validation failed**
```
Solution : Vérifier enums dans user_informations table
Log : "[workflow] ❌ Validation failed"
Query : SELECT * FROM user_informations WHERE user_id = 'xxx';
```

---

## 🎊 C'EST PRÊT !

Une fois déployé, JOBLYA V4 est **production-ready** ! 🚀

**Profite de ton code refactorisé et maintenable ! 🎉**
