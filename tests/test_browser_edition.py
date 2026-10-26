import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import install


class BrowserEditionTests(unittest.TestCase):
    def test_existing_server_edition_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            state = data / 'state.json'
            state.write_text(json.dumps({'version': '0.1.9', 'stage': 'ready'}))
            before = state.read_bytes()
            with patch.object(install, 'DATA', data):
                with self.assertRaisesRegex(RuntimeError, 'separate test VM'):
                    install.check_edition()
                self.assertEqual(state.read_bytes(), before)
                state.write_text(json.dumps({'edition': 'browser'}))
                install.check_edition()

    def test_browser_assets_are_namespaced(self):
        root = Path(__file__).resolve().parents[1]
        self.assertIn("'codynick-browser:'+account", (root / 'browser/state.js').read_text())
        self.assertIn('new Worker(workerURL)', (root / 'browser/runtime.js').read_text())
