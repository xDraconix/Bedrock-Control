#!/usr/bin/env python3
"""Unit-check official Mojang Bedrock version parsing without network access."""
import json
import pathlib
import shutil
import subprocess

page=(pathlib.Path(__file__).resolve().parents[1]/'app/public/index.php').read_text()
start=page.index('function latestBedrockLinuxVersion(')
end=page.index('function nethernetStatus(', start)
helper=page[start:end]
assert shutil.which('php'), 'PHP CLI required'
assert "if($api==='bedrock-update-check')" in page
assert "session_write_close();" in page
assert "--max-time','8'" in page
assert "version_compare($latest,$installed,'>')" in page

def check(links, expected):
    code="<?php\n"+helper+"\n"+(
        "$data=json_decode("+json.dumps(json.dumps({'result':{'links':links}}))+");\n"
        "echo latestBedrockLinuxVersion(json_encode($data))??'NONE';\n"
    )
    r=subprocess.run(['php'],input=code,text=True,capture_output=True,check=True)
    assert r.stdout==expected,(r.stdout,expected,r.stderr)

check([
  {'downloadType':'serverBedrockWindows','downloadUrl':'https://www.minecraft.net/bedrockdedicatedserver/bin-win/bedrock-server-1.99.9.9.zip'},
  {'downloadType':'serverBedrockPreviewLinux','downloadUrl':'https://www.minecraft.net/bedrockdedicatedserver/bin-linux-preview/bedrock-server-1.98.0.4.zip'},
  {'downloadType':'serverBedrockLinux','downloadUrl':'https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.63.1.zip'},
], '1.26.63.1')
check([
 'https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.9.1.zip',
 'https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.63.1.zip',
 'https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.62.1.zip'
], '1.26.63.1')
check([
 'https://example.com/bedrockdedicatedserver/bin-linux/bedrock-server-9.9.9.zip',
 'https://www.minecraft.net/bedrockdedicatedserver/bin-linux-preview/bedrock-server-9.9.9.zip',
 'http://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-9.9.9.zip'
], 'NONE')
check([], 'NONE')
print('OK: official Linux-only Mojang metadata parsing, numeric versions and safe failure')
