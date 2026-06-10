import json
import random
import time
import os
import logging
from datetime import datetime
import threading
import requests
import paho.mqtt.client as mqtt
from flask import Flask, request, jsonify
from flask_cors import CORS
from auth_routes import auth_bp
from auth import init_auth_db

# ============================
# LOGGING
# ============================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================
# FLASK
# ============================
app = Flask(__name__)
CORS(app)

# ============================
# CONFIG
# ============================
PORT = int(os.getenv('SIMULATEUR_PORT', 5000))
HOST = os.getenv('SIMULATEUR_HOST', '0.0.0.0')
DEBUG = os.getenv('FLASK_ENV') == 'development'

MQTT_BROKER = os.getenv('MQTT_BROKER', 'localhost')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
DEFAULT_MQTT_TOPIC_TEMPLATE = 'kelo/nid/{nid}/telemetry'
MQTT_TOPIC_TEMPLATE = os.getenv('MQTT_TOPIC_TEMPLATE', DEFAULT_MQTT_TOPIC_TEMPLATE)
SIMULATED_NID = os.getenv('SIMULATED_NID', 'A12')
PUBLISH_INTERVAL = float(os.getenv('PUBLISH_INTERVAL', 5))
TEMPERATURE_ALERT_THRESHOLD = float(os.getenv('TEMPERATURE_ALERT_THRESHOLD', 32))
HUMIDITE_ALERT_THRESHOLD = float(os.getenv('HUMIDITE_ALERT_THRESHOLD', 95))
VIBRATION_ALERT_THRESHOLD = float(os.getenv('VIBRATION_ALERT_THRESHOLD', 5))
TENSION_ALERT_THRESHOLD = float(os.getenv('TENSION_ALERT_THRESHOLD', 1))
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '').strip()
TELEGRAM_CHAT_IDS = [
    chat_id.strip()
    for chat_id in os.getenv('TELEGRAM_CHAT_IDS', '').split(',')
    if chat_id.strip()
]
TELEGRAM_ALERTS_ENABLED = os.getenv('TELEGRAM_ALERTS_ENABLED', 'true').lower() in {'1', 'true', 'yes', 'on'}

if TELEGRAM_CHAT_ID and TELEGRAM_CHAT_ID not in TELEGRAM_CHAT_IDS:
    TELEGRAM_CHAT_IDS.append(TELEGRAM_CHAT_ID)

# ============================
# TELEGRAM BOT
# ============================
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage" if TELEGRAM_BOT_TOKEN else None
last_alert_sent_at = {}
ALERT_COOLDOWN_SECONDS = float(os.getenv('ALERT_COOLDOWN_SECONDS', 60))

def send_telegram_alert(message):
    """Envoie une alerte Telegram"""
    if not TELEGRAM_ALERTS_ENABLED:
        return

    if not TELEGRAM_API_URL or not TELEGRAM_CHAT_IDS:
        logger.warning("Telegram non configuré, alerte ignorée")
        return

    has_error = False
    for chat_id in TELEGRAM_CHAT_IDS:
        try:
            response = requests.post(
                TELEGRAM_API_URL,
                json={"chat_id": chat_id, "text": message},
                timeout=10
            )
            response.raise_for_status()
            logger.info(f"Alerte Telegram envoyée à {chat_id} : {message}")
        except Exception as e:
            has_error = True
            logger.error(f"Erreur Telegram pour {chat_id} : {e}")

    if has_error:
        logger.warning("Une ou plusieurs alertes Telegram n'ont pas pu être envoyées")

def should_send_alert(alert_key):
    now = time.time()
    last_sent_at = last_alert_sent_at.get(alert_key, 0)
    if now - last_sent_at < ALERT_COOLDOWN_SECONDS:
        return False

    last_alert_sent_at[alert_key] = now
    return True

# ============================
# MQTT
# ============================
mqtt_client = None
connected_event = threading.Event()

def build_topic(nid):
    try:
        return MQTT_TOPIC_TEMPLATE.format(nid=nid)
    except (KeyError, ValueError) as exc:
        logger.warning(
            "Template MQTT invalide '%s', fallback sur '%s' (%s)",
            MQTT_TOPIC_TEMPLATE,
            DEFAULT_MQTT_TOPIC_TEMPLATE,
            exc,
        )
        return DEFAULT_MQTT_TOPIC_TEMPLATE.format(nid=nid)

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        connected_event.set()
        logger.info(f" Connecté au broker MQTT {MQTT_BROKER}:{MQTT_PORT}")
    else:
        logger.error(f" Connexion MQTT échouée (rc={rc})")

