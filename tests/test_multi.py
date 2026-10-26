import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch, MagicMock
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import install
from runner import Programs


class WorkspaceTests(unittest.TestCase):
    def test_log_file_exists_before_worker_launch(self):
        setup = (ROOT / 'setup.sh').read_text()
        self.assertLess(setup.index('touch /var/log/codynick-multi/install.log'), setup.index('systemd-run'))
        self.assertIn('tail -n 30 -F', setup)
        self.assertIn('tail -n 30 -F /var/log/codynick-multi/install.log 9>&-', setup)
        self.assertLess(setup.index('exec 9>&-'), setup.index('tail -n 30 -F'))

    def test_password_changes_check_permissions_without_restarting_scripts(self):
        from contextlib import nullcontext
        saved = {'teacher': {'slot': 0, 'role': 'admin', 'hash': 'adminhash'},
                 'bob': {'slot': 1, 'role': 'student', 'hash': 'oldhash'}}
        with patch('install.accounts_lock', nullcontext), patch('install.accounts', return_value=saved), patch('install.save_accounts'), patch('install.sync_gateway_accounts') as sync, patch('install.configure_account') as provision, patch('install.encode_password', return_value='newhash'), patch('gateway.verify_password', return_value=False):
            with self.assertRaises(PermissionError):
                install.change_password('bob', 'teacher', 'password123', reset=True)
            with self.assertRaises(PermissionError):
                install.change_password('bob', 'bob', 'password123', 'wrong')
            with self.assertRaises(PermissionError):
                install.change_password('bob', 'teacher', 'password123', 'anything')
            install.change_password('teacher', 'bob', 'password123', reset=True)
            self.assertEqual(saved['bob']['hash'], 'newhash')
            self.assertEqual(saved['teacher']['hash'], 'adminhash')
            provision.assert_not_called()
            sync.assert_called_once()

    def test_role_migration_uses_first_account(self):
        saved = {'student1': {'slot': 1}, 'teacher': {'slot': 0}}
        install.migrate_roles(saved)
        self.assertEqual(saved['teacher']['role'], 'admin')
        self.assertEqual(saved['student1']['role'], 'student')
        self.assertEqual(install.migrate_roles(saved), saved)

    def test_waits_for_reload_to_open_new_listener(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'student1 workspace'
        with patch('install.urllib.request.urlopen', side_effect=[urllib.error.URLError('refused'), response]) as get, patch('install.time.sleep'):
            install.wait_for_workspace('student1', 8101)
        self.assertEqual(get.call_count, 2)

    def test_web_creation_checks_admin_and_forces_student_role(self):
        from contextlib import nullcontext
        saved = {'teacher': {'slot': 0, 'role': 'admin'}, 'bob': {'slot': 1, 'role': 'student'}}
        with patch('install.accounts_lock', nullcontext), patch('install.accounts', return_value=saved), patch('install.finish_account'), patch('install.save_accounts'), patch('install.encode_password', return_value='HASH'):
            with self.assertRaises(PermissionError):
                install.add_student('bob', 'other', 'password123')
            install.add_student('teacher', 'other', 'password123')
        self.assertEqual(saved['other']['role'], 'student')
        self.assertEqual(saved['other']['hash'], 'HASH')

    def account(self, slot):
        return dict(slot=slot, hash='$6$testhash', db_password='a' * 48)

    def test_name_validation(self):
        for value in ('../alice', 'a;rm', 'A', '', 'a' * 21, '7bob'):
            with self.assertRaises(ValueError):
                install.validate_name(value)
        self.assertEqual(install.validate_name('student_1'), 'student_1')

    def test_two_accounts_and_update_preserve_work(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            alice, ap, asp = install.provision('alice', self.account(0), ROOT, data)
            bob, bp, bsp = install.provision('bob', self.account(1), ROOT, data)
            self.assertEqual((ap, bp, asp, bsp), (8100, 8101, 9200, 9202))
            for home, name, port in ((alice, 'alice', 9201), (bob, 'bob', 9203)):
                self.assertTrue((home / 'web/assets/browser-worker.js').exists())
                self.assertIn('CODY_BROWSER_ACCOUNT=' + json.dumps(name), (home / 'web/blocks/index.php').read_text())
                self.assertIn('browser-adapter.js', (home / 'web/dashboard/index.php').read_text())
                self.assertIn('browser-state.js', (home / 'simulator/index.html').read_text())
                config = (home / 'web/code/config.php').read_text()
                self.assertIn((home / 'active_script.py').as_posix(), config)
                self.assertNotIn('/home/client', config)
                blocks = (home / 'web/blocks/index.php').read_text()
                self.assertIn((home / 'control.sock').as_posix(), blocks)
                self.assertNotIn('/run/codynick-script-control.sock', blocks)
                stage = (home / 'web/blocks/stage.php').read_text()
                self.assertIn(f'127.0.0.1:{port}', stage)
                bridge = (home / 'lib/SpriteStage.py').read_text()
                self.assertIn(f'127.0.0.1:{port}', bridge)
                self.assertIn(f'cnmu_{name}', (home / 'lib/Dashboard.py').read_text())
                self.assertIn(f'cnmu_{name}', (home / 'web/dashboard/config.php').read_text())
                self.assertIn('exclusive=True', (home / 'lib/CodyNick.py').read_text())
                self.assertIn("fetch('/simulation/state'", (home / 'simulator/app.js').read_text())
                self.assertTrue((home / 'web/favicon.ico').exists())
                self.assertTrue((home / 'web/blocks/vendor/blockly/blockly.min.js').exists())
            saved = alice / 'web/blocks/data/designs/own.json'
            saved.write_text('{"my": "design"}')
            main = alice / 'web/blocks/data/main.json'
            main.write_text('{"my": "workspace"}')
            active = alice / 'active_script.py'
            active.write_text('print("my code")')
            project = alice / 'userfiles/mine.py'
            project.write_text('print(123)')
            token = (alice / 'token').read_text()
            install.provision('alice', self.account(0), ROOT, data)
            self.assertEqual(saved.read_text(), '{"my": "design"}')
            self.assertEqual(main.read_text(), '{"my": "workspace"}')
            self.assertEqual(active.read_text(), 'print("my code")')
            self.assertEqual(project.read_text(), 'print(123)')
            self.assertEqual((alice / 'token').read_text(), token)
            self.assertFalse((bob / 'userfiles/mine.py').exists())

    def test_setup_does_not_install_ai_or_alter_networking(self):
        source = (ROOT / 'install.py').read_text()
        for operation in ('netplan apply', 'hostapd', 'torch==', 'llama_cpp', 'ufw allow'):
            self.assertNotIn(operation, source)

    def test_manifest(self):
        if (ROOT / 'release.json').exists():
            install.verify(ROOT)


@unittest.skipUnless(os.name == 'posix', 'POSIX process groups required')
class RunnerTests(unittest.TestCase):
    def test_stop_only_own_user_and_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            a = Path(temp) / 'alice'
            b = Path(temp) / 'bob'
            for home in (a, b):
                home.mkdir()
                (home / 'active_script.py').write_text('import time\nprint("started",flush=True)\ntime.sleep(60)\n')
            alice, bob = Programs(a, sys.executable), Programs(b, sys.executable)
            try:
                alice.control('start')
                bob.control('start')
                time.sleep(.2)
                first = alice.process
                alice.control('stop')
                self.assertIsNotNone(first.poll())
                self.assertIsNone(bob.process.poll())
                alice.control('start')
                self.assertNotEqual(first.pid, alice.process.pid)
                with self.assertRaises(ValueError):
                    bob.control('restart;bad')
                self.assertIsNone(bob.process.poll())
            finally:
                alice.control('stop')
                bob.control('stop')


if __name__ == '__main__':
    unittest.main()
