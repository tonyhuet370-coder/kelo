import asyncio
import json
import os
import ssl
import sqlite3
import time
from aiohttp import web
import threading
import paho.mqtt.client as mqtt
from datetime import datetime


MQTT_BROKER = os.getenv('MQTT_BROKER', 'mosquitto')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
TOPIC = os.getenv('MQTT_TOPIC', 'kelo/#')
DB_PATH = os.getenv('DB_PATH', 'data/results.db')
SSL_ENABLED = os.getenv('SSL_ENABLED', 'false').lower() in ('1', 'true', 'yes', 'on')
SSL_CERT_PATH = os.getenv('SSL_CERT_PATH', 'certs/server.crt')
SSL_KEY_PATH = os.getenv('SSL_KEY_PATH', 'certs/server.key')
SSL_PORT = int(os.getenv('SSL_PORT', 8443))

latest = {}

clients = set()

db_conn = None
_db_lock = threading.Lock()


def init_db() -> None:
    global db_conn
    if not os.path.exists(os.path.dirname(DB_PATH) or '.'):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    db_conn.row_factory = sqlite3.Row
    cursor = db_conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at TEXT NOT NULL,
            topic TEXT NOT NULL,
            nid TEXT,
            payload TEXT NOT NULL
        )
        """
    )
    db_conn.commit()


def store_result(data: dict, topic: str, nid: str | None) -> int:
    payload = json.dumps(data, ensure_ascii=False)
    received_at = datetime.utcnow().isoformat() + 'Z'
    with _db_lock:
        cursor = db_conn.cursor()
        cursor.execute(
            "INSERT INTO results (received_at, topic, nid, payload) VALUES (?, ?, ?, ?)",
            (received_at, topic, nid, payload),
        )
        db_conn.commit()
        return cursor.lastrowid


def query_results(limit: int = 100, nid: str | None = None) -> list[dict]:
    sql = "SELECT id, received_at, topic, nid, payload FROM results"
    params: tuple = ()
    if nid:
        sql += " WHERE nid = ?"
        params = (nid,)
    sql += " ORDER BY id DESC LIMIT ?"
    params = (*params, limit)

    with _db_lock:
        cursor = db_conn.cursor()
        cursor.execute(sql, params)
        rows = cursor.fetchall()

    return [
        {
            "id": row["id"],
            "received_at": row["received_at"],
            "topic": row["topic"],
            "nid": row["nid"],
            "payload": json.loads(row["payload"]),
        }
        for row in rows
    ]

loop = None

async def sse_handler(request):
    global clients
    
    resp = web.StreamResponse(status=200, reason='OK', headers={'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive'})
    await resp.prepare(request)
    clients.add(resp)
    try:
        
        if latest:
            await resp.write(f"data: {json.dumps(latest)}\n\n".encode())
        while True:
            await asyncio.sleep(15)
            
            await resp.write(b": keep-alive\n\n")
    except asyncio.CancelledError:
        pass
    finally:
        clients.discard(resp)
    return resp

async def latest_handler(request):
   
    return web.json_response(latest if latest else {})

async def results_handler(request):
    params = request.rel_url.query
    limit = int(params.get('limit', 100))
    nid = params.get('nid')
    if limit <= 0:
        limit = 100

    results = query_results(limit=limit, nid=nid)
    return web.json_response({
        "count": len(results),
        "results": results,
    })

def on_connect(client, userdata, flags, rc):
   
    client.subscribe(TOPIC)

def on_message(client, userdata, msg):
    try:
        payload = msg.payload.decode()
        data = json.loads(payload)
    except Exception:
       
        return

    
   
    nid = data.get('nid', 'unknown')
    latest['nid'] = nid
    latest['topic'] = msg.topic
    latest['data'] = data

    try:
        store_result(data, msg.topic, nid)
    except Exception as err:
        print(f"Erreur d'enregistrement en base : {err}", flush=True)

    # On diffuse immédiatement la nouvelle valeur à tous les clients SSE connectés.
    # Le callback MQTT tourne dans un thread, donc on passe par run_coroutine_threadsafe.
    if loop:
        asyncio.run_coroutine_threadsafe(broadcast(latest), loop)

async def broadcast(data):
    # On clone `clients` (list(clients)) pour éviter les erreurs si le set change pendant la boucle.
    for resp in list(clients):
        try:
            await resp.write(f"data: {json.dumps(data)}\n\n".encode())
        except Exception:
            # Client déconnecté: on le retire de la liste active.
            clients.discard(resp)

def mqtt_thread():
    # Client MQTT exécuté dans un thread dédié pour ne pas bloquer aiohttp.
    while True:
        client = mqtt.Client()
        client.on_connect = on_connect
        client.on_message = on_message

        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            client.loop_forever()
        except Exception as err:
            print(f"MQTT connection error to {MQTT_BROKER}:{MQTT_PORT}: {err}", flush=True)
            time.sleep(5)
        finally:
            try:
                client.loop_stop()
            except Exception:
                pass
            try:
                client.disconnect()
            except Exception:
                pass

async def init_app():
    # Application web: endpoints de lecture
    # - /collector/latest : snapshot JSON
    # - /collector/events : stream SSE
    # - /collector/results : historique JSON
    app = web.Application()
    app.router.add_get('/collector/events', sse_handler)
    app.router.add_get('/collector/latest', latest_handler)
    app.router.add_get('/collector/results', results_handler)
    return app


def create_ssl_context() -> ssl.SSLContext | None:
    if not SSL_ENABLED:
        return None

    if not os.path.isfile(SSL_CERT_PATH) or not os.path.isfile(SSL_KEY_PATH):
        raise FileNotFoundError(
            f"Certificat TLS introuvable: {SSL_CERT_PATH} ou {SSL_KEY_PATH}. "
            "Définissez les variables d'environnement SSL_CERT_PATH et SSL_KEY_PATH."
        )

    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    context.load_cert_chain(SSL_CERT_PATH, SSL_KEY_PATH)
    return context


if __name__ == '__main__':
    # Initialisation de la base de données locale.
    init_db()

    # Initialisation de la boucle asyncio principale.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Lancement du consommateur MQTT en arrière-plan.
    t = threading.Thread(target=mqtt_thread, daemon=True)
    t.start()

    ssl_context = create_ssl_context()
    if ssl_context is not None:
        print(f"Démarrage en HTTPS sur le port {SSL_PORT}", flush=True)
        web.run_app(init_app(), host='0.0.0.0', port=SSL_PORT, ssl_context=ssl_context)
    else:
        print("Démarrage en HTTP sur le port 8081", flush=True)
        web.run_app(init_app(), host='0.0.0.0', port=8081)
