import json
import random
import time
import os
import logging
from datetime import datetime
import threading
import paho.mqtt.client as mqtt
from flask import Flask, request, jsonify
from flask_cors import CORS
from telegram import Bot

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
MQTT_TOPIC_TEMPLATE = os.getenv('MQTT_TOPIC_TEMPLATE', 'kelo/nid/{nid}/telemetry')
SIMULATED_NID = os.getenv('SIMULATED_NID', 'A12')
PUBLISH_INTERVAL = float(os.getenv('PUBLISH_INTERVAL', 5))

# ============================
# TELEGRAM BOT
# ============================
TELEGRAM_TOKEN = "889031909:AAFDxsFy63KBEFWs3qw9qWlrU2XOB2wZmg"
CHAT_ID = "6936368458"

bot = Bot(token=TELEGRAM_TOKEN)

def send_telegram_alert(message):
    """Envoie une alerte Telegram"""
    try:
        bot.send_message(chat_id=CHAT_ID, text=message)
        logger.info(f" Alerte Telegram envoyée : {message}")
    except Exception as e:
        logger.error(f" Erreur Telegram : {e}")

# ============================
# MQTT
# ============================
mqtt_client = None
connected_event = threading.Event()

def build_topic(nid):
    return MQTT_TOPIC_TEMPLATE.format(nid=nid)

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
    if data["temperature"] > 32:
        send_telegram_alert(f"🔥 Température élevée : {data['temperature']}°C")

    if data["vibration"] > 5:
        send_telegram_alert(f"⚠️ Vibration anormale : {data['vibration']} Hz")

    if data["tension"] < 1:
        send_telegram_alert(f"🔋 Tension faible : {data['tension']}V")

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
# ROUTES FLASK
# ============================
@app.route('/data', methods=['GET'])
def send_data():
    data = generate_data(SIMULATED_NID)
    return jsonify(data)

@app.route('/alert', methods=['POST'])
def alert():
    data = request.get_json()
    message = f"🚨 Alerte : {data['type']} - Valeur : {data['value']}"
    send_telegram_alert(message)
    return jsonify({"status": "sent"})

# ============================
# MAIN
# ============================
if __name__ == '__main__':
    threading.Thread(target=publish_loop, daemon=True).start()
    logger.info(f" Simulateur démarré sur {HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=DEBUG)
