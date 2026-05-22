@echo off
title Stock Monitor CORS Proxy
echo Starting Stock Monitor proxy + app server on http://127.0.0.1:8081
echo.
echo  Open in browser: http://127.0.0.1:8081
echo  In the app: Global Settings ^> Proxy URL = http://127.0.0.1:8081
echo.
start "" "http://127.0.0.1:8081"
node "%~dp0proxy.js"
pause
