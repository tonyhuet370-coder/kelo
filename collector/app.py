import asyncio
import json
import os
from aiohttp import web
import threading
import paho.mqtt.client as mqtt

# configuration
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
        # send current state
        if latest:
            await resp.write(f"data: {json.dumps(latest)}\n\n".encode())
        while True:
            await asyncio.sleep(15)
            # keep connection alive
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
        # ignore invalid
        return
    # store latest by nid
    nid = data.get('nid', 'unknown')
    latest['nid'] = nid
    latest['data'] = data
    # push to SSE clients via asyncio
    if loop:
        asyncio.run_coroutine_threadsafe(broadcast(latest), loop)

async def broadcast(data):
    for resp in list(clients):
        try:
            await resp.write(f"data: {json.dumps(data)}\n\n".encode())
        except Exception:
            clients.discard(resp)

def mqtt_thread():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_forever()

async def init_app():
    app = web.Application()
    app.router.add_get('/collector/events', sse_handler)
    app.router.add_get('/collector/latest', latest_handler)
    return app

if __name__ == '__main__':
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    t = threading.Thread(target=mqtt_thread, daemon=True)
    t.start()
    web.run_app(init_app(), host='0.0.0.0', port=8081)
