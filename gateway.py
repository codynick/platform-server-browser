"""Shared login and same-origin router; workspace services remain unchanged."""
from contextlib import closing
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import hashlib
import html
import http.client
import json
from pathlib import Path
import re
import secrets
import subprocess
import socket
import threading
import time
from urllib.parse import parse_qs, urlsplit, urlencode, unquote
from views import login_page, panel_page, welcome_page, users_page, password_page
from install import VERSION

COOKIE = 'codynick_multi_session'
SESSION_SECONDS = 12 * 60 * 60
HOP_HEADERS = {'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
               'te', 'trailer', 'transfer-encoding', 'upgrade'}
ROOT = Path(__file__).resolve().parent


def safe_destination(value):
    decoded = unquote(value)
    if not value.startswith('/') or decoded.startswith('//') or '\\' in decoded or any(ord(c) < 32 or ord(c) == 127 for c in decoded):
        return '/'
    if urlsplit(value).path in ('/login', '/logout'):
        return '/'
    return value


def verify_password(password, encoded):
    # Existing accounts use OpenSSL SHA512-crypt; no password conversion needed.
    if not isinstance(password, str) or len(password) > 1024 or any(c in password for c in '\r\n\0'):
        return False
    parts = encoded.split('$')
    if len(parts) != 4 or parts[1] != '6' or not re.fullmatch('[./A-Za-z0-9]{1,16}', parts[2]):
        return False
    result = subprocess.run(['openssl', 'passwd', '-6', '-salt', parts[2], '-stdin'],
                            input=password + '\n', text=True, capture_output=True, timeout=5)
    return result.returncode == 0 and hmac.compare_digest(result.stdout.strip(), encoded)


class Sessions:
    def __init__(self, accounts_file):
        self.accounts_file = Path(accounts_file)
        self.sessions = {}
        self.lock = threading.Lock()

    def accounts(self):
        return json.loads(self.accounts_file.read_text())

    def login(self, name, password):
        accounts = self.accounts()
        account = accounts.get(name)
        if account is None or not verify_password(password, account['hash']):
            return None
        token = secrets.token_urlsafe(32)
        now = time.monotonic()
        with self.lock:
            self.sessions = {key: value for key, value in self.sessions.items() if now - value[1] < SESSION_SECONDS}
            if len(self.sessions) >= 4096:
                self.sessions.pop(next(iter(self.sessions)))
            self.sessions[token] = (name, now, account['hash'])
        return token

    def account(self, token):
        with self.lock:
            session = self.sessions.get(token)
            if session is None:
                return None
            name, seen, original_hash = session
            account = self.accounts().get(name)
            if time.monotonic() - seen >= SESSION_SECONDS or account is None or account['hash'] != original_hash:
                self.sessions.pop(token, None)
                return None
            self.sessions[token] = (name, time.monotonic(), original_hash)
            return name, account

    def logout(self, token):
        with self.lock:
            self.sessions.pop(token, None)


def csrf_token(token):
    return hashlib.sha256(('admin-users:' + token).encode()).hexdigest()


def account_request(actor, name, password, action='add-student', current_password=''):
    request = dict(action=action, actor=actor, username=name, password=password, current_password=current_password)
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(60)
        client.connect('/run/codynick-multi-admin.sock')
        client.sendall((json.dumps(request) + '\n').encode())
        with client.makefile('rb') as response:
            return json.loads(response.readline(8192))


