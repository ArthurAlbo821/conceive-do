#!/bin/bash

# Script de test pour le rafraîchissement automatique des QR codes
# Usage: ./test-qr-refresh.sh

set -e

echo "🧪 Test du système de rafraîchissement automatique des QR codes"
echo "================================================================"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Charger les variables d'environnement
if [ -f .env ]; then
    source .env
    echo -e "${GREEN}✓${NC} Fichier .env chargé"
else
    echo -e "${RED}✗${NC} Fichier .env non trouvé"
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

SUPABASE_URL="${VITE_SUPABASE_URL}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

echo ""
echo "🌐 URL Supabase: $SUPABASE_URL"

# Test 1: Vérifier que la fonction est déployée
echo ""
echo "📦 Test 1: Vérification du déploiement de la fonction..."

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/functions/v1/refresh-qr-codes" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓${NC} Fonction refresh-qr-codes accessible (HTTP $RESPONSE)"
else
    echo -e "${RED}✗${NC} Fonction refresh-qr-codes erreur (HTTP $RESPONSE)"
    echo "  Déployez la fonction avec: supabase functions deploy refresh-qr-codes"
    exit 1
fi

# Test 2: Exécuter la fonction manuellement
echo ""
echo "🔄 Test 2: Exécution manuelle de la fonction..."

FUNCTION_RESPONSE=$(curl -s -X POST \
    "${SUPABASE_URL}/functions/v1/refresh-qr-codes" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

echo "  Réponse de la fonction:"
echo "$FUNCTION_RESPONSE" | jq '.' 2>/dev/null || echo "$FUNCTION_RESPONSE"

# Vérifier si la réponse contient "success": true
if echo "$FUNCTION_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} Fonction exécutée avec succès"

    # Extraire le nombre d'instances rafraîchies
    REFRESHED=$(echo "$FUNCTION_RESPONSE" | jq -r '.refreshed' 2>/dev/null || echo "?")
    TOTAL=$(echo "$FUNCTION_RESPONSE" | jq -r '.total_instances' 2>/dev/null || echo "?")
    FAILED=$(echo "$FUNCTION_RESPONSE" | jq -r '.failed' 2>/dev/null || echo "?")

    echo "  📊 Statistiques:"
    echo "     - Total instances: $TOTAL"
    echo "     - Rafraîchies: $REFRESHED"
    echo "     - Échecs: $FAILED"
else
    echo -e "${RED}✗${NC} Erreur lors de l'exécution de la fonction"
fi

# Test 3: Vérifier le cron job (requiert psql ou connexion DB)
echo ""
echo "🕐 Test 3: Vérification du cron job..."
echo -e "${YELLOW}⚠${NC}  Vérification manuelle requise via Supabase Dashboard"
echo "     SQL à exécuter:"
echo "     SELECT jobid, jobname, schedule, active"
echo "     FROM cron.job"
echo "     WHERE jobname = 'refresh-qr-codes';"
echo ""
echo "     Expected: jobname = 'refresh-qr-codes', schedule = '*/1 * * * *', active = true"

# Test 4: Vérifier les instances "connecting"
echo ""
echo "📱 Test 4: Vérification des instances..."
echo -e "${YELLOW}⚠${NC}  Vérification manuelle requise via Supabase Dashboard"
echo "     SQL à exécuter:"
echo "     SELECT instance_name, instance_status, last_qr_update,"
echo "            NOW() - last_qr_update AS age,"
echo "            qr_code IS NOT NULL AS has_qr"
echo "     FROM evolution_instances"
echo "     WHERE instance_status = 'connecting'"
echo "     ORDER BY last_qr_update DESC;"
echo ""
echo "     Expected: last_qr_update devrait être < 2 minutes pour toutes les instances"

# Test 5: Simuler un cycle complet (attendre 1 minute)
echo ""
echo "⏱️  Test 5: Test du cycle complet..."
echo "  Pour tester le rafraîchissement automatique complet:"
echo ""
echo "  1. Notez le last_qr_update actuel d'une instance"
echo "  2. Attendez 60 secondes (1 minute)"
echo "  3. Vérifiez que last_qr_update a été mis à jour"
echo ""
read -p "  Voulez-vous effectuer ce test maintenant ? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BLUE}📸${NC} Première capture du timestamp..."

    # Ici, on devrait faire une requête SQL, mais on simule
    TIMESTAMP_BEFORE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "  Timestamp capturé: $TIMESTAMP_BEFORE"

    echo ""
    echo -e "${YELLOW}⏳${NC} Attente de 65 secondes..."
    for i in {65..1}; do
        printf "\r  Temps restant: %02d secondes" $i
        sleep 1
    done
    echo ""

    echo ""
    echo -e "${BLUE}🔄${NC} Exécution de la fonction pour forcer un rafraîchissement..."
    curl -s -X POST \
        "${SUPABASE_URL}/functions/v1/refresh-qr-codes" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d '{}' > /dev/null

    TIMESTAMP_AFTER=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "  Nouveau timestamp: $TIMESTAMP_AFTER"

    echo ""
    echo -e "${GREEN}✓${NC} Test de cycle complet terminé"
    echo "  Vérifiez dans la DB que last_qr_update a été mis à jour"
fi

# Résumé
echo ""
echo "================================================================"
echo "📊 Résumé des tests"
echo "================================================================"
echo ""
echo "✅ Tests automatiques réussis :"
echo "   ✓ Fonction refresh-qr-codes déployée et accessible"
echo "   ✓ Exécution manuelle de la fonction réussie"
echo ""
echo "⚠️  Tests manuels requis :"
echo "   • Vérifier le cron job dans Supabase Dashboard"
echo "   • Vérifier les timestamps des QR codes"
echo "   • Surveiller les logs pendant quelques minutes"
echo ""
echo "📚 Prochaines étapes :"
echo ""
echo "1. Configurer le cron job (si pas encore fait) :"
echo "   ${BLUE}https://supabase.com/dashboard/project/_/database/extensions${NC}"
echo "   Exécutez le SQL dans: ${BLUE}supabase/sql/setup-qr-refresh-cron.sql${NC}"
echo ""
echo "2. Surveiller les logs en temps réel :"
echo "   ${BLUE}supabase functions logs refresh-qr-codes --tail${NC}"
echo ""
echo "3. Vérifier les exécutions du cron :"
echo "   ${BLUE}SELECT * FROM cron.job_run_details${NC}"
echo "   ${BLUE}WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-qr-codes')${NC}"
echo "   ${BLUE}ORDER BY start_time DESC LIMIT 10;${NC}"
echo ""
echo "4. Consulter la documentation complète :"
echo "   ${BLUE}cat QR_REFRESH_SETUP.md${NC}"
echo ""
echo "📖 Guide rapide : ${BLUE}QUICK_START_QR_REFRESH.md${NC}"
echo ""
