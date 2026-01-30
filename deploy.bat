@echo off
REM Script de déploiement Kélonia pour Windows/WSL

echo.
echo ===================================
echo 🐢 Kelonia - Deployment
echo ===================================
echo.

REM Vérifier Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker n'est pas installé ou accessible
    echo Installation: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose n'est pas installé
    pause
    exit /b 1
)

echo ✓ Docker et Docker Compose trouvés
echo.

REM Démarrer les services
echo 🚀 Démarrage des services...
docker-compose up -d

REM Attendre
timeout /t 5 /nobreak

REM Vérifier le statut
echo.
echo 📊 Statut des services:
docker-compose ps

echo.
echo ✅ Déploiement réussi!
echo.
echo 📍 Accès:
echo    Site web: http://localhost
echo    API:      http://localhost/api/data
echo.
echo Commandes utiles:
echo    Logs:     docker-compose logs -f
echo    Stop:     docker-compose down
echo.
pause
