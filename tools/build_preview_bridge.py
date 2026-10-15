"""Compile only our optional companion DLL against the owner's installed references."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import struct
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from trackgroups.runtime import discover_games

def managed(path):
    try:
        with path.open('rb') as stream:
            if stream.read(2) != b'MZ': return False
            stream.seek(0x3c); pe=struct.unpack('<I',stream.read(4))[0]
            stream.seek(pe)
            if stream.read(4) != b'PE\0\0': return False
            stream.seek(pe+24);magic=struct.unpack('<H',stream.read(2))[0]
            stream.seek(pe+24+(112 if magic==0x20b else 96)+14*8)
            return struct.unpack('<II',stream.read(8))[0] != 0
    except (OSError,struct.error): return False

def build(game):
    game=Path(game).resolve()
    props=ET.Element('Project');group=ET.SubElement(props,'ItemGroup')
    references={}
    for folder in ('dotnet','BepInEx/core','BepInEx/interop'):
        for file in (game/folder).glob('*.dll'):
            if not managed(file): continue
            if file.stem == 'System' and folder.endswith('interop'): continue
            references[file.stem]=file
    for name in ('BepInEx.Unity.IL2CPP','Il2CppInterop.Runtime','Assembly-CSharp'):
        if name not in references: raise ValueError('Install current BepInEx IL2CPP and run the game once: missing '+name)
    for name,file in references.items():
        r=ET.SubElement(group,'Reference',Include=name)
        ET.SubElement(r,'HintPath').text=str(file)
        ET.SubElement(r,'Private').text='false'
    output=ROOT/'local/preview-bridge';output.mkdir(parents=True,exist_ok=True)
    path=output/'References.props';ET.ElementTree(props).write(path,encoding='utf-8',xml_declaration=True)
    subprocess.run(['dotnet','build',str(ROOT/'preview-bridge/TK2.Garage.Preview.csproj'),'-c','Release','-p:LocalReferences='+str(path),'--nologo'],cwd=ROOT,check=True)
    shutil.copy2(ROOT/'preview-bridge/bin/Release/net6.0/TK2.Garage.Preview.dll',output/'TK2.Garage.Preview.dll')
    print('Companion compiled:',output/'TK2.Garage.Preview.dll')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--game')
    args=parser.parse_args();games=discover_games();build(args.game or (games[0] if len(games)==1 else parser.error('Specify --game')))
