import asyncio
import json
import os
from aiohttp import web
import threading
import paho.mqtt.client as mqtt


MQTT_BROKER = os.getenv('MQTT_BROKER', 'mosquitto')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
TOPIC = os.getenv('MQTT_TOPIC', 'kelo/#')


latest = {}

clients = set()

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
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_forever()

async def init_app():
    # Application web: 2 endpoints de lecture
    # - /collector/latest : snapshot JSON
    # - /collector/events : stream SSE
    app = web.Application()
    app.router.add_get('/collector/events', sse_handler)
    app.router.add_get('/collector/latest', latest_handler)
    return app

if __name__ == '__main__':
    # Initialisation de la boucle asyncio principale.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Lancement du consommateur MQTT en arrière-plan.
    t = threading.Thread(target=mqtt_thread, daemon=True)
    t.start()

    # Lancement du serveur HTTP (aiohttp) exposant latest + SSE.
    web.run_app(init_app(), host='0.0.0.0', port=8081)
