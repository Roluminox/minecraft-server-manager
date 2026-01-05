# =============================================================================
# SCRIPT DE MISE À JOUR - Minecraft Server (Windows PowerShell)
# =============================================================================
# Usage: .\scripts\update.ps1
# =============================================================================

param(
    [switch]$NoBackup,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Couleurs
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Variables
$ContainerName = "minecraft-server"

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   MISE À JOUR SERVEUR MINECRAFT" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# Vérifier l'image actuelle
Write-Info "Image actuelle:"
$currentImage = docker inspect --format='{{.Config.Image}}' $ContainerName 2>$null
if ($currentImage) {
    Write-Host "  $currentImage"
} else {
    Write-Warn "Container non trouvé, première installation?"
}

# Vérifier les mises à jour disponibles
Write-Info "Vérification des mises à jour..."
docker compose pull

# Comparer les images
$newImageId = docker compose images -q 2>$null
Write-Info "Nouvelles images téléchargées"

if (-not $Force) {
    Write-Host ""
    $confirm = Read-Host "Appliquer la mise à jour? (oui/non)"
    if ($confirm -ne "oui") {
        Write-Info "Mise à jour annulée."
        exit 0
    }
}

# Backup avant mise à jour
if (-not $NoBackup) {
    Write-Info "Création d'un backup avant mise à jour..."
    & "$PSScriptRoot\backup.ps1"
}

# Notifier les joueurs
Write-Info "Notification aux joueurs..."
docker exec $ContainerName rcon-cli "say Redémarrage du serveur dans 30 secondes pour mise à jour!" 2>$null
Start-Sleep -Seconds 10
docker exec $ContainerName rcon-cli "say Redémarrage dans 20 secondes..." 2>$null
Start-Sleep -Seconds 10
docker exec $ContainerName rcon-cli "say Redémarrage dans 10 secondes..." 2>$null
Start-Sleep -Seconds 5
docker exec $ContainerName rcon-cli "say Redémarrage dans 5 secondes..." 2>$null
Start-Sleep -Seconds 5

# Arrêter proprement
Write-Info "Arrêt du serveur..."
docker exec $ContainerName rcon-cli "stop" 2>$null
Start-Sleep -Seconds 10

# Recréer avec la nouvelle image
Write-Info "Démarrage avec la nouvelle image..."
docker compose up -d --force-recreate

# Attendre que le serveur soit prêt
Write-Info "Attente du démarrage..."
$maxAttempts = 30
$attempt = 0

do {
    Start-Sleep -Seconds 5
    $attempt++
    $health = docker inspect --format='{{.State.Health.Status}}' $ContainerName 2>$null

    if ($health -eq "healthy") {
        break
    }

    Write-Host "." -NoNewline
} while ($attempt -lt $maxAttempts)

Write-Host ""

if ($health -eq "healthy") {
    Write-Success "Serveur démarré et fonctionnel!"

    # Afficher la version
    $version = docker exec $ContainerName cat /data/version.json 2>$null | ConvertFrom-Json
    if ($version) {
        Write-Info "Version Minecraft: $($version.name)"
    }
} else {
    Write-Warn "Le serveur n'est pas encore 'healthy'. Vérifie les logs:"
    Write-Host "  docker compose logs -f minecraft"
}

Write-Host ""
Write-Success "Mise à jour terminée!"
Write-Host ""
