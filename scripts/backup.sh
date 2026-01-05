#!/bin/bash
# =============================================================================
# SCRIPT DE BACKUP - Minecraft Server (Linux/macOS)
# =============================================================================
# Usage: ./scripts/backup.sh
# =============================================================================

set -e

# Configuration
BACKUP_DIR="./backups"
KEEP_BACKUPS=7
CONTAINER_NAME="minecraft-server"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_NAME="backup_${TIMESTAMP}"

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
echo -e "${MAGENTA}   BACKUP SERVEUR MINECRAFT${NC}"
echo -e "${MAGENTA}========================================${NC}"
echo ""

# Créer le dossier de backup
mkdir -p "$BACKUP_DIR"

# Vérifier que le container existe
if ! docker ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    error "Container '$CONTAINER_NAME' non trouvé!"
    exit 1
fi

# Vérifier si le container tourne
CONTAINER_RUNNING=$(docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$" && echo "yes" || echo "no")

cleanup() {
    if [ "$CONTAINER_RUNNING" = "yes" ]; then
        docker exec "$CONTAINER_NAME" rcon-cli "save-on" 2>/dev/null || true
    fi
}
trap cleanup EXIT

if [ "$CONTAINER_RUNNING" = "yes" ]; then
    info "Notification au serveur du backup..."
    docker exec "$CONTAINER_NAME" rcon-cli "say Backup en cours..." 2>/dev/null || true

    info "Désactivation de la sauvegarde automatique..."
    docker exec "$CONTAINER_NAME" rcon-cli "save-off" 2>/dev/null || true

    info "Forçage de la sauvegarde du monde..."
    docker exec "$CONTAINER_NAME" rcon-cli "save-all" 2>/dev/null || true
    sleep 5
fi

info "Création de l'archive..."

# Créer dossier temporaire
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR; cleanup" EXIT

# Copier les données
docker cp "${CONTAINER_NAME}:/data" "$TEMP_DIR/"

# Créer l'archive
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
tar -czf "$BACKUP_PATH" -C "$TEMP_DIR/data" .

# Taille du backup
BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
success "Backup créé: $BACKUP_PATH ($BACKUP_SIZE)"

if [ "$CONTAINER_RUNNING" = "yes" ]; then
    info "Réactivation de la sauvegarde automatique..."
    docker exec "$CONTAINER_NAME" rcon-cli "save-on" 2>/dev/null || true
    docker exec "$CONTAINER_NAME" rcon-cli "say Backup terminé!" 2>/dev/null || true
fi

# Rotation des backups
info "Rotation des backups (conservation: $KEEP_BACKUPS)..."
ls -t "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while read old_backup; do
    rm -f "$old_backup"
    warn "Ancien backup supprimé: $(basename "$old_backup")"
done

echo ""
success "Backup terminé avec succès!"
echo ""
