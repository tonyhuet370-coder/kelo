@echo off
REM Script de déploiement Kélonia sur Synology NAS
REM Nécessite SSH disponible

setlocal enabledelayedexpansion

cls
echo.
echo ====================================================
echo  Kelonia - Deployment sur Synology NAS
echo ====================================================
echo.

REM Configuration
set /p NAS_IP="Entrer l'IP du NAS (ex: 192.168.1.50): "
set /p NAS_USER="Nom d'utilisateur SSH [admin]: "
if "!NAS_USER!"=="" set NAS_USER=admin

set /p WEB_PORT="Port du site web sur le NAS [8080]: "
if "!WEB_PORT!"=="" set WEB_PORT=8080

set /p MQTT_BROKER="IP du broker MQTT [172.19.216.4]: "
if "!MQTT_BROKER!"=="" set MQTT_BROKER=172.19.216.4

set /p MQTT_TOPIC="Topic MQTT Telegraf [kelo/#]: "
if "!MQTT_TOPIC!"=="" set MQTT_TOPIC=kelo/#

REM Vérifier SSH
ssh -V >nul 2>&1
if %errorlevel% neq 0 (
    echo  SSH n'est pas disponible. Installer OpenSSH ou Git Bash.
    pause
    exit /b 1
)

echo.
echo ✓ Configuration:
echo   NAS IP: !NAS_IP!
echo   Utilisateur: !NAS_USER!
echo   Port Web: !WEB_PORT!
echo   Broker MQTT: !MQTT_BROKER!
echo   Topic MQTT: !MQTT_TOPIC!
echo.
echo La stack (web + broker + telegraf + influxdb + grafana) sera déployée!

REM Copier les fichiers
echo  Copie des fichiers vers le NAS...
scp -r . !NAS_USER!@!NAS_IP!:/volume1/docker/kelo/
if %errorlevel% neq 0 (
    echo  Erreur lors de la copie
    pause
    exit /b 1
)

REM Configuration du .env
echo  Configuration du .env...
ssh !NAS_USER!@!NAS_IP! "cd /volume1/docker/kelo && printf 'WEB_PORT=!WEB_PORT!\nSIMULATEUR_PORT=5000\nMQTT_BROKER=!MQTT_BROKER!\nMQTT_PORT=1883\nMQTT_TOPIC=!MQTT_TOPIC!\nINFLUXDB_ORG=kelonia\nINFLUXDB_BUCKET=kelonia\nINFLUXDB_TOKEN=kelonia-super-token\n' > .env && echo .env cree"
if %errorlevel% neq 0 (
    echo  Erreur lors de la configuration .env
    pause
    exit /b 1
)

REM Démarrer Docker
echo  Démarrage des conteneurs...
ssh !NAS_USER!@!NAS_IP! "cd /volume1/docker/kelo && docker-compose down 2>/dev/null && docker-compose up -d && sleep 3 && docker-compose ps"
if %errorlevel% neq 0 (
    echo  Erreur lors du démarrage des conteneurs
    pause
    exit /b 1
)

echo.
echo  Déploiement réussi!
echo.
echo  Accès au site:
echo    http://!NAS_IP!:!WEB_PORT!
echo.
echo  Parametres monitoring:
echo    • Web (Nginx) port !WEB_PORT!
echo    • Broker MQTT !MQTT_BROKER!:1883
echo    • Topic Telegraf !MQTT_TOPIC!
echo    • InfluxDB/Grafana actifs sur le NAS
echo Commandes SSH utiles:
echo   ssh !NAS_USER!@!NAS_IP! "cd /volume1/docker/kelo && docker-compose logs -f"
echo   ssh !NAS_USER!@!NAS_IP! "cd /volume1/docker/kelo && docker-compose restart"
echo   ssh !NAS_USER!@!NAS_IP! "cd /volume1/docker/kelo && docker-compose down"
echo.
pause
