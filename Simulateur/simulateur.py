from flask import Flask, jsonify
from flask_cors import CORS
import random
import time
import os
import logging
from datetime import datetime
import threading
import json
import paho.mqtt.client as mqtt

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Activer CORS pour les requêtes depuis le navigateur

# Configuration depuis les variables d'environnement
PORT = int(os.getenv('SIMULATEUR_PORT', 5000))
HOST = os.getenv('SIMULATEUR_HOST', '0.0.0.0')
DEBUG = os.getenv('FLASK_ENV') == 'development'
MQTT_BROKER = os.getenv('MQTT_BROKER', 'mosquitto')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
TOPIC = os.getenv('MQTT_TOPIC', 'kelo/nid/A12/telemetry')

_last = None

# MQTT client (publish only)
mqtt_client = mqtt.Client()

try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()
except Exception as e:
    logger.warning(f"Impossible de se connecter au broker MQTT: {e}")


def generate_data():
    data = {
        "nid": "A12",
        "temperature": round(random.uniform(20.0, 30.0), 2),
        "humidite": round(random.randint(70, 90), 2),
        "vibration": round(random.uniform(3.5, 4.2), 2),
        "tension": round(random.uniform(0.0, 4.2), 2),
        "horodatage": datetime.utcnow().isoformat() + "Z"
    }
    return data


def publish_loop():
    global _last
    while True:
        data = generate_data()
        _last = data
        payload = json.dumps(data)
        try:
            mqtt_client.publish(TOPIC, payload)
            logger.info(f"Published to MQTT: {payload}")
        except Exception as e:
            logger.error(f"MQTT publish error: {e}")
        time.sleep(5)

# start background publisher
t = threading.Thread(target=publish_loop, daemon=True)
t.start()

@app.route('/data', methods=['GET'])
def send_data():
    global _last
    if _last is None:
        _last = generate_data()
    return jsonify(_last)
    
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    logger.info(f"🚀 Démarrage du simulateur sur {HOST}:{PORT}")
    logger.info(f"Mode DEBUG: {DEBUG}")
    app.run(host=HOST, port=PORT, debug=DEBUG)
