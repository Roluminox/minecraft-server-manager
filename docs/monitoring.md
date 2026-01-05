# Monitoring et Observabilité

Guide pour surveiller ton serveur Minecraft.

---

## Logs

### Voir les logs en temps réel

```powershell
# Windows
docker compose logs -f minecraft

# Dernières 100 lignes
docker compose logs --tail 100 minecraft
```

```bash
# Linux
docker compose logs -f minecraft
```

### Localisation des logs

Les logs sont stockés dans le volume Docker :

```powershell
# Accéder aux logs Minecraft
docker exec minecraft-server cat /data/logs/latest.log

# Lister les fichiers de logs
docker exec minecraft-server ls -la /data/logs/
```

### Logs Docker (JSON)

```powershell
# Windows - Trouver les logs Docker
docker inspect minecraft-server --format='{{.LogPath}}'
```

---

## Healthcheck

Le container a un healthcheck intégré qui vérifie que le serveur répond.

### Vérifier le statut

```powershell
docker inspect minecraft-server --format='{{.State.Health.Status}}'
# Résultats possibles: starting, healthy, unhealthy
```

### Historique des checks

```powershell
docker inspect minecraft-server --format='{{json .State.Health}}' | ConvertFrom-Json | Format-List
```

---

## Métriques Système

### Utilisation des ressources

```powershell
# Temps réel
docker stats minecraft-server

# Une seule mesure
docker stats minecraft-server --no-stream
```

### Espace disque des volumes

```powershell
docker system df -v
```

---

## Commandes Utiles en Jeu

Via la console RCON :

```powershell
# Ouvrir la console
docker exec -it minecraft-server rcon-cli

# Ou commande unique
docker exec minecraft-server rcon-cli list      # Joueurs connectés
docker exec minecraft-server rcon-cli tps       # Performance (TPS)
docker exec minecraft-server rcon-cli whitelist list
```

---

## Alertes Simples (Optionnel)

### Script de vérification (Windows)

Crée `scripts\healthcheck.ps1` :

```powershell
# Vérifie si le serveur est healthy
$health = docker inspect minecraft-server --format='{{.State.Health.Status}}' 2>$null

if ($health -ne "healthy") {
    # Envoyer une notification (exemple avec ntfy.sh)
    $body = "Minecraft server is $health!"
    Invoke-RestMethod -Uri "https://ntfy.sh/ton-topic-secret" -Method Post -Body $body

    # Ou simplement afficher
    Write-Host "ALERTE: Serveur Minecraft $health" -ForegroundColor Red
}
```

### Script de vérification (Linux)

Crée `scripts/healthcheck.sh` :

```bash
#!/bin/bash
health=$(docker inspect minecraft-server --format='{{.State.Health.Status}}' 2>/dev/null)

if [ "$health" != "healthy" ]; then
    # Notification via ntfy.sh (service gratuit)
    curl -d "Minecraft server is $health!" ntfy.sh/ton-topic-secret

    # Ou par email (si mailutils installé)
    # echo "Server unhealthy" | mail -s "Minecraft Alert" ton@email.com
fi
```

### Tâche planifiée (Windows)

```powershell
# Créer une tâche qui vérifie toutes les 5 minutes
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-File C:\Dev\Minecraft\scripts\healthcheck.ps1"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "MinecraftHealthCheck" -Action $action -Trigger $trigger
```

### Cron (Linux)

```bash
# Éditer crontab
crontab -e

# Ajouter (toutes les 5 minutes)
*/5 * * * * /chemin/vers/minecraft/scripts/healthcheck.sh
```

---

## Monitoring Avancé (Optionnel)

### Prometheus + Grafana

Pour un monitoring plus complet, tu peux ajouter Prometheus :

```yaml
# Ajouter au docker-compose.yml
services:
  # ... minecraft existant ...

  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    networks:
      - gameserver-net
    profiles:
      - monitoring  # Ne démarre qu'avec --profile monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    ports:
      - "127.0.0.1:3000:3000"
    networks:
      - gameserver-net
    profiles:
      - monitoring
```

Démarrer avec monitoring :
```powershell
docker compose --profile monitoring up -d
```

---

## Ce qu'il faut surveiller

### Quotidien (automatisé)
- [ ] Serveur "healthy"
- [ ] Pas d'erreurs critiques dans les logs

### Hebdomadaire
- [ ] Espace disque suffisant
- [ ] Backups présents et récents
- [ ] Performance (TPS > 18)

### Mensuel
- [ ] Mises à jour disponibles
- [ ] Revue des logs pour anomalies
- [ ] Test de restauration de backup

---

## Logs Importants à Surveiller

```powershell
# Erreurs
docker compose logs minecraft 2>&1 | Select-String -Pattern "ERROR|WARN|Exception"

# Connexions
docker compose logs minecraft 2>&1 | Select-String -Pattern "logged in|left the game"

# Problèmes de performance
docker compose logs minecraft 2>&1 | Select-String -Pattern "Can't keep up|overloaded"
```

---

## Tableau de Bord Rapide

Script PowerShell pour un résumé rapide :

```powershell
# scripts\status.ps1
Write-Host "`n=== STATUT SERVEUR MINECRAFT ===" -ForegroundColor Magenta

# Statut container
$status = docker inspect minecraft-server --format='{{.State.Status}}' 2>$null
$health = docker inspect minecraft-server --format='{{.State.Health.Status}}' 2>$null
Write-Host "Container: $status | Health: $health"

# Ressources
Write-Host "`nRessources:"
docker stats minecraft-server --no-stream --format "CPU: {{.CPUPerc}} | RAM: {{.MemUsage}}"

# Joueurs connectés
Write-Host "`nJoueurs:"
docker exec minecraft-server rcon-cli list 2>$null

# Dernier backup
Write-Host "`nDernier backup:"
Get-ChildItem .\backups\backup_*.zip | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { "  $($_.Name) - $($_.LastWriteTime)" }

Write-Host ""
```
