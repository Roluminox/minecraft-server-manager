@echo off
chcp 65001 >nul
title Minecraft Server Manager - Setup

echo ========================================
echo   Minecraft Server Manager - Setup
echo ========================================
echo.

echo [1/5] Verification de Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Docker n'est pas installe!
    echo Telecharge Docker Desktop: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
echo       Docker OK

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Docker Desktop n'est pas lance!
    echo Lance Docker Desktop et reessaie.
    pause
    exit /b 1
)
echo       Docker Desktop OK

echo.
echo [2/5] Verification de Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe!
    echo Telecharge Node.js: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo       Node.js %%i OK

echo.
echo [3/5] Configuration du fichier .env...
if not exist ".env" (
    echo # Minecraft Server Configuration> .env
    echo MC_VERSION=LATEST>> .env
    echo MC_TYPE=VANILLA>> .env
    echo MC_MEMORY=4G>> .env
    echo MC_MAX_PLAYERS=10>> .env
    echo MC_MOTD=Serveur Minecraft>> .env
    echo MC_DIFFICULTY=normal>> .env
    echo MC_MODE=survival>> .env
    echo MC_PVP=true>> .env
    echo MC_WHITELIST=true>> .env
    echo MC_ENFORCE_WHITELIST=true>> .env
    echo RCON_PASSWORD=changeme123>> .env
    echo TZ=Europe/Paris>> .env
    echo       .env cree avec valeurs par defaut
) else (
    echo       .env existe deja
)

echo.
echo [4/5] Installation des dependances npm...
cd app
call npm install
if %errorlevel% neq 0 (
    echo [ERREUR] npm install a echoue!
    pause
    exit /b 1
)
cd ..
echo       Dependances installees

echo.
echo [5/5] Telechargement de l'image Minecraft...
docker pull itzg/minecraft-server:java21

echo.
echo ========================================
echo   Setup termine avec succes!
echo ========================================
echo.
echo Prochaine etape: Lance start.bat
echo.
pause
