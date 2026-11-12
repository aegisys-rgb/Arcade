@echo off
rem Launches TRINARY full screen in Chrome or Edge. Point LaunchBox at this file.
setlocal
set "GAME=%~dp0index.html"
set "PROFILE=%LOCALAPPDATA%\TrinaryArcade"
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER (
  echo Could not find Chrome or Edge. Open index.html in a browser and press F11.
  pause
  exit /b 1
)
start "" /wait "%BROWSER%" --kiosk --edge-kiosk-type=fullscreen --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --disable-pinch --overscroll-history-navigation=0 --disable-features=Translate "%GAME%"
