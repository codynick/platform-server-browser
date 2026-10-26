from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import https_setup as tls


VALUE = dict(domain='browser.example.com', email='teacher@example.com', agree_tos=True)


class HttpsSetupTests(unittest.TestCase):
    def test_validation(self):
        self.assertEqual(tls.validate_domain('Browser.Example.com.'), 'browser.example.com')
        for name in ['127.0.0.1', 'https://example.com', 'example.com/path', '-d.example.com', 'example.com\nEvil', '*.example.com', 'localhost']:
            with self.assertRaises(ValueError): tls.validate_domain(name)
        with self.assertRaises(ValueError): tls.validate_settings({**VALUE, 'agree_tos': False})
        with self.assertRaises(ValueError): tls.validate_settings({**VALUE, 'email': 'bad\nemail'})

    def test_http_remains_available_until_certificates_exist(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(tls, 'settings', return_value=VALUE):
            root = Path(temp)
            conf = tls.gateway_conf(certificates=root, webroot=root / 'acme')
            self.assertIn('ProxyPass /.well-known/acme-challenge/ !', conf)
            self.assertNotIn('<VirtualHost *:443>', conf)
            self.assertNotIn('RewriteRule', conf)
            cert = root / VALUE['domain']
            cert.mkdir()
            (cert / 'fullchain.pem').touch()
            (cert / 'privkey.pem').touch()
            conf = tls.gateway_conf(certificates=root, webroot=root / 'acme')
            self.assertIn('<VirtualHost *:443>', conf)
            self.assertIn('https://browser.example.com%{REQUEST_URI}', conf)
            self.assertIn('RequestHeader unset X-Forwarded-Proto', conf)
            self.assertIn('RequestHeader set X-Forwarded-Proto "https"', conf)

    def test_no_prompt_in_background(self):
        with patch.object(tls, 'settings', return_value=None), patch('https_setup.sys.stdin.isatty', return_value=False), patch('builtins.input') as prompt:
            tls.prepare()
            prompt.assert_not_called()

    def test_enabling_is_renewable_and_not_forced(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            cert = root / VALUE['domain']
            cert.mkdir()
            (cert / 'fullchain.pem').touch()
            (cert / 'privkey.pem').touch()
            runner, writer, configure = Mock(), Mock(), Mock()
            with patch.object(tls, 'settings', return_value=VALUE), patch.object(tls, 'CERTIFICATES', root), patch.object(tls, 'WEBROOT', root / 'acme'):
                self.assertEqual(tls.enable(runner, writer, configure), 'https://browser.example.com/')
            args = runner.call_args_list[0].args
            self.assertIn('--keep-until-expiring', args)
            self.assertNotIn('--force-renewal', args)
            runner.assert_any_call('systemctl', 'enable', '--now', 'certbot.timer')
            configure.assert_called_once()
            self.assertIn('systemctl reload apache2', writer.call_args.args[1])

    def test_failed_request_does_not_enable_redirect(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(tls, 'settings', return_value=VALUE), patch.object(tls, 'WEBROOT', Path(temp)):
            configure = Mock()
            with self.assertRaisesRegex(RuntimeError, 'SAME setup command'):
                tls.enable(Mock(side_effect=RuntimeError('request failed')), Mock(), configure)
            configure.assert_not_called()
