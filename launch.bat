@echo off
title RL Overlay
cd /d "%~dp0"

echo.
echo  ==========================================
echo   RL Overlay - Lancement
echo  ==========================================
echo.

:: Serveur Node (proxy TRN + bridge WebSocket)
echo  [1/3] Demarrage du serveur...
start "RL Overlay - Server" /min cmd /k "npm run start:server"

:: Dev server Vite
echo  [2/3] Demarrage de l'interface...
start "RL Overlay - UI" /min cmd /k "npm run start"

:: Attend que Vite soit pret (port 3005)
echo  [3/3] En attente de l'interface (port 3005)...
:WAIT_LOOP
timeout /t 1 /nobreak > nul
powershell -Command "try { (New-Object Net.Sockets.TcpClient('localhost', 3005)).Close(); exit 0 } catch { exit 1 }" > nul 2>&1
if errorlevel 1 goto WAIT_LOOP

:: Ouvre dans Chrome (tente Chrome en premier, fallback navigateur par defaut)
echo.
echo  Ouverture dans le navigateur...
start "" "http://localhost:3005"

echo.
echo  RL Overlay est en cours d'execution.
echo  Fermez les fenetres "RL Overlay - Server" et "RL Overlay - UI" pour arreter.
echo.
pause
