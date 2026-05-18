#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$SCRIPT_DIR/../fichier configuration"
ENV_FILE="$COMPOSE_DIR/.env"

echo "Kélonia - Déploiement de la stack temps réel"
echo "============================================"

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker n'est pas installé"
    echo "Installation: https://docs.docker.com/install/"
    exit 1
fi

if docker ps >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
    DOCKER_CMD=(sudo docker)
else
    DOCKER_CMD=(sudo docker)
fi

if "${DOCKER_CMD[@]}" compose version >/dev/null 2>&1; then
    COMPOSE_CMD=("${DOCKER_CMD[@]}" compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "Docker Compose n'est pas installé"
    echo "Installation: https://docs.docker.com/compose/install/"
    exit 1
fi

if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
    echo "docker-compose.yml introuvable dans: $COMPOSE_DIR"
    exit 1
fi

WEB_PORT="8080"
if [ -f "$ENV_FILE" ]; then
    configured_port="$(grep -E '^WEB_PORT=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2- | tr -d '[:space:]')"
    if [ -n "$configured_port" ]; then
        WEB_PORT="$configured_port"
    fi
fi

echo "Dossier compose : $COMPOSE_DIR"
echo "Commande compose: ${COMPOSE_CMD[*]}"

cd "$COMPOSE_DIR"

echo
echo "Démarrage des services web, MQTT, collector, InfluxDB, Telegraf et Grafana..."
"${COMPOSE_CMD[@]}" up -d --build

echo
echo "Attente du démarrage des services..."
sleep 5

echo
echo "Statut des services :"
"${COMPOSE_CMD[@]}" ps

hostname_ip="$(hostname -I | awk '{print $1}')"

echo
echo "Déploiement terminé"
echo
echo "Accès :"
echo "  Site web   : http://$hostname_ip:$WEB_PORT/"
echo "  Dashboard  : http://$hostname_ip:$WEB_PORT/dashboard.html"
echo "  Grafana    : http://$hostname_ip:$WEB_PORT/grafana/"
echo "  Collector  : http://$hostname_ip:$WEB_PORT/collector/latest"
echo
echo "Commandes utiles :"
echo "  Logs      : cd '$COMPOSE_DIR' && ${COMPOSE_CMD[*]} logs -f"
echo "  Redémarrer: cd '$COMPOSE_DIR' && ${COMPOSE_CMD[*]} restart"
echo "  Arrêter   : cd '$COMPOSE_DIR' && ${COMPOSE_CMD[*]} down"
