#!/bin/bash

# Script de test pour la configuration automatique des webhooks Evolution API
# Usage: ./test-webhook-setup.sh

set -e

echo "🧪 Test de la configuration automatique des webhooks"
echo "=================================================="
echo ""

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Charger les variables d'environnement
if [ -f .env ]; then
    source .env
    echo -e "${GREEN}✓${NC} Fichier .env chargé"
else
    echo -e "${RED}✗${NC} Fichier .env non trouvé"
    echo "  Copiez .env.example vers .env et configurez vos variables"
    exit 1
fi

# Vérifier les variables requises
echo ""
echo "📋 Vérification des variables d'environnement..."
REQUIRED_VARS=(
    "VITE_SUPABASE_URL"
    "VITE_SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
)

ALL_VARS_SET=true
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}✗${NC} Variable manquante: $var"
        ALL_VARS_SET=false
    else
        echo -e "${GREEN}✓${NC} $var configurée"
    fi
done

if [ "$ALL_VARS_SET" = false ]; then
    echo ""
    echo -e "${RED}Certaines variables d'environnement sont manquantes${NC}"
    exit 1
fi

# Extraire l'URL de base de Supabase
SUPABASE_URL="${VITE_SUPABASE_URL}"
echo ""
echo "🌐 URL Supabase: $SUPABASE_URL"

# Test 1: Vérifier que la migration est appliquée
echo ""
echo "📊 Test 1: Vérification de la migration..."
echo "  Vérification de la table evolution_instance_creation_queue..."

# Note: Ce test nécessite psql ou une connexion directe à la DB
# Pour l'instant, on le saute dans le script bash
echo -e "${YELLOW}⚠${NC}  Vérification manuelle requise via Supabase Dashboard"
echo "     SQL à exécuter: SELECT COUNT(*) FROM evolution_instance_creation_queue;"

# Test 2: Vérifier que les Edge Functions sont déployées
echo ""
echo "🚀 Test 2: Vérification des Edge Functions..."

# Test process-evolution-queue
echo "  Test de process-evolution-queue..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/functions/v1/process-evolution-queue" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓${NC} process-evolution-queue fonctionne (HTTP $RESPONSE)"
else
    echo -e "${RED}✗${NC} process-evolution-queue erreur (HTTP $RESPONSE)"
fi

# Test create-evolution-instance (devrait retourner 401 sans auth valide)
echo "  Test de create-evolution-instance..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/functions/v1/create-evolution-instance" \
    -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓${NC} create-evolution-instance accessible (HTTP $RESPONSE)"
else
    echo -e "${RED}✗${NC} create-evolution-instance erreur (HTTP $RESPONSE)"
fi

# Test 3: Simuler un appel de queue
echo ""
echo "🔄 Test 3: Simulation d'un traitement de queue..."
echo "  Appel de process-evolution-queue avec service role..."

QUEUE_RESPONSE=$(curl -s -X POST \
    "${SUPABASE_URL}/functions/v1/process-evolution-queue" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

echo "  Réponse:"
echo "$QUEUE_RESPONSE" | jq '.' 2>/dev/null || echo "$QUEUE_RESPONSE"

# Vérifier si la réponse contient "success"
if echo "$QUEUE_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓${NC} La fonction de traitement de queue répond correctement"
else
    echo -e "${RED}✗${NC} Problème avec la fonction de traitement de queue"
fi

# Test 4: Vérifier les triggers
echo ""
echo "🔧 Test 4: Vérification des triggers..."
echo -e "${YELLOW}⚠${NC}  Vérification manuelle requise via Supabase Dashboard"
echo "     SQL à exécuter:"
echo "     SELECT tgname, tgenabled FROM pg_trigger"
echo "     WHERE tgname = 'on_profile_created_create_evolution_instance';"

# Résumé
echo ""
echo "=================================================="
echo "📊 Résumé des tests"
echo "=================================================="
echo ""
echo "✅ Étapes suivantes:"
echo ""
echo "1. Vérifier manuellement les triggers dans Supabase Dashboard:"
echo "   ${BLUE}https://supabase.com/dashboard/project/_/database/triggers${NC}"
echo ""
echo "2. Configurer le cron job (voir SETUP_AUTO_WEBHOOKS.md):"
echo "   ${BLUE}https://supabase.com/dashboard/project/_/database/extensions${NC}"
echo ""
echo "3. Créer un utilisateur test et vérifier:"
echo "   - Entrée créée dans evolution_instance_creation_queue"
echo "   - Traitement après < 5 minutes"
echo "   - Instance créée dans evolution_instances"
echo "   - Webhooks configurés"
echo ""
echo "4. Surveiller les logs:"
echo "   ${BLUE}https://supabase.com/dashboard/project/_/functions${NC}"
echo ""
echo "📚 Documentation complète: ${BLUE}SETUP_AUTO_WEBHOOKS.md${NC}"
echo ""
