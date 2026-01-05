# =============================================================================
# SCRIPT DE STATUT - Minecraft Server (Windows PowerShell)
# =============================================================================
# Usage: .\scripts\status.ps1
# =============================================================================

$ContainerName = "minecraft-server"

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   STATUT SERVEUR MINECRAFT" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# Vérifier si le container existe
$containerExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^$ContainerName$"

if (-not $containerExists) {
    Write-Host "[Container] " -NoNewline -ForegroundColor Cyan
    Write-Host "Non trouvé (jamais démarré?)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pour démarrer: docker compose up -d" -ForegroundColor Gray
    exit 0
}

# Statut container
$status = docker inspect $ContainerName --format='{{.State.Status}}' 2>$null
$health = docker inspect $ContainerName --format='{{.State.Health.Status}}' 2>$null

Write-Host "[Container] " -NoNewline -ForegroundColor Cyan
switch ($status) {
    "running" { Write-Host "Running" -NoNewline -ForegroundColor Green }
    "exited" { Write-Host "Stopped" -NoNewline -ForegroundColor Red }
    default { Write-Host $status -NoNewline -ForegroundColor Yellow }
}

Write-Host " | Health: " -NoNewline
switch ($health) {
    "healthy" { Write-Host "Healthy" -ForegroundColor Green }
    "unhealthy" { Write-Host "Unhealthy" -ForegroundColor Red }
    "starting" { Write-Host "Starting..." -ForegroundColor Yellow }
    default { Write-Host ($health ?? "N/A") -ForegroundColor Gray }
}

if ($status -eq "running") {
    # Ressources
    Write-Host ""
    Write-Host "[Ressources]" -ForegroundColor Cyan
    $stats = docker stats $ContainerName --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}" 2>$null
    if ($stats) {
        $parts = $stats -split "\|"
        Write-Host "  CPU: $($parts[0])"
        Write-Host "  RAM: $($parts[1])"
        Write-Host "  Net: $($parts[2])"
    }

    # Joueurs
    Write-Host ""
    Write-Host "[Joueurs]" -ForegroundColor Cyan
    $players = docker exec $ContainerName rcon-cli list 2>$null
    if ($players) {
        Write-Host "  $players"
    } else {
        Write-Host "  (RCON non disponible)" -ForegroundColor Gray
    }

    # Version
    Write-Host ""
    Write-Host "[Version]" -ForegroundColor Cyan
    try {
        $version = docker exec $ContainerName cat /data/version.json 2>$null | ConvertFrom-Json
        if ($version.name) {
            Write-Host "  Minecraft $($version.name)"
        }
    } catch {
        Write-Host "  (Non disponible)" -ForegroundColor Gray
    }
}

# Dernier backup
Write-Host ""
Write-Host "[Backups]" -ForegroundColor Cyan
$lastBackup = Get-ChildItem ".\backups\backup_*.zip" -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending |
              Select-Object -First 1

if ($lastBackup) {
    $age = (Get-Date) - $lastBackup.LastWriteTime
    $ageStr = if ($age.Days -gt 0) { "$($age.Days)j" } elseif ($age.Hours -gt 0) { "$($age.Hours)h" } else { "$($age.Minutes)min" }
    Write-Host "  Dernier: $($lastBackup.Name)"
    Write-Host "  Age: $ageStr"
} else {
    Write-Host "  Aucun backup trouvé" -ForegroundColor Yellow
}

# IP Tailscale
Write-Host ""
Write-Host "[Réseau]" -ForegroundColor Cyan
try {
    $tailscaleIp = tailscale ip -4 2>$null
    if ($tailscaleIp) {
        Write-Host "  Tailscale: ${tailscaleIp}:25565" -ForegroundColor Green
    } else {
        Write-Host "  Tailscale: Non connecté" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Tailscale: Non installé" -ForegroundColor Gray
}

Write-Host ""
