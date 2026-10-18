"""Run production native access helpers against synthetic, evolving IL2CPP metadata."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
locator = Path('C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe')
installs = json.loads(subprocess.check_output([str(locator), '-products', '*', '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-format', 'json']))
if not installs:
    raise SystemExit('Visual C++ x64 tools are required for native contract tests.')
installs.sort(key=lambda item: tuple(map(int, item['installationVersion'].split('.'))), reverse=True)
compiler = Path(installs[0]['installationPath']) / 'VC/Auxiliary/Build/vcvars64.bat'
(ROOT / 'local').mkdir(exist_ok=True)
batch = ROOT / 'local/check-native-contracts.cmd'
batch.write_text(f'@echo off\ncall "{compiler}" >nul\nif errorlevel 1 exit /b %errorlevel%\n'
    'cl /nologo /std:c++17 /O2 /MT /EHsc tests\\native_runtime_contracts.cpp /Fo:local\\native-contracts.obj '
    '/Fe:local\\native-contracts.exe /link user32.lib\n'
    'if errorlevel 1 exit /b %errorlevel%\nlocal\\native-contracts.exe\nexit /b %errorlevel%\n', encoding='utf-8')
subprocess.run(['cmd.exe', '/d', '/c', str(batch)], cwd=ROOT, check=True)
