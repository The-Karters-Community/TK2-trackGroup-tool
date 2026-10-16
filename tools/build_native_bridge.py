"""Build the authored x64 bridge with the installed Visual C++ tools."""
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
locator=Path("C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe")
if not locator.is_file():raise SystemExit("Visual Studio C++ Build Tools are required to build the native bridge.")
installs=json.loads(subprocess.check_output([str(locator),"-products","*","-requires","Microsoft.VisualStudio.Component.VC.Tools.x86.x64","-format","json"]))
if not installs:raise SystemExit("Install the Visual C++ x64 compiler component.")
installs.sort(key=lambda item:tuple(int(n) for n in item['installationVersion'].split('.')),reverse=True)
compiler=Path(installs[0]["installationPath"])/"VC/Auxiliary/Build/vcvars64.bat"
(ROOT/"local").mkdir(exist_ok=True)
batch=ROOT/'local/build-quick-bridge.cmd'
batch.write_text(f'@echo off\ncall "{compiler}" >nul\nif errorlevel 1 exit /b %errorlevel%\ncl /nologo /O2 /MT /EHsc /LD native-bridge\\QuickSetup.cpp /Fo:local\\QuickSetup.obj /link /OUT:native-bridge\\BobbyGarage.QuickSetup.dll /IMPLIB:local\\QuickSetup.lib user32.lib\nexit /b %errorlevel%\n',encoding='utf-8')
subprocess.run(["cmd.exe","/d","/c",str(Path("local")/"build-quick-bridge.cmd")],cwd=ROOT,check=True)
