#!/bin/bash

# Script de vérification de la configuration Supabase
# Usage: ./scripts/verify-supabase-config.sh

set -e

echo "=============================================="
echo "🔍 Supabase Configuration Verification"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

SUPABASE_URL="${VITE_SUPABASE_URL}"
SUPABASE_ANON_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY}"
PROJECT_ID="${VITE_SUPABASE_PROJECT_ID}"

# Check if variables are set
echo "📋 Checking Environment Variables..."
echo ""

if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}❌ VITE_SUPABASE_URL is not set${NC}"
    exit 1
else
    echo -e "${GREEN}✅ VITE_SUPABASE_URL:${NC} ${SUPABASE_URL:0:35}..."
fi

if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}❌ VITE_SUPABASE_PUBLISHABLE_KEY is not set${NC}"
    exit 1
else
    echo -e "${GREEN}✅ VITE_SUPABASE_PUBLISHABLE_KEY:${NC} ${SUPABASE_ANON_KEY:0:35}..."
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  VITE_SUPABASE_PROJECT_ID is not set${NC}"
else
    echo -e "${GREEN}✅ VITE_SUPABASE_PROJECT_ID:${NC} $PROJECT_ID"
fi

echo ""
echo "=============================================="
echo "🧪 Testing Supabase Connection"
echo "=============================================="
echo ""

# Test 1: Basic connectivity
echo "Test 1: Basic Connectivity..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/rest/v1/" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY")

if [ "$HEALTH_CHECK" == "200" ]; then
    echo -e "${GREEN}✅ Supabase REST API is reachable${NC}"
else
    echo -e "${RED}❌ Supabase REST API returned status: $HEALTH_CHECK${NC}"
    echo -e "${YELLOW}   This might indicate an invalid API key${NC}"
fi

echo ""

# Test 2: Auth endpoint
echo "Test 2: Auth Endpoint..."
AUTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/auth/v1/health" \
    -H "apikey: $SUPABASE_ANON_KEY")

if [ "$AUTH_CHECK" == "200" ]; then
    echo -e "${GREEN}✅ Supabase Auth API is reachable${NC}"
else
    echo -e "${RED}❌ Supabase Auth API returned status: $AUTH_CHECK${NC}"
fi

echo ""

# Test 3: Try to sign up (this will help detect URL configuration issues)
echo "Test 3: Testing Signup Endpoint (with test data)..."
TEST_EMAIL="test-$(date +%s)@example.com"
SIGNUP_RESPONSE=$(curl -s -w "\n%{http_code}" "$SUPABASE_URL/auth/v1/signup" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:8080" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"TestPassword123!\"}")

SIGNUP_BODY=$(echo "$SIGNUP_RESPONSE" | head -n -1)
SIGNUP_STATUS=$(echo "$SIGNUP_RESPONSE" | tail -n 1)

if [ "$SIGNUP_STATUS" == "200" ] || [ "$SIGNUP_STATUS" == "201" ]; then
    echo -e "${GREEN}✅ Signup endpoint works (status: $SIGNUP_STATUS)${NC}"
    echo -e "${YELLOW}   Note: A test user was created. You may want to delete it.${NC}"
elif [ "$SIGNUP_STATUS" == "422" ]; then
    # Check if it's a rate limit or validation error
    if echo "$SIGNUP_BODY" | grep -q "rate"; then
        echo -e "${YELLOW}⚠️  Rate limit reached (status: $SIGNUP_STATUS)${NC}"
        echo -e "   This is normal if you've been testing a lot"
    else
        echo -e "${GREEN}✅ Signup endpoint is reachable (status: $SIGNUP_STATUS)${NC}"
        echo -e "   Validation error is expected for test data"
    fi
elif [ "$SIGNUP_STATUS" == "401" ]; then
    echo -e "${RED}❌ Signup failed with 401 Unauthorized${NC}"
    echo -e "${YELLOW}   Possible causes:${NC}"
    echo -e "   1. Invalid API key"
    echo -e "   2. URL configuration in Supabase Dashboard"
    echo -e "   3. CORS issues"
    echo ""
    echo -e "${YELLOW}   Response:${NC}"
    echo "$SIGNUP_BODY" | head -n 5
else
    echo -e "${RED}❌ Signup endpoint returned status: $SIGNUP_STATUS${NC}"
    echo -e "${YELLOW}   Response:${NC}"
    echo "$SIGNUP_BODY" | head -n 5
fi

echo ""
echo "=============================================="
echo "📝 Configuration Recommendations"
echo "=============================================="
echo ""

# Get Vercel URL if possible
if command -v vercel &> /dev/null; then
    echo "🔗 Getting Vercel deployment URL..."
    VERCEL_URL=$(vercel ls 2>/dev/null | grep "Production" | awk '{print $2}' | head -n 1)
    if [ -n "$VERCEL_URL" ]; then
        echo -e "${GREEN}✅ Vercel Production URL found:${NC} https://$VERCEL_URL"
        echo ""
        echo "⚙️  Add this URL to Supabase Dashboard:"
        echo "   1. Go to: https://supabase.com/dashboard/project/$PROJECT_ID/auth/url-configuration"
        echo "   2. Set Site URL to: https://$VERCEL_URL"
        echo "   3. Add to Redirect URLs:"
        echo "      - https://$VERCEL_URL/dashboard"
        echo "      - https://$VERCEL_URL/auth"
        echo "      - https://$VERCEL_URL/"
        echo "      - https://$VERCEL_URL/**"
    else
        echo -e "${YELLOW}⚠️  No Vercel deployment found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Vercel CLI not installed (run: npm i -g vercel)${NC}"
fi

echo ""
echo "📚 For detailed configuration instructions, see:"
echo "   - SUPABASE_AUTH_CONFIG.md"
echo "   - TROUBLESHOOTING.md"
echo ""

# Check supabase CLI
echo "=============================================="
echo "🔧 Supabase CLI Status"
echo "=============================================="
echo ""

if command -v supabase &> /dev/null; then
    echo -e "${GREEN}✅ Supabase CLI is installed${NC}"

    # Check if project is linked
    if [ -f "supabase/.branches/_current_branch" ]; then
        CURRENT_PROJECT=$(cat supabase/.branches/_current_branch 2>/dev/null || echo "")
        if [ -n "$CURRENT_PROJECT" ]; then
            echo -e "${GREEN}✅ Project is linked to:${NC} $CURRENT_PROJECT"
        else
            echo -e "${YELLOW}⚠️  Project might not be linked${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Project is not linked${NC}"
        echo "   Run: supabase link --project-ref $PROJECT_ID"
    fi

    # Check secrets
    echo ""
    echo "Checking Supabase Edge Function secrets..."
    if supabase secrets list &> /dev/null; then
        SECRET_COUNT=$(supabase secrets list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
        if [ "$SECRET_COUNT" -gt 0 ]; then
            echo -e "${GREEN}✅ $SECRET_COUNT secrets configured${NC}"
            echo ""
            echo "Configured secrets:"
            supabase secrets list 2>/dev/null | head -n 10
        else
            echo -e "${YELLOW}⚠️  No secrets configured${NC}"
            echo "   Edge Functions may not work without secrets"
            echo "   See: TROUBLESHOOTING.md section 'Edge Functions'"
        fi
    else
        echo -e "${YELLOW}⚠️  Unable to list secrets (project might not be linked)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Supabase CLI not installed${NC}"
    echo "   Install: npm i supabase -D"
    echo "   Or globally: npm i -g supabase"
fi

echo ""
echo "=============================================="
echo "✅ Verification Complete"
echo "=============================================="
echo ""