def connect_mqtt():
    client = mqtt.Client()
    client.on_connect = on_connect

    while True:
        try:
            connected_event.clear()
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            client.loop_start()
            if connected_event.wait(timeout=5):
                return client
            raise RuntimeError("Timeout MQTT")
        except Exception as e:
            logger.error(f" Erreur MQTT : {e}")
            time.sleep(5)

# ============================
# GENERATION DES DONNÉES
# ============================
def generate_data(nid):
    data = {
        "nid": nid,
        "temperature": round(random.uniform(20.0, 38.0), 2),
        "humidite": round(random.uniform(55.0, 98.0), 2),
        "vibration": round(random.uniform(2.6, 6.0), 2),
        "tension": round(random.uniform(0.0, 4.9), 2),
        "horodatage": datetime.utcnow().isoformat() + "Z"
    }
    check_alerts(data)
    return data

# ============================
# ALERTES
# ============================
def check_alerts(data):
    nid = data.get("nid", "inconnu")

    if data["temperature"] > TEMPERATURE_ALERT_THRESHOLD and should_send_alert((nid, "temperature")):
        send_telegram_alert(
            f"Alerte nid {nid} : température élevée ({data['temperature']} °C)"
        )

    if data["humidite"] > HUMIDITE_ALERT_THRESHOLD and should_send_alert((nid, "humidite")):
        send_telegram_alert(
            f"Alerte nid {nid} : humidité élevée ({data['humidite']} %)"
        )

    if data["vibration"] > VIBRATION_ALERT_THRESHOLD and should_send_alert((nid, "vibration")):
        send_telegram_alert(
            f"Alerte nid {nid} : vibration élevée ({data['vibration']})"
        )

    if data["tension"] < TENSION_ALERT_THRESHOLD and should_send_alert((nid, "tension")):
        send_telegram_alert(
            f"Alerte nid {nid} : tension faible ({data['tension']} V)"
        )

# ============================
# THREAD DE PUBLICATION MQTT
# ============================
def publish_loop():
    global mqtt_client
    mqtt_client = connect_mqtt()

    while True:
        data = generate_data(SIMULATED_NID)
        topic = build_topic(SIMULATED_NID)

        try:
            mqtt_client.publish(topic, json.dumps(data))
            logger.info(f" MQTT publié sur {topic}")
        except Exception as e:
            logger.error(f" Erreur MQTT : {e}")
            mqtt_client = connect_mqtt()

        time.sleep(PUBLISH_INTERVAL)

# ============================
# ROUTES FLASK (API REST)
# ============================
@app.route('/data', methods=['GET'])
def send_data():
    """API REST : renvoie les données JSON du simulateur"""
    data = generate_data(SIMULATED_NID)
    return jsonify(data)

@app.route('/alert', methods=['POST'])
def alert():
    """API REST : envoie une alerte Telegram manuelle"""
    data = request.get_json()
    message = f"🚨 Alerte : {data['type']} - Valeur : {data['value']}"
    send_telegram_alert(message)
    return jsonify({"status": "sent"})

@app.route('/sensor-data', methods=['POST'])
def receive_sensor_data():
    data = request.get_json(silent=True) or {}

    required_fields = {'nid', 'temperature', 'humidite', 'vibration', 'tension'}
    missing_fields = sorted(required_fields - set(data.keys()))
    if missing_fields:
        return jsonify({
            "status": "error",
            "message": f"Champs manquants : {', '.join(missing_fields)}"
        }), 400

    check_alerts(data)
    return jsonify({"status": "ok", "message": "Données capteur traitées"})

# ============================
# MAIN
# ============================
if __name__ == '__main__':
    # Initialiser la base de données d'authentification
    init_auth_db()
    
    # Enregistrer les routes d'authentification
    app.register_blueprint(auth_bp)
    
    # Démarrer la publication MQTT en arrière-plan
    threading.Thread(target=publish_loop, daemon=True).start()
    logger.info(f"Simulateur démarré sur {HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=DEBUG)
