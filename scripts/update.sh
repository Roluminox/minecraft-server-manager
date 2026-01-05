#!/bin/bash
# =============================================================================
# SCRIPT DE MISE À JOUR - Minecraft Server (Linux/macOS)
# =============================================================================
# Usage: ./scripts/update.sh
# Options: --no-backup, --force
# =============================================================================

set -e

# Configuration
CONTAINER_NAME="minecraft-server"
NO_BACKUP=false
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-backup) NO_BACKUP=true; shift ;;
        --force) FORCE=true; shift ;;
        *) shift ;;
    esac
done

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo -e "${MAGENTA}========================================${NC}"
echo -e "${MAGENTA}   MISE À JOUR SERVEUR MINECRAFT${NC}"
echo -e "${MAGENTA}========================================${NC}"
echo ""

# Vérifier l'image actuelle
info "Image actuelle:"
current_image=$(docker inspect --format='{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || echo "non trouvé")
echo "  $current_image"

# Vérifier les mises à jour
info "Vérification des mises à jour..."
docker compose pull

info "Nouvelles images téléchargées"

if [ "$FORCE" != "true" ]; then
    echo ""
    read -p "Appliquer la mise à jour? (oui/non): " confirm
    if [ "$confirm" != "oui" ]; then
        info "Mise à jour annulée."
        exit 0
    fi
fi

# Backup avant mise à jour
if [ "$NO_BACKUP" != "true" ]; then
    info "Création d'un backup avant mise à jour..."
    "$(dirname "$0")/backup.sh"
fi

# Notifier les joueurs
info "Notification aux joueurs..."
docker exec "$CONTAINER_NAME" rcon-cli "say Redémarrage du serveur dans 30 secondes pour mise à jour!" 2>/dev/null || true
sleep 10
docker exec "$CONTAINER_NAME" rcon-cli "say Redémarrage dans 20 secondes..." 2>/dev/null || true
sleep 10
docker exec "$CONTAINER_NAME" rcon-cli "say Redémarrage dans 10 secondes..." 2>/dev/null || true
sleep 5
docker exec "$CONTAINER_NAME" rcon-cli "say Redémarrage dans 5 secondes..." 2>/dev/null || true
sleep 5

# Arrêter proprement
info "Arrêt du serveur..."
docker exec "$CONTAINER_NAME" rcon-cli "stop" 2>/dev/null || true
sleep 10

# Recréer avec la nouvelle image
info "Démarrage avec la nouvelle image..."
docker compose up -d --force-recreate

# Attendre que le serveur soit prêt
info "Attente du démarrage..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    sleep 5
    attempt=$((attempt + 1))
    health=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")

    if [ "$health" = "healthy" ]; then
        break
    fi

    echo -n "."
done

echo ""

if [ "$health" = "healthy" ]; then
    success "Serveur démarré et fonctionnel!"

    # Afficher la version
    version=$(docker exec "$CONTAINER_NAME" cat /data/version.json 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || echo "inconnue")
    info "Version Minecraft: $version"
else
    warn "Le serveur n'est pas encore 'healthy'. Vérifie les logs:"
    echo "  docker compose logs -f minecraft"
fi

echo ""
success "Mise à jour terminée!"
echo ""
