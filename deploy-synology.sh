#!/bin/bash
#Script de déploiement Kélonia sur Synology NAS

set -e

echo ""
echo "===================================================="
echo " Kelonia - Deployment sur Synology NAS"
echo "===================================================="
echo ""

# Configuration
read -p "Entrer l'IP du NAS (ex: 192.168.1.50): " NAS_IP
read -p "Nom d'utilisateur SSH [admin]: " NAS_USER
NAS_USER=${NAS_USER:-admin}

read -p "Port du site web sur le NAS [8080]: " WEB_PORT
WEB_PORT=${WEB_PORT:-8080}

# Vérifier SSH
if ! command -v ssh &> /dev/null; then
    echo " SSH n'est pas disponible"
    exit 1
fi

echo ""
echo "✓ Configuration:"
echo "  NAS IP: $NAS_IP"
echo "  Utilisateur: $NAS_USER"
echo "  Port Web: $WEB_PORT"
echo ""
echo "Les deux conteneurs (web + simulateur) seront déployés!"
echo ""

# Copier les fichiers
echo "Copie des fichiers vers le NAS..."
scp -r . "$NAS_USER@$NAS_IP:/volume1/docker/kelo/" || exit 1

# Configuration du .env
echo "  Configuration du .env..."
ssh "$NAS_USER@$NAS_IP" << EOF
cd /volume1/docker/kelo
cat > .env << INNER_EOF
WEB_PORT=$WEB_PORT
SIMULATEUR_PORT=5000
INNER_EOF
echo "✓ .env créé"
EOF

# Démarrer Docker
echo " Démarrage des conteneurs..."
ssh "$NAS_USER@$NAS_IP" << EOF
cd /volume1/docker/kelo
docker-compose down 2>/dev/null || true
docker-compose up -d
sleep 3
docker-compose ps
EOF

echo ""
echo " Déploiement réussi!"
echo ""
echo " Accès au site:"
echo "   http://$NAS_IP:$WEB_PORT"
echo ""
echo " Les deux conteneurs communiquent via le réseau Docker:"
echo "   • Web (Nginx) port $WEB_PORT"
echo "   • Simulateur (Flask) port 5000"
echo ""
echo "Commandes SSH utiles:"
echo "  Logs:       ssh $NAS_USER@$NAS_IP 'cd /volume1/docker/kelo && docker-compose logs -f'"
echo "  Redémarrer: ssh $NAS_USER@$NAS_IP 'cd /volume1/docker/kelo && docker-compose restart'"
echo "  Arrêter:    ssh $NAS_USER@$NAS_IP 'cd /volume1/docker/kelo && docker-compose down'"
echo ""
