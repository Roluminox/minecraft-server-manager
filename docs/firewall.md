# Configuration Pare-feu

## Option 1 : Tailscale (Recommandé)

Avec Tailscale, **aucune configuration pare-feu supplémentaire n'est nécessaire**.

Tailscale crée un réseau privé chiffré (WireGuard) qui traverse le NAT sans ouvrir de ports.

### Vérification

```powershell
# Windows - Vérifier que Tailscale est connecté
tailscale status

# Vérifier que le port Minecraft n'est PAS exposé publiquement
netstat -an | findstr 25565
# Doit afficher 127.0.0.1:25565 (localhost uniquement)
```

---

## Option 2 : Port-Forwarding

### Étape 1 : Pare-feu Windows

#### Créer la règle entrante

```powershell
# PowerShell en Administrateur
New-NetFirewallRule -DisplayName "Minecraft Server" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 25565 `
    -Action Allow `
    -Profile Private
```

#### Vérifier la règle

```powershell
Get-NetFirewallRule -DisplayName "Minecraft Server" | Format-List
```

#### Supprimer la règle (si besoin)

```powershell
Remove-NetFirewallRule -DisplayName "Minecraft Server"
```

### Étape 2 : Port-Forwarding sur la Box

Chaque box a une interface différente. Voici les étapes générales :

1. **Accède à l'interface de ta box** :
   - Livebox : http://192.168.1.1
   - Freebox : http://mafreebox.freebox.fr
   - SFR Box : http://192.168.1.1
   - Bouygues : http://192.168.1.254

2. **Cherche la section** : NAT / Port Forwarding / Redirection de ports

3. **Crée une règle** :
   - Nom : Minecraft
   - Port externe : 25565
   - Port interne : 25565
   - Protocole : TCP
   - IP destination : L'IP locale de ton PC (ex: 192.168.1.50)

4. **Trouve l'IP locale de ton PC** :
   ```powershell
   ipconfig | findstr "IPv4"
   ```

### Étape 3 : IP Publique

Tes amis auront besoin de ton IP publique :

```powershell
# Dans PowerShell
(Invoke-WebRequest -Uri "https://api.ipify.org").Content
```

Ou visite : https://whatismyip.com

**Note** : Si ton IP change souvent, utilise un service DDNS (No-IP, DuckDNS).

---

## Linux

### UFW (Ubuntu/Debian)

```bash
# Autoriser le port Minecraft
sudo ufw allow 25565/tcp comment "Minecraft Server"

# Vérifier
sudo ufw status verbose

# Supprimer si besoin
sudo ufw delete allow 25565/tcp
```

### firewalld (Fedora/CentOS)

```bash
# Autoriser le port
sudo firewall-cmd --permanent --add-port=25565/tcp
sudo firewall-cmd --reload

# Vérifier
sudo firewall-cmd --list-ports

# Supprimer si besoin
sudo firewall-cmd --permanent --remove-port=25565/tcp
sudo firewall-cmd --reload
```

### iptables (Manuel)

```bash
# Autoriser le port
sudo iptables -A INPUT -p tcp --dport 25565 -j ACCEPT

# Sauvegarder (Debian/Ubuntu)
sudo iptables-save > /etc/iptables/rules.v4
```

---

## Règles de Sécurité Avancées (Option 2)

### Limiter les connexions par IP

```powershell
# Windows - Limiter à 10 connexions par IP
# (Nécessite configuration avancée du pare-feu Windows)
```

```bash
# Linux - Limiter les nouvelles connexions
sudo iptables -A INPUT -p tcp --dport 25565 -m conntrack --ctstate NEW -m limit --limit 10/minute --limit-burst 20 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 25565 -m conntrack --ctstate NEW -j DROP
```

### Whitelist d'IPs (Option avancée)

Si tes amis ont des IPs fixes, tu peux les whitelister :

```bash
# Linux
sudo iptables -A INPUT -p tcp --dport 25565 -s 203.0.113.10 -j ACCEPT  # IP ami 1
sudo iptables -A INPUT -p tcp --dport 25565 -s 203.0.113.20 -j ACCEPT  # IP ami 2
sudo iptables -A INPUT -p tcp --dport 25565 -j DROP  # Bloquer le reste
```

---

## Vérification de Sécurité

### Tester depuis l'extérieur

Demande à un ami ou utilise un service en ligne :
- https://www.yougetsignal.com/tools/open-ports/
- https://canyouseeme.org/

### Vérifier les connexions actives

```powershell
# Windows
netstat -an | findstr 25565
```

```bash
# Linux
ss -tlnp | grep 25565
```

---

## Checklist Sécurité Pare-feu

### Option 1 (Tailscale)
- [ ] Tailscale installé et connecté
- [ ] Aucun port 25565 exposé publiquement
- [ ] Amis invités sur le Tailnet

### Option 2 (Port-Forward)
- [ ] Règle pare-feu créée (25565/TCP uniquement)
- [ ] Port-forwarding configuré sur la box
- [ ] Whitelist Minecraft activée
- [ ] IP publique notée et partagée avec les amis
- [ ] (Optionnel) DDNS configuré si IP dynamique
