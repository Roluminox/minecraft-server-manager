@echo off
chcp 65001 >nul
title Minecraft Server Manager

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Docker Desktop n'est pas lance!
    echo.
    echo Lance Docker Desktop et reessaie.
    pause
    exit /b 1
)

if not exist "app\node_modules" (
    echo [ERREUR] Les dependances ne sont pas installees!
    echo.
    echo Lance d'abord: setup.bat
    pause
    exit /b 1
)

echo Lancement de Minecraft Server Manager...
echo.
cd app
npm run dev
