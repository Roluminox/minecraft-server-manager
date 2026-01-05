# Modèle de Menaces (Threat Model)

Analyse des risques pour un serveur Minecraft self-hosted entre amis.

---

## Contexte

- **Asset principal** : Serveur Minecraft + données du monde
- **Utilisateurs** : 2-10 amis de confiance
- **Hébergement** : PC personnel sur réseau domestique
- **Exposition** : VPN (Tailscale) ou port-forwarding unique

---

## Menaces et Mitigations

### 1. Accès non autorisé au serveur Minecraft

| Aspect | Détail |
|--------|--------|
| **Menace** | Un inconnu rejoint et griefe le serveur |
| **Probabilité** | Moyenne (Option 2), Très faible (Option 1) |
| **Impact** | Moyen - Destruction du monde, spam |
| **Mitigation** | Whitelist obligatoire, Tailscale (Option 1) |
| **Statut** | ✅ Mitigé par configuration |

### 2. Exploitation de vulnérabilité Minecraft/Java

| Aspect | Détail |
|--------|--------|
| **Menace** | Exploit type Log4Shell (CVE-2021-44228) |
| **Probabilité** | Faible (si à jour) |
| **Impact** | Critique - Exécution de code, accès système |
| **Mitigation** | Mises à jour régulières, container isolé |
| **Statut** | ✅ Mitigé par isolation + updates |

### 3. DDoS / Saturation réseau

| Aspect | Détail |
|--------|--------|
| **Menace** | Attaque volumétrique sur le port exposé |
| **Probabilité** | Faible (serveur privé entre amis) |
| **Impact** | Moyen - Indisponibilité, ralentissement Internet |
| **Mitigation** | Option 1 (Tailscale) élimine le risque, Option 2: limites de connexion |
| **Statut** | ✅ Éliminé (Option 1) / ⚠️ Risque résiduel (Option 2) |

### 4. Évasion du container

| Aspect | Détail |
|--------|--------|
| **Menace** | Attaquant sort du container et accède à l'hôte |
| **Probabilité** | Très faible |
| **Impact** | Critique - Accès complet au PC |
| **Mitigation** | Non-root, capabilities minimales, no-new-privileges |
| **Statut** | ✅ Mitigé par configuration Docker |

### 5. Perte de données

| Aspect | Détail |
|--------|--------|
| **Menace** | Corruption du monde, erreur humaine, panne disque |
| **Probabilité** | Moyenne sur le long terme |
| **Impact** | Élevé - Perte du travail des joueurs |
| **Mitigation** | Backups automatiques réguliers |
| **Statut** | ✅ Mitigé par scripts de backup |

### 6. Compromission des identifiants Tailscale

| Aspect | Détail |
|--------|--------|
| **Menace** | Vol d'un compte Tailscale d'un ami |
| **Probabilité** | Faible |
| **Impact** | Moyen - Accès au réseau Tailscale |
| **Mitigation** | 2FA obligatoire sur Tailscale, révocation rapide |
| **Statut** | ⚠️ Dépend des pratiques des amis |

### 7. Pivot depuis le serveur

| Aspect | Détail |
|--------|--------|
| **Menace** | Attaquant utilise le container pour scanner le réseau local |
| **Probabilité** | Très faible |
| **Impact** | Élevé - Accès aux autres machines du réseau |
| **Mitigation** | Réseau Docker isolé, pas de mode host |
| **Statut** | ✅ Mitigé par configuration |

### 8. Fuite d'informations (IP publique)

| Aspect | Détail |
|--------|--------|
| **Menace** | Ton IP publique est révélée à des inconnus |
| **Probabilité** | Moyenne (Option 2) |
| **Impact** | Faible - Possible ciblage |
| **Mitigation** | Option 1 (Tailscale), ou partager IP seulement aux amis |
| **Statut** | ✅ Éliminé (Option 1) |

---

## Matrice des Risques

```
                    IMPACT
                    Faible    Moyen     Élevé     Critique
                ┌─────────┬─────────┬─────────┬─────────┐
    Très élevée │         │         │         │         │
                ├─────────┼─────────┼─────────┼─────────┤
P   Élevée      │         │         │         │         │
R               ├─────────┼─────────┼─────────┼─────────┤
O   Moyenne     │    8    │  1,3,5  │         │         │
B               ├─────────┼─────────┼─────────┼─────────┤
A   Faible      │         │    6    │    7    │    2    │
                ├─────────┼─────────┼─────────┼─────────┤
    Très faible │         │         │         │    4    │
                └─────────┴─────────┴─────────┴─────────┘

Légende:
1 = Accès non autorisé    5 = Perte de données
2 = Exploit Minecraft     6 = Compromission Tailscale
3 = DDoS                  7 = Pivot réseau
4 = Évasion container     8 = Fuite IP
```

---

## Procédures d'Incident

### Suspicion d'intrusion

1. **Isoler immédiatement**
   ```powershell
   docker compose down
   ```

2. **Examiner les logs**
   ```powershell
   docker compose logs minecraft > incident_logs.txt
   ```

3. **Vérifier les connexions récentes**
   ```powershell
   # Dans les logs, chercher les IPs inconnues
   Select-String -Path incident_logs.txt -Pattern "logged in"
   ```

4. **Révoquer les accès Tailscale suspects**
   - https://login.tailscale.com/admin/machines

5. **Restaurer depuis un backup sain**
   ```powershell
   .\scripts\restore.ps1 -BackupFile "backup_avant_incident.zip"
   ```

### DDoS léger (Option 2)

1. **Arrêter le serveur**
   ```powershell
   docker compose down
   ```

2. **Désactiver le port-forwarding sur la box**

3. **Attendre (généralement 15-60 min)**

4. **Changer de port** (si possible sur ta box)

5. **Redémarrer avec le nouveau port**

6. **Envisager le passage à Tailscale**

### Crash répété du serveur

1. **Examiner les logs**
   ```powershell
   docker compose logs --tail 500 minecraft
   ```

2. **Vérifier les ressources**
   ```powershell
   docker stats minecraft-server --no-stream
   ```

3. **Causes courantes** :
   - Mémoire insuffisante → Augmenter `MC_MEMORY`
   - Monde corrompu → Restaurer backup
   - Plugin/mod défaillant → Désactiver

4. **Restaurer si nécessaire**
   ```powershell
   .\scripts\restore.ps1 -BackupFile "dernier_backup_fonctionnel.zip"
   ```

---

## Recommandations Prioritaires

### Obligatoire
1. ✅ Utiliser Tailscale (Option 1)
2. ✅ Activer la whitelist
3. ✅ Backups réguliers
4. ✅ Mises à jour mensuelles

### Fortement recommandé
5. ⭐ 2FA sur Tailscale pour tous
6. ⭐ Ne pas donner les droits OP à tout le monde
7. ⭐ Vérifier les logs régulièrement

### Optionnel
8. 💡 Monitoring automatisé
9. 💡 Fail2ban (si Option 2)
10. 💡 ACL Tailscale

---

## Hypothèses de Confiance

Ce modèle suppose que :
- Les amis sont de confiance (pas de menace interne)
- Les comptes Minecraft des amis ne sont pas compromis
- L'image Docker `itzg/minecraft-server` est fiable (très maintenue, 500M+ pulls)
- Docker Desktop/Engine est à jour

Si ces hypothèses changent, réévaluer ce modèle.
