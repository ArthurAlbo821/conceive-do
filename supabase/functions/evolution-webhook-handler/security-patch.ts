/**
 * SECURITY PATCH for evolution-webhook-handler
 *
 * This file contains the security code to add at the BEGINNING
 * of the Deno.serve() function in index.ts (line 165)
 *
 * HOW TO APPLY:
 * 1. Open index.ts
 * 2. Find: Deno.serve(async (req) => {
 * 3. Add the imports at the top (line 1)
 * 4. Add the security code right after the CORS check (line 169)
 */

// ═══════════════════════════════════════════════════════════════
// STEP 1: ADD THESE IMPORTS AT THE TOP OF index.ts (after line 1)
// ═══════════════════════════════════════════════════════════════
/*
import {
  verifyHmacSignature,
  checkRateLimit,
  sanitizeError,
  validateWebhookPayload,
} from "../_shared/webhook-security.ts";
*/

// Also update corsHeaders to include the signature header:
/*
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
};
*/

// ═══════════════════════════════════════════════════════════════
// STEP 2: ADD THIS CODE AFTER THE CORS CHECK (line 169)
// Replace: "try {" with the code below
// ═══════════════════════════════════════════════════════════════

export const securityLayerCode = `
  const isProduction = Deno.env.get("DENO_ENV") === "production";

  try {
    // ═══════════════════════════════════════════════════════
    // 🔒 SECURITY LAYER - START
    // ═══════════════════════════════════════════════════════

    // 1. RATE LIMITING
    const clientId =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const rateLimit = checkRateLimit(clientId, 100, 60000); // 100 req/min

    if (!rateLimit.allowed) {
      console.warn(\`[webhook-security] ⚠️  Rate limit exceeded for \${clientId}\`);
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": new Date(rateLimit.resetAt).toISOString(),
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        },
      });
    }

    // 2. READ AND VALIDATE PAYLOAD
    const body = await req.text();
    let payload;

    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      console.error("[webhook-security] ❌ Invalid JSON:", parseError);
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

    // 4. VERIFY HMAC SIGNATURE (if secret is configured)
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    const signature = req.headers.get("x-webhook-signature") || "";

    if (webhookSecret) {
      const isValid = await verifyHmacSignature(body, signature, webhookSecret);

      if (!isValid) {
        console.error("[webhook-security] ❌ Invalid signature from", clientId);
        // Log security violation
        console.error("[webhook-security] 🚨 SECURITY ALERT: Unauthorized webhook attempt");
        console.error("[webhook-security] 🚨 IP:", clientId);
        console.error("[webhook-security] 🚨 Payload preview:", body.substring(0, 100));

        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(\`[webhook-security] ✅ Signature verified for instance: \${payload.instance}\`);
    } else {
      console.warn("[webhook-security] ⚠️  WEBHOOK_SECRET not configured");
      console.warn("[webhook-security] ⚠️  Webhook is VULNERABLE to spoofing attacks");
      console.warn("[webhook-security] ⚠️  Set WEBHOOK_SECRET in Supabase Edge Function secrets");
    }

    // ═══════════════════════════════════════════════════════
    // 🔒 SECURITY LAYER - END
    // ═══════════════════════════════════════════════════════

    // Continue with existing webhook logic below...
    // IMPORTANT: Remove the duplicate "const payload = await req.json();" line (old line 176)
    // because we already parsed it above
`;

// ═══════════════════════════════════════════════════════════════
// STEP 3: MODIFY THE ERROR HANDLING (at the end of try/catch)
// Find the catch block and replace the error response with:
// ═══════════════════════════════════════════════════════════════

export const errorHandlingCode = `
  } catch (error) {
    console.error("[webhook] ❌ Error:", error);
    return new Response(
      JSON.stringify({ error: sanitizeError(error, isProduction) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
`;

// ═══════════════════════════════════════════════════════════════
// QUICK REFERENCE: Line Numbers
// ═══════════════════════════════════════════════════════════════
/*
Line 1    : Add import statement
Line 3-6  : Update corsHeaders
Line 165  : Deno.serve(async (req) => {
Line 167  : CORS check (keep as is)
Line 169  : Add "const isProduction = ..." here
Line 170  : Replace "try {" with security layer code
Line 176  : REMOVE "const payload = await req.json();" (now done in security layer)
Line ??? : Find catch block, replace error handling
*/

console.log("✅ Security patch code prepared");
console.log("📝 See instructions above for manual integration");
