# =============================================================================
# SCRIPT DE BACKUP - Minecraft Server (Windows PowerShell)
# =============================================================================
# Usage: .\scripts\backup.ps1
# =============================================================================

param(
    [string]$BackupDir = ".\backups",
    [int]$KeepBackups = 7
)

$ErrorActionPreference = "Stop"

# Couleurs
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Variables
$ContainerName = "minecraft-server"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$BackupName = "backup_$Timestamp"

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   BACKUP SERVEUR MINECRAFT" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# Créer le dossier de backup si nécessaire
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    Write-Info "Dossier de backup créé: $BackupDir"
}

# Vérifier que le container existe
$containerExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^$ContainerName$"
if (-not $containerExists) {
    Write-Err "Container '$ContainerName' non trouvé!"
    exit 1
}

# Vérifier si le container tourne
$containerRunning = docker ps --format "{{.Names}}" | Select-String -Pattern "^$ContainerName$"

try {
    if ($containerRunning) {
        Write-Info "Notification au serveur du backup..."
        docker exec $ContainerName rcon-cli "say Backup en cours..." 2>$null

        Write-Info "Désactivation de la sauvegarde automatique..."
        docker exec $ContainerName rcon-cli "save-off" 2>$null

        Write-Info "Forçage de la sauvegarde du monde..."
        docker exec $ContainerName rcon-cli "save-all" 2>$null
        Start-Sleep -Seconds 5
    }

    Write-Info "Création de l'archive..."

    # Copier les données du volume vers un dossier temporaire
    $TempDir = Join-Path $env:TEMP $BackupName
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    # Utiliser docker cp pour extraire les données
    docker cp "${ContainerName}:/data" "$TempDir"

    # Créer l'archive ZIP
    $ZipPath = Join-Path $BackupDir "$BackupName.zip"
    Compress-Archive -Path "$TempDir\data\*" -DestinationPath $ZipPath -Force

    # Nettoyer le dossier temp
    Remove-Item -Path $TempDir -Recurse -Force

    # Taille du backup
    $BackupSize = (Get-Item $ZipPath).Length / 1MB
    Write-Success "Backup créé: $ZipPath ({0:N2} MB)" -f $BackupSize

    if ($containerRunning) {
        Write-Info "Réactivation de la sauvegarde automatique..."
        docker exec $ContainerName rcon-cli "save-on" 2>$null
        docker exec $ContainerName rcon-cli "say Backup terminé!" 2>$null
    }

    # Rotation des backups
    Write-Info "Rotation des backups (conservation: $KeepBackups)..."
    $OldBackups = Get-ChildItem -Path $BackupDir -Filter "backup_*.zip" |
                  Sort-Object LastWriteTime -Descending |
                  Select-Object -Skip $KeepBackups

    foreach ($old in $OldBackups) {
        Remove-Item $old.FullName -Force
        Write-Warn "Ancien backup supprimé: $($old.Name)"
    }

    Write-Host ""
    Write-Success "Backup terminé avec succès!"
    Write-Host ""

} catch {
    Write-Err "Erreur pendant le backup: $_"

    if ($containerRunning) {
        docker exec $ContainerName rcon-cli "save-on" 2>$null
    }

    exit 1
}
