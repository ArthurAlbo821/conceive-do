#!/bin/bash

# ════════════════════════════════════════════════════════════════
# Webhook Security Test Script
# ════════════════════════════════════════════════════════════════
# Tests webhook endpoint security measures
# Usage: ./test-webhook-security.sh <webhook-url> [webhook-secret]
# ════════════════════════════════════════════════════════════════

set -e

WEBHOOK_URL="${1:-}"
WEBHOOK_SECRET="${2:-}"

if [ -z "$WEBHOOK_URL" ]; then
  echo "❌ Error: Webhook URL required"
  echo "Usage: $0 <webhook-url> [webhook-secret]"
  echo "Example: $0 https://your-project.supabase.co/functions/v1/evolution-webhook-handler my-secret"
  exit 1
fi

echo "════════════════════════════════════════════════════════════════"
echo "🔒 Webhook Security Test Suite"
echo "════════════════════════════════════════════════════════════════"
echo "Target: $WEBHOOK_URL"
echo ""

# Test payload
PAYLOAD='{"event":"messages.upsert","instance":"test-instance","data":{"key":{"remoteJid":"123456789@s.whatsapp.net"},"message":{"conversation":"test"}}}'

# ────────────────────────────────────────────────────────────────
# TEST 1: Request without signature
# ────────────────────────────────────────────────────────────────
echo "📝 Test 1: Request WITHOUT signature"
echo "Expected: 401 Unauthorized (if security enabled)"
echo "         200 OK (if security disabled - VULNERABLE)"
echo ""

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ PASS - Correctly rejected (401)"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "⚠️  WARNING - Accepted without signature (VULNERABLE)"
else
  echo "❌ UNEXPECTED - Got HTTP $HTTP_CODE"
fi

echo ""
echo "────────────────────────────────────────────────────────────────"

# ────────────────────────────────────────────────────────────────
# TEST 2: Request with INVALID signature
# ────────────────────────────────────────────────────────────────
echo "📝 Test 2: Request WITH invalid signature"
echo "Expected: 401 Unauthorized"
echo ""

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: invalid-signature-12345" \
  -d "$PAYLOAD")

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ PASS - Correctly rejected invalid signature (401)"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "⚠️  WARNING - Accepted invalid signature (VULNERABLE)"
else
  echo "❌ UNEXPECTED - Got HTTP $HTTP_CODE"
fi

echo ""
echo "────────────────────────────────────────────────────────────────"

# ────────────────────────────────────────────────────────────────
# TEST 3: Request with VALID signature (if secret provided)
# ────────────────────────────────────────────────────────────────
if [ -n "$WEBHOOK_SECRET" ]; then
  echo "📝 Test 3: Request WITH valid signature"
  echo "Expected: 200 OK"
  echo ""

  # Calculate HMAC signature
  SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | cut -d' ' -f2)

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -H "x-webhook-signature: $SIGNATURE" \
    -d "$PAYLOAD")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ PASS - Accepted valid signature (200)"
  elif [ "$HTTP_CODE" = "401" ]; then
    echo "❌ FAIL - Rejected valid signature (401)"
    echo "   Check: Is WEBHOOK_SECRET correctly set in Supabase?"
  else
    echo "❌ UNEXPECTED - Got HTTP $HTTP_CODE"
  fi

  echo ""
  echo "────────────────────────────────────────────────────────────────"
else
  echo "ℹ️  Test 3: SKIPPED (no webhook secret provided)"
  echo ""
  echo "────────────────────────────────────────────────────────────────"
fi

# ────────────────────────────────────────────────────────────────
# TEST 4: Rate limiting test
# ────────────────────────────────────────────────────────────────
echo "📝 Test 4: Rate limiting (10 rapid requests)"
echo "Expected: Some 429 Too Many Requests (if rate limiting enabled)"
echo ""

SUCCESS_COUNT=0
RATE_LIMITED_COUNT=0

for i in {1..10}; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$HTTP_CODE" = "429" ]; then
    RATE_LIMITED_COUNT=$((RATE_LIMITED_COUNT + 1))
  fi

  sleep 0.1
done

echo "   Successful: $SUCCESS_COUNT"
echo "   Rate limited: $RATE_LIMITED_COUNT"

if [ "$RATE_LIMITED_COUNT" -gt 0 ]; then
  echo "✅ PASS - Rate limiting is active"
else
  echo "⚠️  WARNING - No rate limiting detected"
fi

echo ""
echo "────────────────────────────────────────────────────────────────"

# ────────────────────────────────────────────────────────────────
# TEST 5: Malformed payload
# ────────────────────────────────────────────────────────────────
echo "📝 Test 5: Malformed JSON payload"
echo "Expected: 400 Bad Request"
echo ""

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"invalid json')

if [ "$HTTP_CODE" = "400" ]; then
  echo "✅ PASS - Correctly rejected malformed JSON (400)"
else
  echo "⚠️  Got HTTP $HTTP_CODE (expected 400)"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🏁 Test Suite Complete"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Security Checklist:"
echo ""
echo "  [ ] Requests without signature are rejected (401)"
echo "  [ ] Invalid signatures are rejected (401)"
echo "  [ ] Valid signatures are accepted (200)"
echo "  [ ] Rate limiting prevents abuse (429)"
echo "  [ ] Malformed payloads are rejected (400)"
echo ""
echo "💡 Next Steps:"
echo "  1. If any tests show VULNERABLE, add WEBHOOK_SECRET to Supabase"
echo "  2. Update webhook handler with security code"
echo "  3. Configure Evolution API to send signatures"
echo "  4. Re-run this test to verify"
echo ""
