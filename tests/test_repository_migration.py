#!/usr/bin/env python3
"""Offline regression tests for repository rename compatibility."""
import importlib.util
import io
import json
import pathlib
import urllib.error
import unittest
from unittest.mock import patch

SOURCE=pathlib.Path(__file__).resolve().parents[1]/'system/usr-local-sbin/bedrock-panel-self-update-worker'
spec=importlib.util.spec_from_file_location('panel_updater_migration', SOURCE)
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class Response:
    def __init__(self, url, payload, effective=None):
        self.url=effective or url
        self.body=io.BytesIO(json.dumps(payload).encode())
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def read(self,n):return self.body.read(n)

def release(repo, tag='v2.8.1'):
    zipname=f'Bedrock-Control-PRO-{tag}-Release.zip'
    prefix=f'https://github.com/{repo}/releases/download/{tag}/'
    return dict(tag_name=tag,draft=False,prerelease=False,assets=[
        dict(name=name,browser_download_url=prefix+name,size=100)
        for name in (zipname,zipname+'.manifest',zipname+'.manifest.sig')
    ])

class RepoMigrationTests(unittest.TestCase):
    def test_new_repository_preferred(self):
        calls=[]
        def urlopen(req,timeout):
            calls.append(req.full_url)
            return Response(req.full_url,release(worker.REPOSITORIES[0]))
        with patch.object(worker.urllib.request,'urlopen',side_effect=urlopen):
            tag,names,assets=worker.fetch_release('stable')
        self.assertEqual(tag,'v2.8.1')
        self.assertEqual(len(assets),3)
        self.assertEqual(len(calls),1)
        self.assertIn('DracoRock-Control',calls[0])

    def test_legacy_fallback_only_if_new_not_found(self):
        calls=[]
        def urlopen(req,timeout):
            calls.append(req.full_url)
            if len(calls)==1:
                raise urllib.error.HTTPError(req.full_url,404,'Not Found',{},None)
            return Response(req.full_url,release(worker.REPOSITORIES[1]))
        with patch.object(worker.urllib.request,'urlopen',side_effect=urlopen):
            tag,names,assets=worker.fetch_release('stable')
        self.assertEqual(len(calls),2)
        self.assertIn('Bedrock-Control',calls[-1])
        self.assertEqual(len(assets),3)

    def test_never_fallback_after_server_error(self):
        calls=[]
        def urlopen(req,timeout):
            calls.append(req.full_url)
            raise urllib.error.HTTPError(req.full_url,503,'Unavailable',{},None)
        with patch.object(worker.urllib.request,'urlopen',side_effect=urlopen):
            with self.assertRaises(urllib.error.HTTPError):
                worker.fetch_release('stable')
        self.assertEqual(len(calls),1)

    def test_redirect_is_rejected(self):
        def urlopen(req,timeout):
            return Response(req.full_url,release(worker.REPOSITORIES[0]),
                            'https://api.github.com/repos/attacker/release')
        with patch.object(worker.urllib.request,'urlopen',side_effect=urlopen):
            with self.assertRaisesRegex(RuntimeError,'Weiterleitung'):
                worker.fetch_release('stable')

    def test_untrusted_asset_urls_rejected(self):
        data=release(worker.REPOSITORIES[0])
        data['assets'][0]['browser_download_url']='https://example.org/evil.zip'
        def urlopen(req,timeout):return Response(req.full_url,data)
        with patch.object(worker.urllib.request,'urlopen',side_effect=urlopen):
            with self.assertRaisesRegex(RuntimeError,'nicht vollständig signiert'):
                worker.fetch_release('stable')

    def test_test_channel_uses_pinned_repository(self):
        def urlopen(req,timeout):
            self.assertIn('DracoRock-Control',req.full_url)
            self.assertIn('per_page=30',req.full_url)
            payload=release(worker.REPOSITORIES[0])
            payload['prerelease']=True
            return Response(req.full_url,[payload])
        with patch.object(worker.urllib.request,'urlopen',side_effect=urlopen):
            tag,_,assets=worker.fetch_release('test')
        self.assertEqual(tag,'v2.8.1')
        self.assertEqual(len(assets),3)

if __name__=='__main__':
    unittest.main()
