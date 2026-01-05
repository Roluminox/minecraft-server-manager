# Durcissement de Sécurité (Hardening)

Guide de renforcement de la sécurité pour ton serveur Minecraft self-hosted.

---

## Niveau 1 : Minimum Viable (Obligatoire)

### Docker

- [x] **Container non-root** : L'image itzg utilise UID/GID configurables
- [x] **Capabilities minimales** : `cap_drop: ALL` + seulement CHOWN/SETUID/SETGID
- [x] **Pas de mode privileged** : `privileged: false`
- [x] **Pas d'escalade de privilèges** : `no-new-privileges:true`
- [x] **Réseau isolé** : Réseau Docker dédié `gameserver-net`
- [x] **Pas de docker.sock monté** : Jamais exposer le socket Docker
- [x] **Limites ressources** : CPU et mémoire limités

### Minecraft

- [x] **Whitelist activée** : Seuls les joueurs autorisés peuvent rejoindre
- [x] **RCON désactivé** : Pas d'accès console à distance
- [x] **Spawn protection** : 0 (ou ajuste selon tes besoins)

### Réseau

- [x] **Option 1 (Tailscale)** : Zéro port exposé sur Internet
- [x] **Option 2** : Un seul port (25565/TCP)

---

## Niveau 2 : Recommandé

### Système Hôte (Windows)

```powershell
# Vérifier que Windows est à jour
Get-WindowsUpdate

# Activer le pare-feu Windows
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True

# Désactiver les services inutiles
# (Attention : ne désactive que ce que tu comprends)
```

### Système Hôte (Linux)

```bash
# Mises à jour automatiques (Ubuntu)
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades

# Désactiver les services inutiles
sudo systemctl disable --now cups  # Exemple: service d'impression
```

### Docker Desktop (Windows)

1. **Settings > General** :
   - [x] Use WSL 2 based engine
   - [ ] Start Docker Desktop when you log in (optionnel)

2. **Settings > Resources > WSL Integration** :
   - Active uniquement pour ta distro principale

3. **Settings > Docker Engine** :
   ```json
   {
     "features": {
       "buildkit": true
     },
     "log-driver": "json-file",
     "log-opts": {
       "max-size": "50m",
       "max-file": "3"
     }
   }
   ```

### Tailscale ACL (Optionnel mais recommandé)

Si tu veux contrôler finement qui accède à quoi :

1. Va sur https://login.tailscale.com/admin/acls
2. Ajoute des règles spécifiques :

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:friends"],
      "dst": ["tag:gameserver:25565"]
    }
  ],
  "tagOwners": {
    "tag:friends": ["autogroup:admin"],
    "tag:gameserver": ["autogroup:admin"]
  }
}
```

---

## Niveau 3 : Avancé

### Durcissement Docker (Linux)

Crée `/etc/docker/daemon.json` :

```json
{
  "icc": false,
  "userns-remap": "default",
  "no-new-privileges": true,
  "live-restore": true,
  "userland-proxy": false,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
```

```bash
sudo systemctl restart docker
```

### Audit des containers

```bash
# Installer docker-bench-security
docker run --rm --net host --pid host --userns host --cap-add audit_control \
  -e DOCKER_CONTENT_TRUST=$DOCKER_CONTENT_TRUST \
  -v /var/lib:/var/lib:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /usr/lib/systemd:/usr/lib/systemd:ro \
  -v /etc:/etc:ro \
  docker/docker-bench-security
```

### Fail2ban pour Minecraft (Linux, Option 2)

Si tu utilises le port-forwarding, Fail2ban peut bloquer les IPs malveillantes.

```bash
# Installer Fail2ban
sudo apt install fail2ban

# Créer un filtre Minecraft
sudo tee /etc/fail2ban/filter.d/minecraft.conf << 'EOF'
[Definition]
failregex = .*\[Server thread/INFO\]: <HOST>.*lost connection: Disconnected
            .*\[Server thread/WARN\]: <HOST>.*was kicked
ignoreregex =
EOF

# Créer une jail
sudo tee /etc/fail2ban/jail.d/minecraft.conf << 'EOF'
[minecraft]
enabled = true
filter = minecraft
logpath = /var/lib/docker/volumes/minecraft-data/_data/logs/latest.log
maxretry = 5
findtime = 600
bantime = 3600
action = iptables-allports[name=minecraft]
EOF

sudo systemctl restart fail2ban
```

---

## Checklist Hardening

### Avant le lancement
- [ ] Docker à jour (`docker --version`)
- [ ] Images officielles/maintenues uniquement
- [ ] Variables d'environnement sensibles dans `.env` (pas dans le compose)
- [ ] `.env` dans `.gitignore` si tu versionnes

### Configuration Docker
- [ ] Aucun `privileged: true`
- [ ] `cap_drop: ALL` + caps minimales
- [ ] `no-new-privileges: true`
- [ ] Limites CPU/RAM définies
- [ ] Volumes nommés (pas de bind mounts vers /etc, /var, etc.)
- [ ] Pas de `docker.sock` monté

### Configuration Minecraft
- [ ] Whitelist activée et appliquée
- [ ] RCON désactivé
- [ ] Liste d'OP réduite au minimum

### Réseau
- [ ] Option 1 : Tailscale, aucun port exposé
- [ ] Option 2 : Un seul port, pare-feu configuré

### Maintenance
- [ ] Backups automatisés
- [ ] Mises à jour régulières (mensuel minimum)
- [ ] Logs surveillés

---

## Ressources

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [Tailscale Security](https://tailscale.com/security/)
- [Minecraft Server Security](https://minecraft.wiki/w/Server#Security)
