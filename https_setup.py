"""Optional Let's Encrypt HTTPS for the public Apache gateway only."""
import ipaddress
import json
from pathlib import Path
import re
import sys

CONFIG = Path('/etc/codynick-multi/https.json')
CERTIFICATES = Path('/etc/letsencrypt/live')
WEBROOT = Path('/var/lib/codynick-multi-acme')


def validate_domain(value):
    if not isinstance(value, str):
        raise ValueError('A domain name must be text.')
    value = value.strip().lower().rstrip('.')
    try:
        ipaddress.ip_address(value)
    except ValueError:
        pass
    else:
        raise ValueError('Enter a public DNS hostname, not an IP address.')
    labels = value.split('.')
    if len(value) > 253 or len(labels) < 2 or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in labels):
        raise ValueError('Enter a hostname only, such as browser.example.com (no https:// or path).')
    return value


def validate_settings(value):
    if not isinstance(value, dict):
        raise ValueError('Invalid HTTPS configuration.')
    domain = validate_domain(value['domain'])
    email = value['email']
    if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise ValueError('Enter a valid certificate contact email address.')
    if value.get('agree_tos') is not True:
        raise ValueError("Let's Encrypt terms must be explicitly accepted.")
    return dict(domain=domain, email=email, agree_tos=True)


def settings():
    return validate_settings(json.loads(CONFIG.read_text())) if CONFIG.exists() else None


def prepare():
    if settings() is not None or not sys.stdin.isatty():
        return
    print('Optional HTTPS: point a public DNS hostname at this server and allow inbound TCP 80 and 443.')
    domain = input('HTTPS domain [Enter to keep HTTP for local testing]: ').strip()
    if not domain:
        return
    domain = validate_domain(domain)
    email = input('Certificate contact email: ').strip()
    print("Let's Encrypt Subscriber Agreement: https://letsencrypt.org/repository/")
    if input('Accept the agreement and request a certificate for this domain? [y/N] ').strip().lower() != 'y':
        print('HTTPS not requested; HTTP remains enabled.')
        return
    value = validate_settings(dict(domain=domain, email=email, agree_tos=True))
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(value, indent=2) + '\n')
    CONFIG.chmod(0o600)


def gateway_conf(value=None, certificates=None, webroot=None):
    value = settings() if value is None else validate_settings(value)
    certificates = CERTIFICATES if certificates is None else Path(certificates)
    webroot = WEBROOT if webroot is None else Path(webroot)
    domain = value['domain'] if value else 'codynick.local'
    fullchain, key = certificates / domain / 'fullchain.pem', certificates / domain / 'privkey.pem'
    tls = bool(value and fullchain.is_file() and key.is_file())
    proxy = '''ProxyPreserveHost On
ProxyTimeout 90
ProxyPass / http://127.0.0.1:9000/
ProxyPassReverse / http://127.0.0.1:9000/
ErrorLog ${APACHE_LOG_DIR}/codynick-multi-gateway.log
'''
    challenge = f'''ProxyPass /.well-known/acme-challenge/ !
Alias /.well-known/acme-challenge/ {webroot}/.well-known/acme-challenge/
<Directory {webroot}>
    Options None
    AllowOverride None
    Require all granted
</Directory>
'''
    http = f'<VirtualHost *:80>\nServerName {domain}\nRequestHeader unset X-Forwarded-Proto\n'
    if value:
        http += challenge
    if tls:
        http += f'''RewriteEngine On
RewriteCond %{{REQUEST_URI}} !^/\\.well-known/acme-challenge/
RewriteRule ^ https://{domain}%{{REQUEST_URI}} [R=301,L,NE]
'''
    http += proxy + '</VirtualHost>\n'
    if tls:
        http += f'''<VirtualHost *:443>
ServerName {domain}
SSLEngine on
SSLProtocol -all +TLSv1.2 +TLSv1.3
SSLCertificateFile {fullchain}
SSLCertificateKeyFile {key}
RequestHeader unset X-Forwarded-Proto
RequestHeader set X-Forwarded-Proto "https"
{proxy}</VirtualHost>
'''
    return http


def enable(run, write, configure_gateway):
    value = settings()
    if value is None:
        return None
    domain = value['domain']
    (WEBROOT / '.well-known/acme-challenge').mkdir(parents=True, exist_ok=True)
    try:
        run('certbot', 'certonly', '--webroot', '--webroot-path', WEBROOT,
            '--cert-name', domain, '--domain', domain, '--email', value['email'],
            '--agree-tos', '--non-interactive', '--keep-until-expiring')
    except Exception as error:
        raise RuntimeError('HTTPS certificate request failed. Check public DNS (including AAAA), server time, and inbound port 80. Correct them and rerun the SAME setup command. See /var/log/letsencrypt/letsencrypt.log.') from error
    if not (CERTIFICATES / domain / 'fullchain.pem').is_file() or not (CERTIFICATES / domain / 'privkey.pem').is_file():
        raise RuntimeError('Certbot did not produce the expected certificate files.')
    write('/etc/letsencrypt/renewal-hooks/deploy/codynick-apache-reload',
          '#!/bin/sh\n/usr/sbin/apache2ctl configtest && /usr/bin/systemctl reload apache2\n', 0o755)
    configure_gateway()
    run('apache2ctl', 'configtest')
    run('systemctl', 'reload', 'apache2')
    run('curl', '--fail', '--silent', '--show-error', '--max-time', '20',
        '--noproxy', domain, '--resolve', domain + ':443:127.0.0.1',
        '--output', '/dev/null', 'https://' + domain + '/login')
    run('systemctl', 'enable', '--now', 'certbot.timer')
    return 'https://' + domain + '/'
