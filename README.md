# Serveur Minecraft Docker - Self-Hosted Sécurisé

Serveur Minecraft Java containerisé avec Docker, optimisé pour l'hébergement privé entre amis.

## Installation Rapide (Interface Graphique)

### Prérequis
- **Docker Desktop** : [Télécharger](https://www.docker.com/products/docker-desktop/)
- **Node.js v18+** : [Télécharger](https://nodejs.org/)

### Installation

1. **Télécharge** ce repo (ou `git clone`)
2. **Lance Docker Desktop**
3. **Double-clic sur `setup.bat`** (première fois uniquement)
4. **Double-clic sur `start.bat`** pour lancer l'interface

```
C:\Dev\Minecraft\
├── setup.bat     ← Lance une fois pour installer
├── start.bat     ← Lance l'app de gestion
└── app\          ← Interface Electron
```

L'interface permet de :
- Démarrer/Arrêter/Redémarrer le serveur
- Voir les stats (CPU, RAM)
- Envoyer des commandes console (RCON)
- Modifier la configuration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────┐                   ┌───────────────────┐
│  OPTION 1 (VPN)   │                   │ OPTION 2 (Port)   │
│   Tailscale       │                   │  Port-Forward     │
│  Aucun port       │                   │  25565 ouvert     │
│  exposé           │                   │                   │
└───────────────────┘                   └───────────────────┘
        │                                           │
        └─────────────────────┬─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TON PC (HÔTE)                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Docker Desktop                        │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │           gameserver-net (172.28.0.0/16)        │    │    │
│  │  │  ┌───────────────────────────────────────────┐  │    │    │
│  │  │  │         minecraft-server                  │  │    │    │
│  │  │  │  • Image: itzg/minecraft-server           │  │    │    │
│  │  │  │  • Port: 25565                            │  │    │    │
│  │  │  │  • Non-root, capabilities minimales       │  │    │    │
│  │  │  │  • Healthcheck actif                      │  │    │    │
│  │  │  └───────────────────────────────────────────┘  │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                         │                                │    │
│  │         ┌───────────────┼───────────────┐                │    │
│  │         ▼               ▼               ▼                │    │
│  │  ┌───────────┐   ┌───────────┐   ┌───────────┐          │    │
│  │  │   data    │   │  backups  │   │   logs    │          │    │
│  │  └───────────┘   └───────────┘   └───────────┘          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Prérequis

### Windows 10/11
1. **Docker Desktop** : [Télécharger](https://www.docker.com/products/docker-desktop/)
2. **WSL2** : Activé (Docker Desktop le configure automatiquement)
3. **RAM** : Minimum 8 Go (16 Go recommandé)
4. **Tailscale** (Option 1) : [Télécharger](https://tailscale.com/download/windows)

### Linux
```bash
# Installation Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Installation Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
```

---

## Installation Rapide

### Étape 1 : Cloner/Télécharger ce dossier

### Étape 2 : Configurer l'environnement

**Windows (PowerShell):**
```powershell
cd C:\Dev\Minecraft
Copy-Item .env.example .env
# Édite .env avec ton éditeur préféré (notepad .env)
```

**Linux:**
```bash
cd ~/minecraft-server
cp .env.example .env
nano .env  # ou vim .env
```

### Étape 3 : Choisir ton option d'accès

#### Option 1 : Tailscale VPN (Recommandé)

1. **Installe Tailscale** sur ton PC hôte
2. **Connecte-toi** : `tailscale up` (ou via l'app Windows)
3. **Note ton IP Tailscale** : `tailscale ip -4` (ex: 100.x.y.z)
4. **Démarre le serveur** :

**Windows:**
```powershell
docker compose up -d
```

**Linux:**
```bash
docker compose up -d
```

5. **Tes amis** :
   - Installent Tailscale
   - Tu les invites via [Tailscale Admin](https://login.tailscale.com/admin/machines)
   - Ils se connectent à `100.x.y.z:25565` dans Minecraft

#### Option 2 : Port-Forwarding

```powershell
# Windows
docker compose -f docker-compose.portforward.yml up -d
```

```bash
# Linux
docker compose -f docker-compose.portforward.yml up -d
```

Puis configure le port-forwarding sur ta box (voir `docs/firewall.md`).

---

## Commandes Principales

### Démarrer le serveur
```powershell
docker compose up -d
```

### Arrêter le serveur
```powershell
docker compose down
```

### Voir les logs en temps réel
```powershell
docker compose logs -f minecraft
```

### Statut du serveur
```powershell
docker compose ps
```

### Exécuter une commande Minecraft
```powershell
docker exec minecraft-server rcon-cli
# Puis tape tes commandes (whitelist add pseudo, op pseudo, etc.)
```

### Ajouter un joueur à la whitelist
```powershell
docker exec minecraft-server rcon-cli whitelist add NomDuJoueur
```

### Donner les droits OP
```powershell
docker exec minecraft-server rcon-cli op NomDuJoueur
```

---

## Maintenance

### Mettre à jour le serveur

**Windows:**
```powershell
.\scripts\update.ps1
```

**Linux:**
```bash
./scripts/update.sh
```

### Sauvegarder le monde

**Windows:**
```powershell
.\scripts\backup.ps1
```

**Linux:**
```bash
./scripts/backup.sh
```

### Restaurer une sauvegarde

**Windows:**
```powershell
.\scripts\restore.ps1 -BackupFile "backup_2024-01-15_143022.tar.gz"
```

**Linux:**
```bash
./scripts/restore.sh backup_2024-01-15_143022.tar.gz
```

---

## Configuration Avancée

### Changer la version Minecraft
Dans `.env` :
```env
MC_VERSION=1.21.5
```

### Passer à Paper (plugins)
```env
MC_TYPE=PAPER
```

### Ajuster la RAM
```env
MC_MEMORY=6G
MC_MEM_LIMIT=8G
```

---

## Checklists

### Avant de donner l'accès aux amis

- [ ] Serveur démarré et healthy (`docker compose ps`)
- [ ] Testé la connexion toi-même
- [ ] Whitelist activée
- [ ] Toi-même ajouté à la whitelist et OP
- [ ] Backup initial créé
- [ ] (Option 1) Amis invités sur Tailscale
- [ ] (Option 2) Pare-feu configuré

### Maintenance mensuelle

- [ ] Exécuter `.\scripts\update.ps1`
- [ ] Vérifier les logs (`docker compose logs --tail 100`)
- [ ] Créer un backup
- [ ] Vérifier l'espace disque
- [ ] Mettre à jour Tailscale si nécessaire
- [ ] Vérifier les mises à jour Docker Desktop

---

## Documentation Complémentaire

| Document | Description |
|----------|-------------|
| [docs/firewall.md](docs/firewall.md) | Configuration pare-feu Windows/Linux |
| [docs/hardening.md](docs/hardening.md) | Durcissement de sécurité |
| [docs/monitoring.md](docs/monitoring.md) | Logs et surveillance |
| [docs/threat-model.md](docs/threat-model.md) | Modèle de menaces |

---

## Adapter à un Autre Jeu

Cette configuration est modulaire. Pour un autre jeu :

1. **Modifie `docker-compose.yml`** : change l'image
2. **Adapte `.env`** : variables spécifiques au jeu
3. **Change le port** exposé

### Exemples

| Jeu | Image Docker | Port |
|-----|-------------|------|
| Minecraft | itzg/minecraft-server | 25565 |
| Valheim | lloesche/valheim-server | 2456-2458/udp |
| Palworld | thijsvanloef/palworld-server-docker | 8211/udp |
| Terraria | ryshe/terraria | 7777 |
| Factorio | factoriotools/factorio | 34197/udp |

---

## Dépannage

### Le serveur ne démarre pas
```powershell
docker compose logs minecraft
```

### Erreur "port already in use"
```powershell
# Trouve le processus
netstat -ano | findstr :25565
# Tue-le (remplace PID)
taskkill /PID <PID> /F
```

### Erreur de mémoire
Augmente `MC_MEMORY` et `MC_MEM_LIMIT` dans `.env`.

### Les amis ne peuvent pas se connecter
1. Vérifie que Tailscale est connecté des deux côtés
2. Vérifie l'IP : `tailscale ip -4`
3. Vérifie le serveur : `docker compose ps` (doit être "healthy")
4. Vérifie la whitelist

---

## Licence

MIT - Utilise et modifie librement.
