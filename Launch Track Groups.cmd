@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if errorlevel 1 goto fail
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto fail
if not exist "node_modules\vite" call npm.cmd ci
if errorlevel 1 goto fail
call npm.cmd run build
if errorlevel 1 goto fail
start "" ".venv\Scripts\pythonw.exe" launch.py
exit /b
:fail
echo Setup failed. See README.md for contributor prerequisites.
pause
