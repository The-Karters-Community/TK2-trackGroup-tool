"""Garage-only favorites and picking history. Never stored in the game profile."""
import json
import math
import threading
from .runtime import DATA, write_json

LOCK = threading.Lock()
PATH = DATA / 'library-preferences.json'

def validate(value):
    if not isinstance(value,dict) or set(value) != {'favorites','activity'}: raise ValueError('Invalid library preferences.')
    if not isinstance(value['favorites'],list) or len(value['favorites'])>5000 or any(not isinstance(k,str) or len(k)>300 for k in value['favorites']): raise ValueError('Invalid favorites.')
    if not isinstance(value['activity'],dict) or len(value['activity'])>20000: raise ValueError('Invalid library history.')
    for key,row in value['activity'].items():
        if not isinstance(key,str) or len(key)>300 or not isinstance(row,dict) or set(row)-{'added','last','count'}: raise ValueError('Invalid library history entry.')
        if any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=10**15 for v in row.values()): raise ValueError('Invalid library history number.')
    return value

def load():
    try: return validate(json.loads(PATH.read_text(encoding='utf-8')))
    except (OSError,ValueError,TypeError): return {'favorites':[], 'activity':{}}

def save(value):
    value = validate(value)
    with LOCK: write_json(PATH,value)
    return value
