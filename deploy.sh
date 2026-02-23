#!/bin/bash
# Script de déploiement Kélonia dans une VM

set -e

echo " Kélonia - Installation dans la VM"
echo "======================================"

# Vérifier Docker
if ! command -v docker &> /dev/null; then
    echo " Docker n'est pas installé"
    echo "Installation: https://docs.docker.com/install/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo " Docker Compose n'est pas installé"
    echo "Installation: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✓ Docker et Docker Compose trouvés"

# Démarrer les services
echo ""
echo "Démarrage des services..."
docker-compose up -d

# Attendre que les services soient prêts
echo " Attente du démarrage des services..."
sleep 5

# Vérifier le statut
echo ""
echo " Statut des services:"
docker-compose ps

# Afficher les informations
echo ""
echo " Déploiement réussi!"
echo ""
echo " Accès:"
hostname_ip=$(hostname -I | awk '{print $1}')
echo "   Site web: http://$hostname_ip"
echo "   API:      http://$hostname_ip/api/data"
echo ""
echo "Logs en temps réel: docker-compose logs -f"
echo "Arrêter:           docker-compose down"
