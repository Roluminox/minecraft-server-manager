# =============================================================================
# CONFIGURATION PARE-FEU POUR TAILSCALE
# =============================================================================
# Ce script configure le pare-feu Windows pour:
# - AUTORISER le port 25565 sur l'interface Tailscale (100.x.x.x)
# - BLOQUER le port 25565 sur toutes les autres interfaces
#
# Exécuter en tant qu'Administrateur!
# =============================================================================

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   CONFIGURATION PARE-FEU TAILSCALE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# Vérifier que Tailscale est installé et connecté
Write-Host "[1/4] Vérification de Tailscale..." -ForegroundColor Cyan

try {
    $tailscaleIp = (tailscale ip -4 2>$null).Trim()
    if (-not $tailscaleIp) {
        throw "Non connecté"
    }
    Write-Host "      IP Tailscale: $tailscaleIp" -ForegroundColor Green
} catch {
    Write-Host "      ERREUR: Tailscale non installé ou non connecté!" -ForegroundColor Red
    Write-Host "      Installe Tailscale: https://tailscale.com/download/windows" -ForegroundColor Yellow
    exit 1
}

# Supprimer les anciennes règles si elles existent
Write-Host "[2/4] Nettoyage des anciennes règles..." -ForegroundColor Cyan

$rulesToRemove = @(
    "Minecraft Server - Block Public",
    "Minecraft Server - Allow Tailscale"
)

foreach ($ruleName in $rulesToRemove) {
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        Remove-NetFirewallRule -DisplayName $ruleName
        Write-Host "      Supprimée: $ruleName" -ForegroundColor Yellow
    }
}

# Créer la règle de blocage sur toutes les interfaces
Write-Host "[3/4] Création de la règle de blocage (public)..." -ForegroundColor Cyan

New-NetFirewallRule -DisplayName "Minecraft Server - Block Public" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 25565 `
    -Action Block `
    -Profile Any `
    -Description "Bloque le port Minecraft sur les interfaces publiques" | Out-Null

Write-Host "      Règle de blocage créée" -ForegroundColor Green

# Créer la règle d'autorisation pour Tailscale (priorité plus haute)
Write-Host "[4/4] Création de la règle d'autorisation (Tailscale)..." -ForegroundColor Cyan

# Trouver le subnet Tailscale (généralement 100.64.0.0/10)
New-NetFirewallRule -DisplayName "Minecraft Server - Allow Tailscale" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 25565 `
    -RemoteAddress "100.64.0.0/10" `
    -Action Allow `
    -Profile Any `
    -Description "Autorise le port Minecraft uniquement depuis le réseau Tailscale" | Out-Null

Write-Host "      Règle Tailscale créée (100.64.0.0/10)" -ForegroundColor Green

# Résumé
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   CONFIGURATION TERMINÉE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Résumé des règles:" -ForegroundColor Cyan
Write-Host "  [BLOCK] Port 25565 - Toutes les interfaces" -ForegroundColor Red
Write-Host "  [ALLOW] Port 25565 - Réseau Tailscale (100.64.0.0/10)" -ForegroundColor Green
Write-Host ""
Write-Host "Tes amis peuvent se connecter à:" -ForegroundColor Cyan
Write-Host "  ${tailscaleIp}:25565" -ForegroundColor Yellow
Write-Host ""
Write-Host "Vérification des règles:" -ForegroundColor Gray
Write-Host "  Get-NetFirewallRule -DisplayName 'Minecraft Server*' | Format-Table" -ForegroundColor Gray
Write-Host ""
