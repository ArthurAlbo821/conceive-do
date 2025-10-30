/**
 * Webhook Security Utilities
 * Provides HMAC signature verification and rate limiting
 */

/**
 * Verify HMAC signature for webhook requests
 * @param payload - The webhook payload as string
 * @param signature - The signature from webhook header
 * @param secret - The shared secret key
 * @returns true if signature is valid
 */
export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  try {
    // Convert secret to key
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Calculate HMAC
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );

    // Convert to hex string
    const calculatedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures (constant-time comparison)
    return timingSafeEqual(calculatedSignature, signature.toLowerCase());
  } catch (error) {
    console.error("[webhook-security] HMAC verification error:", error);
    return false;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Simple rate limiting using in-memory store
 * For production, use Redis or Supabase for distributed rate limiting
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minute
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;

  // Clean up expired entries
  if (rateLimitStore.size > 10000) {
    // Prevent memory leak
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) {
        rateLimitStore.delete(k);
      }
    }
  }

  let record = rateLimitStore.get(key);

  // Reset if window expired
  if (!record || record.resetAt < now) {
    record = {
      count: 0,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(key, record);
  }

  record.count++;

  return {
    allowed: record.count <= maxRequests,
    remaining: Math.max(0, maxRequests - record.count),
    resetAt: record.resetAt,
  };
}

/**
 * Sanitize error messages for production
 * Prevents information leakage
 */
export function sanitizeError(error: unknown, isProduction: boolean): string {
  if (!isProduction) {
    return error instanceof Error ? error.message : String(error);
  }

  // Generic error message for production
  return "An error occurred processing your request";
}

/**
 * Validate webhook payload structure
 * Returns null if valid, error message if invalid
 */
export function validateWebhookPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return "Invalid payload format";
  }

  const p = payload as Record<string, unknown>;

  if (!p.event || typeof p.event !== "string") {
    return "Missing or invalid event field";
  }

  if (!p.instance || typeof p.instance !== "string") {
    return "Missing or invalid instance field";
  }

  return null;
}