def handler(sessions):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *_):
            pass  # Never log credentials or session tokens.

        def send(self, status, body=b'', content_type='text/html; charset=utf-8', headers=()):
            if isinstance(body, str):
                body = body.encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            for key, value in headers:
                self.send_header(key, value)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def token(self):
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get('Cookie', ''))
                return cookie[COOKIE].value if COOKIE in cookie else ''
            except Exception:
                return ''

        def cookie_flags(self):
            # Only Apache's TLS virtual host sets this header; HTTP removes it.
            return '; Secure' if self.headers.get('X-Forwarded-Proto') == 'https' else ''

        def body(self, limit):
            if self.headers.get('Transfer-Encoding'):
                raise ValueError('Chunked requests are not supported')
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 <= length <= limit:
                raise ValueError('Request too large')
            self.connection.settimeout(30)
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError('Incomplete request')
            return data

        def process(self):
            try:
                path = urlsplit(self.path).path
                body = self.body(8192 if path in ('/login', '/logout', '/admin/users', '/admin/password', '/account/password') else 52 * 1024 * 1024)
                if self.command == 'POST':
                    origin = self.headers.get('Origin')
                    if self.headers.get('Sec-Fetch-Site') == 'cross-site' or (
                        origin and urlsplit(origin).netloc != self.headers.get('Host')):
                        return self.send(403, 'Local requests only')
                if path in ('/favicon.ico', '/assets/multi.css', '/assets/portal.css', '/assets/logo.png'):
                    assets = {'/favicon.ico': ('upstream/components/ide/assets/favicon.ico', 'image/x-icon'),
                              '/assets/logo.png': ('upstream/components/ide/assets/logo.png', 'image/png'),
                              '/assets/multi.css': ('multi.css', 'text/css'),
                              '/assets/portal.css': ('portal.css', 'text/css')}
                    asset, kind = assets[path]
                    return self.send(200, (ROOT / asset).read_bytes(), kind)
                if path == '/login':
                    if self.command in ('GET', 'HEAD'):
                        query = parse_qs(urlsplit(self.path).query)
                        destination = safe_destination(query.get('next', ['/'])[0])
                        return self.send(200, login_page(changed=query.get('changed') == ['1'], next_path=destination))
                    form = parse_qs(body.decode('utf-8'))
                    destination = safe_destination(form.get('next', ['/'])[0])
                    token = sessions.login(form.get('username', [''])[0].strip(), form.get('password', [''])[0])
                    if token is None:
                        return self.send(401, login_page('Incorrect username or password.', next_path=destination))
                    return self.send(303, headers=[('Location', destination), ('Set-Cookie', f'{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict' + self.cookie_flags())])
                if path == '/logout':
                    if self.command != 'POST':
                        return self.send(405, 'POST required')
                    sessions.logout(self.token())
                    return self.send(303, headers=[('Location', '/login'), ('Set-Cookie', f'{COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict' + self.cookie_flags())])
                account = sessions.account(self.token())
                if account is None:
                    if path == '/' and self.command in ('GET', 'HEAD'):
                        return self.send(200, welcome_page(VERSION))
                    return self.send(303, headers=[('Location', '/login?' + urlencode({'next': safe_destination(self.path)}))])
                name, settings = account
                if path in ('/admin/password', '/account/password'):
                    reset = path == '/admin/password'
                    if reset and settings.get('role') != 'admin':
                        return self.send(403, 'Administrator account required.')
                    target = parse_qs(urlsplit(self.path).query).get('user', [''])[0] if reset else name
                    if target not in sessions.accounts():
                        return self.send(404, 'Unknown account.')
                    csrf = csrf_token(self.token())
                    if self.command == 'POST':
                        form = parse_qs(body.decode('utf-8'))
                        if not hmac.compare_digest(form.get('csrf', [''])[0], csrf):
                            return self.send(403, 'Please reload the password page and try again.')
                        password = form.get('password', [''])[0]
                        if password != form.get('confirm', [''])[0]:
                            return self.send(400, password_page(name, target, csrf, reset, 'Passwords do not match.'))
                        result = account_request(name, target, password,
                            action='reset-password' if reset else 'change-password',
                            current_password=form.get('current_password', [''])[0])
                        if not result.get('ok'):
                            return self.send(400, password_page(name, target, csrf, reset, result.get('error', 'Password change failed.')))
                        if target == name:
                            sessions.logout(self.token())
                            return self.send(303, headers=[('Location', '/login?changed=1'), ('Set-Cookie', f'{COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict' + self.cookie_flags())])
                        return self.send(303, headers=[('Location', '/admin/users?updated=' + target)])
                    return self.send(200, password_page(name, target, csrf, reset))
                if path == '/admin/users':
                    if settings.get('role') != 'admin':
                        return self.send(403, 'Administrator account required.')
                    csrf = csrf_token(self.token())
                    if self.command == 'POST':
                        form = parse_qs(body.decode('utf-8'))
                        if not hmac.compare_digest(form.get('csrf', [''])[0], csrf):
                            return self.send(403, 'Please reload the Users page and try again.')
                        password = form.get('password', [''])[0]
                        username = form.get('username', [''])[0].strip()
                        if password != form.get('confirm', [''])[0]:
                            return self.send(400, users_page(name, sessions.accounts(), csrf, error='Passwords do not match.'))
                        result = account_request(name, username, password)
                        if not result.get('ok'):
                            return self.send(400, users_page(name, sessions.accounts(), csrf, error=result.get('error', 'Account setup failed.')))
                        return self.send(303, headers=[('Location', '/admin/users?created=' + username)])
                    created = parse_qs(urlsplit(self.path).query).get('created', [''])[0]
                    updated = parse_qs(urlsplit(self.path).query).get('updated', [''])[0]
                    return self.send(200, users_page(name, sessions.accounts(), csrf, created=created, updated=updated))
                if path == '/':
                    return self.send(200, panel_page(name, settings.get('role', 'student'), VERSION))
                self.proxy(8100 + settings['slot'], body)
            except (ValueError, UnicodeError):
                self.close_connection = True
                self.send(400, 'Invalid request')
            except (OSError, subprocess.SubprocessError, http.client.HTTPException):
                self.send(503, 'Workspace unavailable. Please retry shortly.')

        def proxy(self, port, body):
            connection_headers = {x.strip().lower() for x in self.headers.get('Connection', '').split(',')}
            denied = HOP_HEADERS | connection_headers | {'authorization', 'content-length'}
            headers = {key: value for key, value in self.headers.items() if key.lower() not in denied}
            headers['Content-Length'] = str(len(body))
            # Keep the external Host (including VirtualBox's 8080), but never
            # accept a user-supplied upstream address or account identifier.
            with closing(http.client.HTTPConnection('127.0.0.1', port, timeout=30)) as connection:
                connection.request(self.command, self.path, body=body, headers=headers)
                response = connection.getresponse()
                data = response.read()
                denied_response = HOP_HEADERS | {'content-length', 'cache-control'}
                denied_response |= {x.strip().lower() for x in response.getheader('Connection', '').split(',')}
                self.send_response(response.status)
                for key, value in response.getheaders():
                    if key.lower() not in denied_response:
                        self.send_header(key, value)
                self.send_header('Content-Length', response.getheader('Content-Length', '0') if self.command == 'HEAD' else str(len(data)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                if self.command != 'HEAD':
                    self.wfile.write(data)

        do_GET = process
        do_POST = process
        do_HEAD = process

    return Handler


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 9000), handler(Sessions('/var/lib/codynick-multi/gateway-accounts.json')))
    server.serve_forever()
