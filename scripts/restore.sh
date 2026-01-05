#!/bin/bash
# =============================================================================
# SCRIPT DE RESTAURATION - Minecraft Server (Linux/macOS)
# =============================================================================
# Usage: ./scripts/restore.sh backup_2024-01-15_143022.tar.gz
# =============================================================================

set -e

# Configuration
BACKUP_DIR="./backups"
CONTAINER_NAME="minecraft-server"

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
echo -e "${MAGENTA}   RESTAURATION SERVEUR MINECRAFT${NC}"
echo -e "${MAGENTA}========================================${NC}"
echo ""

# Vérifier les arguments
if [ -z "$1" ]; then
    error "Usage: $0 <backup_file.tar.gz>"
    info "Backups disponibles:"
    ls -1 "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | while read f; do
        echo "  - $(basename "$f")"
    done
    exit 1
fi

# Construire le chemin
if [[ "$1" = /* ]]; then
    BACKUP_PATH="$1"
else
    BACKUP_PATH="${BACKUP_DIR}/$1"
fi

# Vérifier que le backup existe
if [ ! -f "$BACKUP_PATH" ]; then
    error "Fichier de backup non trouvé: $BACKUP_PATH"
    exit 1
fi

warn "ATTENTION: Cette opération va remplacer toutes les données actuelles!"
warn "Backup à restaurer: $BACKUP_PATH"
echo ""
read -p "Continuer? (oui/non): " confirm

if [ "$confirm" != "oui" ]; then
    info "Restauration annulée."
    exit 0
fi

# Arrêter le serveur
info "Arrêt du serveur..."
docker compose down 2>/dev/null || true
sleep 5

# Créer un backup de sécurité
info "Création d'un backup de sécurité..."
SAFETY_BACKUP="${BACKUP_DIR}/pre-restore_$(date +%Y-%m-%d_%H%M%S).tar.gz"

if docker volume ls --format "{{.Name}}" | grep -q "^minecraft-data$"; then
    docker run --rm \
        -v minecraft-data:/data \
        -v "$(pwd)/backups:/backup" \
        alpine tar czf "/backup/$(basename "$SAFETY_BACKUP")" -C /data .
    info "Backup de sécurité créé: $SAFETY_BACKUP"
fi

# Supprimer l'ancien volume
info "Suppression des anciennes données..."
docker volume rm minecraft-data 2>/dev/null || true

# Recréer le volume
docker volume create minecraft-data

# Restaurer les données
info "Extraction du backup..."
docker run --rm \
    -v minecraft-data:/data \
    -v "$(cd "$(dirname "$BACKUP_PATH")" && pwd):/backup:ro" \
    alpine tar xzf "/backup/$(basename "$BACKUP_PATH")" -C /data

# Redémarrer le serveur
info "Redémarrage du serveur..."
docker compose up -d

echo ""
success "Restauration terminée!"
info "Vérifie les logs: docker compose logs -f minecraft"
echo ""
