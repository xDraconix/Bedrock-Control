#!/usr/bin/env python3
"""Read-only Bedrock level.dat metadata test with generated Little Endian NBT."""
import importlib.util
import os
import pathlib
import struct
import tempfile

SCRIPT=pathlib.Path(__file__).resolve().parents[1]/'system/usr-local-sbin/bedrock-world-manager'
module=importlib.util.spec_from_file_location('world_manager',str(SCRIPT))
# The production script has no .py extension: load source explicitly.
from importlib.machinery import SourceFileLoader
module=SourceFileLoader('world_manager',str(SCRIPT)).load_module()

def named(tag,name,payload):
    name=name.encode('utf-8')
    return bytes([tag])+struct.pack('<H',len(name))+name+payload

def string(value):
    raw=value.encode('utf-8')
    return struct.pack('<H',len(raw))+raw

def bedrock(seed,game_mode=0,difficulty=2):
    payload=(b'\x0a'+string('')+
      named(4,'RandomSeed',struct.pack('<q',seed))+
      named(3,'GameType',struct.pack('<i',game_mode))+
      named(3,'Difficulty',struct.pack('<i',difficulty))+
      named(8,'LevelName',string('Prüfwelt'))+
      named(10,'OtherCompound',named(8,'ignored',string('value'))+b'\x00')+
      b'\x00')
    return struct.pack('<II',10,len(payload))+payload

with tempfile.TemporaryDirectory() as folder:
    world=pathlib.Path(folder)
    for seed in (0,42,-1,-9223372036854775808,9223372036854775807):
        (world/'level.dat').write_bytes(bedrock(seed,1,3))
        values=module.read_world_metadata(world)
        assert values['seed']==str(seed), (seed,values)
        assert values['game_mode']=='Kreativ',values
        assert values['difficulty']=='Schwer',values
        assert values['level_name']=='Prüfwelt',values
    (world/'level.dat').write_bytes(b'garbage')
    assert module.read_world_metadata(world)['seed'] is None
    (world/'level.dat').write_bytes(bedrock(5)[:-3])
    assert module.read_world_metadata(world)['seed'] is None
    os.unlink(world/'level.dat')
    (world/'level.dat').symlink_to('/etc/passwd')
    assert module.read_world_metadata(world)['seed'] is None
print('OK: Read-only Bedrock NBT metadata, signed 64-bit seeds, damaged files and symlinks')
