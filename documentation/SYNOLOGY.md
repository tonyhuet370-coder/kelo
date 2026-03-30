#  Kélonia - Déploiement sur Synology NAS

## Architecture

**Les deux conteneurs Docker sont sur le même NAS** - Communication interne optimisée !

```
┌─────────────────────────────────────────────────┐
│   NAS Synology - Docker Compose                 │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Conteneur Web (Nginx)                   │  │
│  │  • Port 8080                             │  │
│  │  • Site web Kélonia                      │  │
│  └──────────────────────────────────────────┘  │
│                    ▲                            │
│                    │ (via réseau Docker)       │
│                    ▼                            │
│  ┌──────────────────────────────────────────┐  │
│  │  Conteneur Simulateur (Flask)            │  │
│  │  • Port 5000                             │  │
│  │  • API /data                             │  │
│  │  • Données des capteurs                  │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Prérequis Synology

1. **Docker installé** sur le NAS
   - Accès : `Gestionnaire des paquets` → Installer `Docker`

2. **Accès SSH activé** (recommandé)
   - Panneau de configuration → Terminal et SNMP → Activer SSH

3. **Espace disque** : ~500MB pour les images Docker

## Installation sur Synology

### Option 1 : Avec SSH (Recommandée - Plus facile)

#### 1. Copier le projet sur le NAS
```bash
# Depuis ton ordinateur
scp -r kelo user@NAS_IP:/volume1/homes/user/

# Ou avec Windows/PowerShell
# Set-Location C:\Users\pop\OneDrive\Desktop\Kelo
# scp -r kelo user@NAS_IP:/volume1/homes/user/
```

#### 2. Se connecter au NAS en SSH
```bash
ssh user@NAS_IP
cd /volume1/homes/user/kelo
```

#### 3. Configurer l'adresse du simulateur
```bash
cp .env.example .env
nano .env
```

Modifier (optionnel, les défauts conviennent):
```
WEB_PORT=8080         # Port du site
SIMULATEUR_PORT=5000  # Port interne du simulateur
```

Les deux conteneurs se trouvent automatiquement via le réseau Docker !

#### 4. Démarrer les conteneurs
```bash
docker-compose up -d
```

**Cela démarre automatiquement:**
- Conteneur web (Nginx) - Port 8080
- Conteneur simulateur (Flask) - Port 5000

#### 5. Vérifier le statut
```bash
docker-compose ps
docker-compose logs -f  # Voir tous les logs
```

#### 6. Accéder au site
```
http://NAS_IP:8080
```

**L'API du simulateur est automatiquement disponible à:** `/api/data`

Les deux conteneurs communiquent via le réseau Docker interne !

---

### Option 2 : Interface Web Synology (Plus intuitive)

#### 1. Importer le projet
- Accès : `Gestionnaire Docker` → `Images`
- Récupérer les fichiers du projet dans un dossier partagé du NAS

#### 2. Créer les conteneurs
- Utiliser `docker-compose.yml` pour créer automatiquement les deux conteneurs

---

## Points importants pour Synology

### Ports disponibles
- Les ports < 1024 nécessitent des droits root
- **Port recommandé: 8080** (souvent libre)
- Alternatives : 8888, 9090, 10000

### Emplacements des fichiers
- **Dossier partagé privilégié:** `/volume1/docker/kelo/`
- **Dossier maison utilisateur:** `/volume1/homes/username/kelo/`

### Permissions
```bash
# Si erreur de permission
chmod -R 755 /chemin/vers/kelo
```

### Volumes persistants
Pour que les fichiers restent en cas de redémarrage:
```yaml
volumes:
  - /volume1/docker/kelo:/home/kelo  # Chemin permanent sur le NAS
```

---

## Troubleshooting Synology

**Docker non trouvé :**
```bash
# Vérifier l'installation
docker version
```

**Erreur de permission :**
```bash
# Vérifier les droits
ls -la /volume1/docker/
# Donner les permissions
sudo chown -R user:user /volume1/docker/kelo
```

**Port 8080 déjà utilisé :**
```bash
# Trouver le port libre
netstat -tln | grep LISTEN

# Modifier dans .env
WEB_PORT=8888  # ou un autre port libre
docker-compose up -d
```

**Simulateur non joignable depuis le web:**
```bash
# Tester la connectivité interne
docker exec kelo-web curl http://simulateur:5000/data

# Vérifier le réseau Docker
docker network inspect kelo-network
```

**Container ne démarre pas :**
```bash
# Voir les logs détaillés
docker-compose logs -f web
```

---

## Commandes utiles

```bash
# Voir les conteneurs actifs
docker ps

# Afficher les logs
docker logs kelo-web -f

# Redémarrer
docker restart kelo-web

# Arrêter
docker stop kelo-web

# Supprimer
docker rm kelo-web

# Réappliquer les changements du .env
docker-compose down
docker-compose up -d
```

---

## Sauvegarde/Restauration

### Sauvegarder la config
```bash
cd /volume1/docker/kelo
tar -czf kelo-backup.tar.gz .
```

### Restaurer
```bash
tar -xzf kelo-backup.tar.gz -C /volume1/docker/
docker-compose up -d
```

---

## Performance

Le NAS Synology a des ressources limitées. La config limite les ressources Docker à:
- CPU: 0.5 cores
- RAM: 256MB

Si ça rame, vérifier d'autres conteneurs actifs!
