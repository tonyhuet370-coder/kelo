# 🔬 Simulateur de Capteurs

API Flask qui simule des capteurs IoT pour le monitoring des nids de tortues.

## Installation locale

```bash
# Créer un environnement virtuel
python -m venv venv

# L'activer
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate  # Windows

# Installer les dépendances
pip install -r requirements.txt

# Lancer le serveur
python simulateur.py
```

## Avec Docker

```bash
# Construire l'image
docker build -t kelo-simulateur .

# Lancer le conteneur
docker run -p 5000:5000 kelo-simulateur
```

## Avec Docker Compose

```bash
# Lancer
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

## API Endpoints

### GET /data
Retourne les données actuelles du simulateur

```json
{
  "nid": "A12",
  "temperature": 25.43,
  "humidite": 78,
  "vibration": 3.92,
  "tension": 2.15,
  "horodatage": "2026-01-30T15:30:45Z"
}
```

### GET /health
Vérification de santé du service

```json
{
  "status": "ok"
}
```

## Variables d'environnement

- `FLASK_ENV` : `production` ou `development` (défaut: production)
- `SIMULATEUR_PORT` : Port d'écoute (défaut: 5000)
- `SIMULATEUR_HOST` : Adresse d'écoute (défaut: 0.0.0.0)
- `MQTT_BROKER` : Hôte du broker MQTT (défaut Docker: `host.docker.internal`)
- `MQTT_PORT` : Port du broker MQTT (défaut: 1883)
- `MQTT_TOPIC_TEMPLATE` : Topic de publication (défaut: `kelo/nid/{nid}/telemetry`)
- `SIMULATED_NID` : Identifiant du nid simulé (un seul nid)
- `PUBLISH_INTERVAL` : Intervalle de publication en secondes

## Test rapide avec le broker MQTT du projet

Depuis le dossier `simulateur`, lancer:

```bash
docker-compose up -d
```

Si votre broker tourne dans la stack principale Docker Compose, vous pouvez forcer l'hôte MQTT:

```bash
$env:MQTT_BROKER="mosquitto"   # PowerShell
# ou
set MQTT_BROKER=mosquitto       # CMD
docker-compose up -d
```

## Plages de données simulées

- **Température** : 20.0 - 30.0 °C
- **Humidité** : 70 - 90 %
- **Vibration** : 3.5 - 4.2 Mpu
- **Tension** : 0.0 - 4.2 V

## CORS

CORS est activé pour les requêtes cross-origin, permettant l'accès depuis le navigateur.

## Logging

Les logs sont disponibles dans la console et dans Docker avec:

```bash
docker-compose logs -f simulateur
```

Format: `YYYY-MM-DD HH:MM:SS - simulateur.py - LEVEL - Message`

## Tests

```bash
# Tester l'API
curl http://localhost:5000/data

# Tester le healthcheck
curl http://localhost:5000/health
```
