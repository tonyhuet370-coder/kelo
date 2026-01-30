# 🐢 Kélonia - Guide de Déploiement

**⚠️ Important:** Lire le guide spécifique pour votre plateforme:
- **Synology NAS**: Voir [SYNOLOGY.md](SYNOLOGY.md) ← Si vous avez un Synology
- **VM Standard**: Voir ci-dessous

## Architecture distribuée

Le système fonctionne avec **2 VMs séparées** :

```
┌──────────────────────────┐       ┌──────────────────────────┐
│   VM 1 - Web Server      │       │  VM 2 - Simulateur       │
│   ou NAS Synology        │       │                          │
│                          │       │  • Flask API (Port 5000) │
│  • Nginx                 │       │  • Données capteurs      │
│  • Site web              │◄──────┤  • Génération données    │
│  • Proxy vers simulateur │       │                          │
└──────────────────────────┘       └──────────────────────────┘
           ▲                                    │
           │                                    │
           └────── Appels API /api/data ────────┘
```

## Déploiement Standard (VM)

### VM 2 : Simulateur (Première)

#### 1. Copier le dossier Simulateur dans la VM
```bash
scp -r Simulateur/ user@SIMULATEUR_IP:/home/user/
ssh user@SIMULATEUR_IP
cd Simulateur
```

#### 2. Vérifier l'IP locale de la VM
```bash
hostname -I
# Note cette IP pour la configuration de la VM 1
```

#### 3. Démarrer le simulateur
```bash
# Avec Docker (recommandé)
docker-compose up -d

# Ou sans Docker
pip install flask flask-cors
python simulateur.py
```

#### 4. Vérifier que l'API fonctionne
```bash
curl http://localhost:5000/data
```

---

### VM 1 : Site Web (Ensuite)

#### 1. Copier le projet dans la VM
```bash
scp -r . user@WEB_IP:/home/user/kelo
ssh user@WEB_IP
cd kelo
```

#### 2. Créer le fichier .env
```bash
# Copier le fichier exemple
cp .env.example .env

# Éditer avec l'IP/hostname du simulateur
nano .env
```

Exemple `.env` :
```
SIMULATEUR_HOST=192.168.1.100
SIMULATEUR_PORT=5000
WEB_PORT=80
```

#### 3. Démarrer le serveur web
```bash
docker-compose up -d
```

#### 4. Accéder au site
```
http://WEB_IP
```

---

## Configuration du Dashboard

1. Ouvrir le dashboard : `http://WEB_IP`
2. Aller au panneau "⚙️ Configuration API"
3. Rentrer : `/api/data`

L'API est automatiquement proxy via nginx vers la VM du simulateur !

---

## Commandes utiles

### VM Simulateur
```bash
# Voir les logs
docker-compose logs -f

# Redémarrer
docker-compose restart

# Arrêter
docker-compose down
```

### VM Web
```bash
# Voir les logs
docker-compose logs -f

# Redémarrer
docker-compose restart

# Arrêter
docker-compose down
```

---

## Troubleshooting

**Erreur de connexion au simulateur:**
```bash
# Depuis la VM web, tester la connexion
curl http://SIMULATEUR_IP:5000/data
```

**Vérifier la configuration nginx:**
```bash
docker-compose logs web | grep proxy
```

**Port 80 déjà utilisé:**
- Modifier dans `docker-compose.yml`: `"8080:80"`

**CORS error:**
- Vérifier que `flask-cors` est installé sur la VM du simulateur
- Redémarrer: `docker-compose restart` (sur la VM simulateur)
