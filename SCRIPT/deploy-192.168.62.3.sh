#!/usr/bin/env bash

set -euo pipefail

SERVER_IP="192.168.62.3"
PROJECT_NAME="kelo-623"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$SCRIPT_DIR/../fichier configuration"
ENV_FILE="$COMPOSE_DIR/.env.192.168.62.3"
OVERRIDE_FILE="$COMPOSE_DIR/docker-compose.192.168.62.3.yml"

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker n'est pas installé"
    exit 1
fi

if docker ps >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
else
    DOCKER_CMD=(sudo docker)
fi

if "${DOCKER_CMD[@]}" compose version >/dev/null 2>&1; then
    COMPOSE_CMD=("${DOCKER_CMD[@]}" compose)
elif command -v docker-compose >/dev/null 2>&1; then
    if docker-compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
    else
        COMPOSE_CMD=(sudo docker-compose)
    fi
else
    echo "Docker Compose n'est pas installé"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "Fichier d'environnement introuvable: $ENV_FILE"
    exit 1
fi

WEB_PORT="$(grep -E '^WEB_PORT=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2- | tr -d '[:space:]')"
WEB_PORT="${WEB_PORT:-8080}"

MQTT_EXTERNAL_NETWORK="$(grep -E '^MQTT_EXTERNAL_NETWORK=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2- | tr -d '[:space:]')"

cd "$COMPOSE_DIR"

COMPOSE_FILES=(-f "$COMPOSE_DIR/docker-compose.yml" -f "$OVERRIDE_FILE")

echo "Déploiement dédié au serveur $SERVER_IP"
echo "Projet Docker Compose: $PROJECT_NAME"
echo "Fichier d'environnement : $ENV_FILE"
echo "Broker MQTT cible      : $(grep -E '^MQTT_BROKER=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2-)"
if [ -n "$MQTT_EXTERNAL_NETWORK" ]; then
    echo "Réseau Docker broker   : $MQTT_EXTERNAL_NETWORK"
else
    echo "Mode                   : autonome local (simulateur + broker sur 192.168.62.3)"
fi

"${COMPOSE_CMD[@]}" \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    "${COMPOSE_FILES[@]}" \
    up -d --build

echo
echo "Services actifs pour $SERVER_IP :"
"${COMPOSE_CMD[@]}" \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    "${COMPOSE_FILES[@]}" \
    ps

echo
echo "Accès dédiés :"
echo "  Site web  : http://$SERVER_IP:$WEB_PORT/"
echo "  Dashboard : http://$SERVER_IP:$WEB_PORT/dashboard.html"
echo "  Grafana   : http://$SERVER_IP:$WEB_PORT/grafana/"
echo "  Simulateur: http://$SERVER_IP:$(grep -E '^SIMULATEUR_PORT=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2- | tr -d '[:space:]')/health"
echo
echo "Gestion de cette stack uniquement :"
echo "  Logs      : cd '$COMPOSE_DIR' && ${COMPOSE_CMD[*]} --project-name '$PROJECT_NAME' --env-file '$ENV_FILE' ${COMPOSE_FILES[*]} logs -f"
echo "  Restart   : cd '$COMPOSE_DIR' && ${COMPOSE_CMD[*]} --project-name '$PROJECT_NAME' --env-file '$ENV_FILE' ${COMPOSE_FILES[*]} restart"
echo "  Stop      : cd '$COMPOSE_DIR' && ${COMPOSE_CMD[*]} --project-name '$PROJECT_NAME' --env-file '$ENV_FILE' ${COMPOSE_FILES[*]} down"