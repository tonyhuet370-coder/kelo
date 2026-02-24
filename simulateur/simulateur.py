from flask import Flask, jsonify
from flask_cors import CORS
import json
import random
import time
import os
import logging
from datetime import datetime
import threading
import paho.mqtt.client as mqtt


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  


PORT = int(os.getenv('SIMULATEUR_PORT', 5000))
HOST = os.getenv('SIMULATEUR_HOST', '0.0.0.0')
DEBUG = os.getenv('FLASK_ENV') == 'development'
MQTT_BROKER = os.getenv('MQTT_BROKER', 'mosquitto')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
MQTT_TOPIC = os.getenv('MQTT_TOPIC', 'kelo/nid/A12/telemetry')
PUBLISH_INTERVAL = float(os.getenv('PUBLISH_INTERVAL', 5))

mqtt_client = None
latest_data = None
latest_lock = threading.Lock()
connected_event = threading.Event()

def generate_data():
    """Génère les données du simulateur de capteurs"""
    data = {
        "nid": "A12",
        "temperature": round(random.uniform(20.0, 30.0), 2),
        "humidite": round(random.randint(70, 90), 2),
        "vibration": round(random.uniform(3.5, 4.2), 2),
        "tension": round(random.uniform(0.0, 4.2), 2),
        "horodatage": datetime.utcnow().isoformat() + "Z"
    }
    with latest_lock:
        global latest_data
        latest_data = data
    return data

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        connected_event.set()
        logger.info(f" Connecté au broker MQTT {MQTT_BROKER}:{MQTT_PORT}")
    else:
        logger.error(f" Connexion MQTT échouée (rc={rc})")

def on_disconnect(client, userdata, rc):
    connected_event.clear()
    if rc != 0:
        logger.error(" Déconnecté du broker MQTT")

def connect_mqtt():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    while True:
        try:
            connected_event.clear()
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            client.loop_start()
            if not connected_event.wait(timeout=5):
                raise RuntimeError("Connexion MQTT timeout")
            return client
        except Exception as e:
            logger.error(f" Connexion MQTT échouée: {e}")
            time.sleep(5)

def publish_loop():
    global mqtt_client
    while True:
        data = generate_data()
        try:
            if mqtt_client is None:
                mqtt_client = connect_mqtt()
            result = mqtt_client.publish(MQTT_TOPIC, json.dumps(data))
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.info(f" MQTT publié sur {MQTT_TOPIC}")
            else:
                logger.error(f" Publication MQTT échouée (rc={result.rc})")
                try:
                    mqtt_client.loop_stop()
                except Exception:
                    pass
                mqtt_client = None
        except Exception as e:
            logger.error(f" Publication MQTT échouée: {e}")
            try:
                if mqtt_client is not None:
                    mqtt_client.loop_stop()
            except Exception:
                pass
            mqtt_client = None
        time.sleep(PUBLISH_INTERVAL)

@app.route('/data', methods=['GET'])
def send_data():
    """Endpoint pour récupérer les données du simulateur"""
    try:
        data = generate_data()
        logger.info(f"Données envoyées: Temp={data['temperature']}°C, Humid={data['humidite']}%")
        return jsonify(data)
    except Exception as e:
        logger.error(f"Erreur lors de la génération des données: {e}")
        return jsonify({"error": "Erreur lors de la génération des données"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint de vérification de santé (healthcheck)"""
    return jsonify({"status": "ok"}), 200

@app.errorhandler(404)
def not_found(error):
    """Gestion des erreurs 404"""
    return jsonify({"error": "Route non trouvée"}), 404

@app.errorhandler(500)
def internal_error(error):
    """Gestion des erreurs 500"""
    logger.error(f"Erreur interne: {error}")
    return jsonify({"error": "Erreur interne du serveur"}), 500

if __name__ == '__main__':
    mqtt_client = connect_mqtt()
    t = threading.Thread(target=publish_loop, daemon=True)
    t.start()
    logger.info(f" Démarrage du simulateur sur {HOST}:{PORT}")
    logger.info(f"Mode DEBUG: {DEBUG}")
    app.run(host=HOST, port=PORT, debug=DEBUG)
