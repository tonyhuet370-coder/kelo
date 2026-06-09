Set-Location "C:\Users\Erwan\Desktop\depokelo\kelo\Simulateur" 
$env:MQTT_BROKER="172.19.216.4"
$env:MQTT_PORT="1883"
$env:MQTT_TOPIC="kelo/nid/A12/telemetry"
$env:PUBLISH_INTERVAL="5"
python simulateur.py