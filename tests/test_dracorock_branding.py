#!/usr/bin/env python3
"""Guard the v2.9.0 visual rename without breaking legacy signed installs."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]

class DracoRockBrandingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page=(ROOT/'app/public/index.php').read_text()
        cls.js=(ROOT/'app/public/assets/app.js').read_text()
        cls.readme=(ROOT/'README.md').read_text()
        cls.publisher=(ROOT/'release-tools/prepare-signed-release.sh').read_text()
        cls.builder=(ROOT/'release-tools/build-release.sh').read_text()
        cls.signer=(ROOT/'release-tools/sign-release.sh').read_text()
        cls.verifier=(ROOT/'system/usr-local-bin/bedrock-panel-verify-release').read_text()
        cls.applier=(ROOT/'system/usr-local-bin/bedrock-panel-apply-release').read_text()

    def test_version_and_visible_branding(self):
        self.assertEqual((ROOT/'VERSION').read_text().strip(),'2.9.0')
        for marker in ('<title>DracoRock Control</title>',
                       'DRACOROCK <span>CONTROL</span>',
                       '<b>DRACOROCK</b><small>CONTROL</small>',
                       'DracoRock Control aktualisieren',
                       'DRACOROCK CONTROL v2.9.0'):
            self.assertIn(marker,self.page)
        self.assertNotIn('BEDROCK CONTROL PRO',self.page)
        self.assertNotIn('<title>Bedrock Control PRO</title>',self.page)

    def test_asset_versions(self):
        self.assertIn('assets/app.js?v=2.9.0',self.page)
        self.assertIn('assets/app.css?v=2.9.0',self.page)

    def test_repository_links(self):
        self.assertIn('xDraconix/DracoRock-Control',self.readme)
        self.assertIn('xDraconix/DracoRock-Control',self.publisher)
        self.assertNotIn('https://github.com/xDraconix/Bedrock-Control.git',self.publisher)
        self.assertIn('DracoRock-Control',self.js)
        self.assertNotIn('xDraconix\\/Bedrock-Control\\/releases',self.js)
        self.assertIn('DracoRock Control $TAG Stable',self.publisher)

    def test_signed_legacy_protocol_preserved(self):
        for contents in (self.builder,self.signer,self.verifier):
            self.assertIn('Bedrock-Control-PRO-',contents)
        self.assertIn('bedrock-control-pro-release-v1',self.signer)
        self.assertIn('bedrock-control-pro-release-v1',self.verifier)
        self.assertIn('bedrock-control-pro-',self.builder)
        self.assertIn('bedrock-control-pro-',self.applier)

    def test_existing_install_paths_preserved(self):
        installer=(ROOT/'install.sh').read_text()
        self.assertIn('/opt/bedrock-control-pro',installer)
        self.assertIn('/etc/bedrock-control-pro',installer)
        self.assertIn('/opt/bedrock-control-pro',self.applier)

if __name__=='__main__':
    unittest.main()
