# Webhook Security Implementation Guide

## ⚠️ CRITICAL SECURITY ISSUE

**Current Status**: The webhook endpoint has NO authentication/verification.
**Risk Level**: 🔴 CRITICAL - Anyone can send fake webhook events

## Security Measures to Implement

### 1. HMAC Signature Verification (REQUIRED)

The Evolution API should send a signature with each webhook request.

**Setup Evolution API webhook with signature:**
```bash
# When creating/updating your instance, configure webhook with HMAC:
POST /instance/create
{
  "instanceName": "your-instance",
  "webhook": {
    "url": "https://your-supabase-url.supabase.co/functions/v1/evolution-webhook-handler",
    "enabled": true,
    "webhookByEvents": false,
    "webhookBase64": false,
    "headers": {
      "x-webhook-signature": "SIGNATURE_WILL_BE_HERE"
    }
  }
}
```

### 2. Add Environment Variable

Add to Supabase Edge Function secrets:
```bash
# In Supabase Dashboard → Edge Functions → Secrets
WEBHOOK_SECRET=your-strong-random-secret-key-here

# Generate a strong secret:
openssl rand -hex 32
```

### 3. Implementation Code

Add to the top of `index.ts` (line 165, before processing):

```typescript
import {
  verifyHmacSignature,
  checkRateLimit,
  sanitizeError,
  validateWebhookPayload,
} from "../_shared/webhook-security.ts";

// Inside Deno.serve, after CORS check:
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const isProduction = Deno.env.get('DENO_ENV') === 'production';

  try {
    // 1. RATE LIMITING
    const clientId = req.headers.get('x-forwarded-for') || 'unknown';
    const rateLimit = checkRateLimit(clientId, 100, 60000); // 100 req/min

    if (!rateLimit.allowed) {
      console.warn(`[webhook-security] Rate limit exceeded for ${clientId}`);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': new Date(rateLimit.resetAt).toISOString(),
          },
        }
      );
    }

    // 2. READ PAYLOAD
    const body = await req.text();
    const payload = JSON.parse(body);

    // 3. VALIDATE PAYLOAD STRUCTURE
    const validationError = validateWebhookPayload(payload);
    if (validationError) {
      console.error('[webhook-security] Invalid payload:', validationError);
      return new Response(
        JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. VERIFY HMAC SIGNATURE (if secret is configured)
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    if (webhookSecret) {
      const signature = req.headers.get('x-webhook-signature') || '';
      const isValid = await verifyHmacSignature(body, signature, webhookSecret);

      if (!isValid) {
        console.error('[webhook-security] Invalid signature');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[webhook-security] ✓ Signature verified');
    } else {
      console.warn('[webhook-security] ⚠️  WEBHOOK_SECRET not set - signature verification DISABLED');
    }

    // 5. CONTINUE WITH NORMAL PROCESSING
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ... rest of your existing code ...

  } catch (error) {
    console.error('[webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: sanitizeError(error, isProduction) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

## Alternative: API Key Authentication

If HMAC is not supported by Evolution API, use API key:

```typescript
// Check API key from header
const apiKey = req.headers.get('x-api-key');
const expectedKey = Deno.env.get('WEBHOOK_API_KEY');

if (!apiKey || apiKey !== expectedKey) {
  return new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

Then configure Evolution API webhook:
```json
{
  "webhook": {
    "url": "...",
    "headers": {
      "x-api-key": "your-api-key-here"
    }
  }
}
```

## Testing

### Test without security (current state):
```bash
curl -X POST https://your-project.supabase.co/functions/v1/evolution-webhook-handler \
  -H "Content-Type: application/json" \
  -d '{"event":"test","instance":"test","data":{}}'
```
**Result**: ✅ Accepts (BAD - anyone can do this!)

### Test with security enabled:
```bash
# Without signature - should REJECT
curl -X POST https://your-project.supabase.co/functions/v1/evolution-webhook-handler \
  -H "Content-Type: application/json" \
  -d '{"event":"test","instance":"test","data":{}}'
```
**Expected**: ❌ 401 Unauthorized (GOOD!)

```bash
# With valid signature - should ACCEPT
PAYLOAD='{"event":"test","instance":"test","data":{}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "your-secret" -hex | cut -d' ' -f2)

curl -X POST https://your-project.supabase.co/functions/v1/evolution-webhook-handler \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```
**Expected**: ✅ 200 OK (GOOD!)

## Rollout Strategy

1. **Phase 1** (NOW): Deploy security utilities (`_shared/webhook-security.ts`) ✅ Done
2. **Phase 2**: Add security code but make it OPTIONAL (log warnings only)
3. **Phase 3**: Test with Evolution API to ensure signatures work
4. **Phase 4**: Make security REQUIRED (reject invalid requests)

## Monitoring

After deployment, monitor for:
- 401 errors (invalid signatures) - could indicate attacks
- 429 errors (rate limiting) - could indicate DoS attempts
- Successful signature verifications

```sql
-- Check webhook logs
SELECT * FROM ai_logs
WHERE event_type = 'webhook_security_violation'
ORDER BY created_at DESC;
```

---

**Status**:
- ✅ Security utilities created
- ⚠️  Integration pending (see code above)
- ❌ Testing required
- ❌ Production deployment pending
