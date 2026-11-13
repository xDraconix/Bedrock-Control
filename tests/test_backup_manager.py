"""Isolated regression tests for the v3.2 offline backup engine."""
import importlib.machinery
import importlib.util
import json
import os
from types import SimpleNamespace
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "system/usr-local-sbin/dracorock-backup-manager"
loader = importlib.machinery.SourceFileLoader("dracorock_backup", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
engine = importlib.util.module_from_spec(spec)
loader.exec_module(engine)


class BackupEngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.server = self.base / "minecraft_bedrock"
        self.server.mkdir()
        (self.server / "server.properties").write_text("level-name=Test\n")
        (self.server / "worlds").mkdir()
        (self.server / "worlds" / "level.dat").write_bytes(b"world data")
        self.backups = self.base / "backups"
        self.backups.mkdir()
        self.patch_server = patch.object(engine, "SERVER", self.server)
        self.patch_backups = patch.object(engine, "BACKUPS", self.backups)
        self.patch_offline = patch.object(engine, "offline", return_value=None)
        self.patch_dir = patch.object(engine, "check_backup_dir", return_value=None)
        for item in (self.patch_server, self.patch_backups, self.patch_offline, self.patch_dir):
            item.start()
            self.addCleanup(item.stop)

    def test_existing_mcserver_owned_backup_directory(self):
        self.patch_dir.stop()
        try:
            self.backups.chmod(0o750)
            with patch.object(engine.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid())):
                engine.check_backup_dir()
                self.backups.chmod(0o770)
                with self.assertRaises(engine.BackupError):
                    engine.check_backup_dir()
        finally:
            self.patch_dir.start()

    def test_preflight_without_service_changes(self):
        files, total = engine.check_source()
        self.assertEqual(files, 2)
        self.assertGreater(total, 0)

    def test_archive_name_validation(self):
        result = engine.create()
        self.assertTrue(engine.NAME_RE.fullmatch(result["archive"]))
        self.assertFalse(engine.NAME_RE.fullmatch(result["archive"] + ".json"))

    def test_backup_worker_preflights_and_restarts(self):
        worker = (Path(__file__).resolve().parents[1] /
                  "system/usr-local-sbin/bedrock-panel-update-worker").read_text()
        self.assertIn('"$ENGINE" preflight', worker)
        self.assertIn("trap 'restart_minecraft", worker)
        self.assertLess(worker.index('"$ENGINE" preflight'),
                        worker.index('/usr/bin/systemctl stop "$SERVICE"'))
        self.assertIn('"$ENGINE" create', worker)

    def test_create_and_verify(self):
        result = engine.create()
        self.assertEqual(result["files"], 2)
        self.assertEqual(result["sha256"], engine.digest(self.backups / result["archive"]))
        self.assertEqual(engine.verify(result["archive"])["ok"], True)
        self.assertEqual(json.loads((self.backups / (result["archive"] + ".json")).read_text())["sha256"], result["sha256"])

    def test_corruption_detected(self):
        result = engine.create()
        with (self.backups / result["archive"]).open("ab") as stream:
            stream.write(b"tampered")
        with self.assertRaises(engine.BackupError):
            engine.verify(result["archive"])

    def test_missing_manifest_rejected(self):
        result = engine.create()
        (self.backups / (result["archive"] + ".json")).unlink()
        with self.assertRaises(engine.BackupError):
            engine.verify(result["archive"])

    def test_path_traversal_rejected(self):
        with self.assertRaises(engine.BackupError):
            engine.verify("../unsafe.tar.gz")

    def test_source_symlink_rejected(self):
        (self.server / "worlds" / "external").symlink_to(self.base)
        with self.assertRaises(engine.BackupError):
            engine.check_source()

    def test_source_hardlink_rejected(self):
        (self.server / "worlds" / "copy.dat").hardlink_to(self.server / "worlds" / "level.dat")
        with self.assertRaises(engine.BackupError):
            engine.check_source()

    def test_no_final_archive_when_validation_fails(self):
        with patch.object(engine, "validate_archive", side_effect=engine.BackupError("bad tar")):
            with self.assertRaises(engine.BackupError):
                engine.create()
        self.assertEqual(list(self.backups.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
