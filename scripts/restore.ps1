# =============================================================================
# SCRIPT DE RESTAURATION - Minecraft Server (Windows PowerShell)
# =============================================================================
# Usage: .\scripts\restore.ps1 -BackupFile "backup_2024-01-15_143022.zip"
# =============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$BackupDir = ".\backups"
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
Write-Host "   RESTAURATION SERVEUR MINECRAFT" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# Construire le chemin complet
$BackupPath = if ([System.IO.Path]::IsPathRooted($BackupFile)) {
    $BackupFile
} else {
    Join-Path $BackupDir $BackupFile
}

# Vérifier que le backup existe
if (-not (Test-Path $BackupPath)) {
    Write-Err "Fichier de backup non trouvé: $BackupPath"
    Write-Info "Backups disponibles:"
    Get-ChildItem -Path $BackupDir -Filter "backup_*.zip" | ForEach-Object { Write-Host "  - $($_.Name)" }
    exit 1
}

Write-Warn "ATTENTION: Cette opération va remplacer toutes les données actuelles!"
Write-Warn "Backup à restaurer: $BackupPath"
Write-Host ""
$confirm = Read-Host "Continuer? (oui/non)"

if ($confirm -ne "oui") {
    Write-Info "Restauration annulée."
    exit 0
}

try {
    # Arrêter le serveur
    Write-Info "Arrêt du serveur..."
    docker compose down 2>$null
    Start-Sleep -Seconds 5

    # Créer un backup de sécurité
    Write-Info "Création d'un backup de sécurité..."
    $SafetyBackup = ".\backups\pre-restore_$(Get-Date -Format 'yyyy-MM-dd_HHmmss').zip"

    # Vérifier si le volume existe
    $volumeExists = docker volume ls --format "{{.Name}}" | Select-String -Pattern "^minecraft-data$"

    if ($volumeExists) {
        # Extraire les données actuelles
        docker run --rm -v minecraft-data:/data -v "${PWD}\backups:/backup" alpine tar czf "/backup/pre-restore_temp.tar.gz" -C /data .
        Write-Info "Backup de sécurité créé"
    }

    # Supprimer l'ancien volume
    Write-Info "Suppression des anciennes données..."
    docker volume rm minecraft-data 2>$null

    # Recréer le volume
    docker volume create minecraft-data

    # Extraire le backup dans un dossier temp
    $TempDir = Join-Path $env:TEMP "mc-restore-$(Get-Date -Format 'yyyyMMddHHmmss')"
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    Write-Info "Extraction du backup..."
    Expand-Archive -Path $BackupPath -DestinationPath $TempDir -Force

    # Copier vers le volume via un container temporaire
    Write-Info "Copie des données vers le volume..."
    docker run --rm -v minecraft-data:/data -v "${TempDir}:/backup" alpine sh -c "cp -a /backup/. /data/"

    # Nettoyer
    Remove-Item -Path $TempDir -Recurse -Force

    # Redémarrer le serveur
    Write-Info "Redémarrage du serveur..."
    docker compose up -d

    Write-Host ""
    Write-Success "Restauration terminée!"
    Write-Info "Vérifie les logs: docker compose logs -f minecraft"
    Write-Host ""

} catch {
    Write-Err "Erreur pendant la restauration: $_"
    exit 1
}
