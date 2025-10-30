# 🔒 Guide d'Intégration de la Sécurité Webhook

## Vue d'ensemble

Ce guide vous aide à intégrer la couche de sécurité dans votre webhook existant sans casser le code.

---

## ⚠️ AVANT DE COMMENCER

1. ✅ **Backup** : Faites une copie de `index.ts` actuel
   ```bash
   cp supabase/functions/evolution-webhook-handler/index.ts \
      supabase/functions/evolution-webhook-handler/index.ts.backup
   ```

2. ✅ **Secret configuré** : Vérifiez que `WEBHOOK_SECRET` est dans Supabase

---

## 📝 MODIFICATIONS À FAIRE

### **MODIFICATION 1 : Imports (Ligne 1)**

**Remplacer :**
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
```

**Par :**
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import {
  verifyHmacSignature,
  checkRateLimit,
  sanitizeError,
  validateWebhookPayload,
} from "../_shared/webhook-security.ts";
```

---

### **MODIFICATION 2 : CORS Headers (Lignes 3-6)**

**Remplacer :**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

**Par :**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
};
```

---

### **MODIFICATION 3 : Début de Deno.serve (Ligne 165)**

**TROUVER** (vers ligne 165) :
```typescript
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();  // ← CETTE LIGNE VA CHANGER
    console.log('[evolution-webhook-handler] Received event:', JSON.stringify(payload, null, 2));
```

**REMPLACER PAR** :
```typescript
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const isProduction = Deno.env.get("DENO_ENV") === "production";

  try {
    // ═══════════════════════════════════════════════════════
    // 🔒 SECURITY LAYER
    // ═══════════════════════════════════════════════════════

    // 1. RATE LIMITING
    const clientId =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const rateLimit = checkRateLimit(clientId, 100, 60000);

    if (!rateLimit.allowed) {
      console.warn(`[webhook-security] ⚠️  Rate limit exceeded for ${clientId}`);
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": new Date(rateLimit.resetAt).toISOString(),
        },
      });
    }

    // 2. READ AND PARSE PAYLOAD
    const body = await req.text();
    let payload;

    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      console.error("[webhook-security] ❌ Invalid JSON");
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. VALIDATE PAYLOAD STRUCTURE
    const validationError = validateWebhookPayload(payload);
    if (validationError) {
      console.error("[webhook-security] ❌ Invalid payload:", validationError);
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. VERIFY HMAC SIGNATURE
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    const signature = req.headers.get("x-webhook-signature") || "";

    if (webhookSecret) {
      const isValid = await verifyHmacSignature(body, signature, webhookSecret);

      if (!isValid) {
        console.error("[webhook-security] 🚨 SECURITY ALERT: Invalid signature from", clientId);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[webhook-security] ✅ Signature verified for: ${payload.instance}`);
    } else {
      console.warn("[webhook-security] ⚠️  WEBHOOK_SECRET not set - VULNERABLE!");
    }

    // ═══════════════════════════════════════════════════════
    // 🔒 END SECURITY LAYER
    // ═══════════════════════════════════════════════════════

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // REMOVED: const payload = await req.json(); ← On l'a déjà fait plus haut
    console.log('[evolution-webhook-handler] Received event:', JSON.stringify(payload, null, 2));
```

---

### **MODIFICATION 4 : Error Handling (Vers ligne 550)**

**TROUVER** le catch block à la fin :
```typescript
  } catch (error) {
    console.error('[evolution-webhook-handler] Error processing webhook:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
```

**REMPLACER PAR** :
```typescript
  } catch (error) {
    console.error('[webhook] ❌ Error:', error);
    return new Response(
      JSON.stringify({ error: sanitizeError(error, isProduction) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
```

---

## ✅ CHECKLIST DE VÉRIFICATION

Avant de déployer, vérifiez :

- [ ] ✅ Import de `webhook-security.ts` ajouté
- [ ] ✅ `corsHeaders` inclut `x-webhook-signature`
- [ ] ✅ Couche de sécurité ajoutée après CORS check
- [ ] ✅ Ligne `const payload = await req.json();` SUPPRIMÉE (maintenant dans security layer)
- [ ] ✅ Error handling utilise `sanitizeError()`
- [ ] ✅ Fichier sauvegardé

---

## 🧪 TESTER EN LOCAL

Avant de déployer :

```bash
# 1. Vérifier syntaxe TypeScript
cd supabase/functions/evolution-webhook-handler
deno check index.ts

# 2. Si erreurs, corrigez-les avant de continuer
```

---

## 🚀 DÉPLOYER

Une fois les modifications faites :

```bash
# Via Supabase CLI
supabase functions deploy evolution-webhook-handler

# Ou via Dashboard:
# 1. Aller dans Edge Functions
# 2. Sélectionner evolution-webhook-handler
# 3. Upload le nouveau index.ts
```

---

## 📊 TESTER LA SÉCURITÉ

Utilisez le script de test :

```bash
./scripts/test-webhook-security.sh \
  https://your-project.supabase.co/functions/v1/evolution-webhook-handler \
  05c6e76513e63310905c2eca7d3e6c56db6a079cafb334bca195db4544a56ceb
```

**Résultats attendus :**
- ✅ Test 1: Rejet sans signature (401)
- ✅ Test 2: Rejet signature invalide (401)
- ✅ Test 3: Accepte signature valide (200)
- ✅ Test 4: Rate limiting actif (429 après 100 req)

---

## 🆘 EN CAS DE PROBLÈME

### Erreur : "Cannot find module webhook-security.ts"

**Cause** : Le fichier `_shared/webhook-security.ts` n'existe pas ou chemin incorrect

**Solution** :
```bash
# Vérifier que le fichier existe
ls supabase/functions/_shared/webhook-security.ts

# Si absent, le créer (voir fichier fourni)
```

### Erreur : "payload is not defined"

**Cause** : Vous avez oublié de supprimer l'ancien `const payload = await req.json();`

**Solution** : Supprimez la ligne dupliquée (vers ligne 176 originale)

### Webhook ne reçoit plus rien

**Cause** : Signature invalide ou Evolution API ne l'envoie pas

**Solution temporaire** :
- Commentez temporairement le bloc de vérification HMAC
- Ou ne configurez pas `WEBHOOK_SECRET` (mode warning uniquement)

---

## 📞 BESOIN D'AIDE ?

Si vous êtes bloqué, je peux :
1. Créer le fichier complet modifié pour vous
2. Vous guider ligne par ligne
3. Débugger les erreurs

Dites-moi où vous en êtes !
