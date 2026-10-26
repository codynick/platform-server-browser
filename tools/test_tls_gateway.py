"""Exercise Apache HTTPS with a temporary test certificate, never a public ACME request."""
from pathlib import Path
import subprocess
import tempfile
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import https_setup

DOMAIN = 'tls.browser.example.test'
SITE = Path('/etc/apache2/sites-available/codynick-browser-tls-test.conf')


def run(*args):
    return subprocess.run([str(arg) for arg in args], check=True, capture_output=True, text=True).stdout


if SITE.exists():
    raise SystemExit('Refusing to replace an existing test virtual host.')
with tempfile.TemporaryDirectory(dir='/var/lib') as temp:
    root = Path(temp)
    root.chmod(0o755)
    certificates = root / 'certificates'
    cert = certificates / DOMAIN
    cert.mkdir(parents=True)
    chain, key = cert / 'fullchain.pem', cert / 'privkey.pem'
    run('openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-subj', '/CN=' + DOMAIN, '-addext', 'subjectAltName=DNS:' + DOMAIN,
        '-keyout', key, '-out', chain)
    webroot = root / 'acme'
    challenge = webroot / '.well-known/acme-challenge/test-token'
    challenge.parent.mkdir(parents=True)
    challenge.write_text('synthetic-acme-check')
    SITE.write_text(https_setup.gateway_conf(
        dict(domain=DOMAIN, email='teacher@example.com', agree_tos=True), certificates, webroot))
    try:
        run('a2enmod', 'ssl', 'rewrite', 'headers')
        run('a2ensite', SITE.stem)
        run('apache2ctl', 'configtest')
        run('systemctl', 'restart', 'apache2')
        plain = ['curl', '--silent', '--show-error', '--noproxy', DOMAIN, '--resolve', DOMAIN + ':80:127.0.0.1']
        redirect = run(*plain, '--dump-header', '-', '--output', '/dev/null', 'http://' + DOMAIN + '/login')
        assert '301' in redirect and 'Location: https://' + DOMAIN + '/login' in redirect
        challenge_reply = run(*plain, '--fail', 'http://' + DOMAIN + '/.well-known/acme-challenge/test-token')
        assert challenge_reply == 'synthetic-acme-check'
        secure = ['curl', '--fail', '--silent', '--show-error', '--noproxy', DOMAIN,
                  '--resolve', DOMAIN + ':443:127.0.0.1', '--cacert', chain]
        login = run(*secure, 'https://' + DOMAIN + '/login')
        assert 'Username' in login
        headers = run(*secure, '--dump-header', '-', '--output', '/dev/null',
            '--data-urlencode', 'username=alice', '--data-urlencode', 'password=OnlyForEphemeralCI123',
            'https://' + DOMAIN + '/login')
        assert '303' in headers and 'Set-Cookie:' in headers and '; Secure' in headers
        assert 'HttpOnly' in headers and 'SameSite=Strict' in headers
        print('Apache TLS, HTTP redirect, ACME challenge exception, proxy login and Secure session cookie passed with a temporary test certificate.')
    finally:
        run('a2dissite', SITE.stem)
        SITE.unlink()
        run('apache2ctl', 'configtest')
        run('systemctl', 'reload', 'apache2')
