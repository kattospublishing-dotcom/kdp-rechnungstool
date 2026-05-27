@echo off
setlocal

cd /d "%~dp0"

if not exist node_modules (
  echo Installiere Abhaengigkeiten...
  call npm install
  if errorlevel 1 (
    echo.
    echo Fehler: npm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
)

echo Baue Browser-App...
call npm run build
if errorlevel 1 (
  echo.
  echo Fehler: Build ist fehlgeschlagen.
  pause
  exit /b 1
)

echo Starte KDP Rechnungstool...
start "KDP Rechnungstool Server" cmd /k "cd /d ""%~dp0"" && npm run server"

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5174"

echo.
echo KDP Rechnungstool wurde im Browser geoeffnet:
echo http://127.0.0.1:5174
echo.
echo Dieses Fenster kann geschlossen werden. Das Server-Fenster muss offen bleiben, solange du die App nutzt.
pause
