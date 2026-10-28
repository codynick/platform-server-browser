"""CodyNick CAS account API. Run behind Apache on loopback only."""
import hashlib, json, os, secrets, sqlite3, time
from contextlib import contextmanager
from urllib.parse import urlencode, urlsplit
import requests
from defusedxml import ElementTree as ET
from flask import Flask, request, jsonify, redirect, render_template_string, abort, g

app = Flask(__name__)
app.logger.setLevel('INFO')
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
ORIGIN = os.environ.get('PUBLIC_ORIGIN', 'https://code.codynick.com').rstrip('/')
CAS = os.environ.get('CAS_BASE_URL', 'https://id.codynick.com/cas').rstrip('/')
CAS_LOGOUT = os.environ.get('CAS_LOGOUT_URL', CAS + '/logout')
VALIDATE = os.environ.get('CAS_VALIDATE_URL', CAS + '/p3/serviceValidate')
ID_ATTR = os.environ.get('CAS_ID_ATTRIBUTE', '__principal__')
NAME_ATTR = os.environ.get('CAS_NAME_ATTRIBUTE', 'name')
EMAIL_ATTR = os.environ.get('CAS_EMAIL_ATTRIBUTE', 'email')
DB = os.environ.get('DATABASE', '/var/lib/codynick-cas/projects.sqlite3')
COOKIE = '__Host-codynick_session'
TTL = 8 * 3600
SERVICE_URL = ORIGIN + '/auth/callback'
CONFIRM_COOKIE = '__Host-codynick_confirm'
NS = {'cas': 'http://www.yale.edu/tp/cas'}
for url in (ORIGIN, CAS, VALIDATE, CAS_LOGOUT):
    if urlsplit(url).scheme != 'https' or not urlsplit(url).netloc:
        raise RuntimeError('Public and CAS URLs must use HTTPS')

def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()

@contextmanager
def database():
    con = sqlite3.connect(DB, timeout=15)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()

def init_db():
    with database() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT, email TEXT);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,csrf TEXT,expires INTEGER);
        CREATE TABLE IF NOT EXISTS logins(state TEXT PRIMARY KEY,browser TEXT,expires INTEGER);
        CREATE TABLE IF NOT EXISTS login_confirmations(token TEXT PRIMARY KEY,user_id TEXT,csrf TEXT,expires INTEGER);
        CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,owner TEXT,title TEXT,body TEXT,revision INTEGER,created INTEGER,updated INTEGER);
        CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner);
        ''')

@app.before_request
def request_clock():
    g.started=time.monotonic()

@app.after_request
def headers(response):
    elapsed=(time.monotonic()-g.started)*1000
    response.headers['Server-Timing']='app;dur=%.1f'%elapsed
    if request.path.startswith('/auth/') or elapsed>1000:
        app.logger.info('request path=%s status=%s elapsed_ms=%.1f',request.path,response.status_code,elapsed)

    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # Preserve Origin on the confirmation form POST; ticket URLs stay private.
    response.headers['Referrer-Policy'] = 'same-origin' if request.path == '/auth/confirm' else 'no-referrer'
    return response

@app.errorhandler(Exception)
def error(exc):
    from werkzeug.exceptions import HTTPException
    code = exc.code if isinstance(exc, HTTPException) else 500
    # Never log tickets, request URLs, CAS bodies, or private project data.
    if request.path in ('/auth/confirm','/auth/complete'):
        return make_confirmation_page(error_message='Your sign-in could not be completed. The confirmation may have expired. Restart sign-in and continue with your verified account.', status=code)
    return jsonify(error={400:'Invalid request',401:'Sign in required',403:'Request rejected',404:'Project not found',409:'Project changed in another tab. Reload before saving.',413:'Project exceeds 2 MB',502:'CAS validation failed. Check server configuration or retry.'}.get(code, 'Server error')), code

def identity():
    token = request.cookies.get(COOKIE, '')
    with database() as db:
        row = db.execute('SELECT sessions.*,users.name,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?', (digest(token), time.time())).fetchone()
    return dict(row) if row else None

def authenticated(write=False):
    user = identity()
    if not user: abort(401)
    if write and (request.headers.get('Origin') != ORIGIN or not secrets.compare_digest(request.headers.get('X-CSRF-Token',''), user['csrf'])):
        abort(403)
    return user

@app.get('/api/me')
def me():
    user = identity()
    return jsonify(user={k:user[k] for k in ('user_id','name','email')} if user else None, csrf=user['csrf'] if user else None)

@app.get('/auth/login')
def login():
    state, browser = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with database() as db:
        db.execute('DELETE FROM logins WHERE expires<? OR browser=?', (time.time(),digest(request.cookies.get('__Host-codynick_login',''))))
        db.execute('DELETE FROM login_confirmations WHERE expires<? OR token=?', (time.time(),digest(request.cookies.get(CONFIRM_COOKIE,''))))
        db.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
        db.execute('INSERT INTO logins VALUES(?,?,?)', (digest(state),digest(browser),int(time.time())+300))
    service = SERVICE_URL
    response = redirect(CAS + '/login?' + urlencode({'service':service,'renew':'true'}))
    response.delete_cookie(CONFIRM_COOKIE,secure=True,httponly=True,samesite='Lax',path='/')
    response.set_cookie('__Host-codynick_login', browser, secure=True, httponly=True, samesite='Lax', max_age=300, path='/')
    return response

@app.get('/auth/callback')
def callback():
    tickets = request.args.getlist('ticket')
    ticket = tickets[0] if len(tickets)==1 else ''
    if set(request.args)-{'ticket'}: abort(400)
    browser = request.cookies.get('__Host-codynick_login','')
    if not browser or not ticket or len(ticket)>2048: abort(400)
    with database() as db:
        # DELETE RETURNING consumes login attempts atomically (SQLite >=3.35).
        pending = db.execute('DELETE FROM logins WHERE browser=? AND expires>? RETURNING state',(digest(browser),time.time())).fetchone()
    if not pending: abort(403)
    service = SERVICE_URL
    try:
        r = requests.get(VALIDATE, params={'service':service,'ticket':ticket,'renew':'true'},timeout=(5,10),allow_redirects=False,stream=True)
        try:
            r.raise_for_status()
            if r.status_code != 200: raise ValueError('Unexpected CAS status')
            body = bytearray()
            for chunk in r.iter_content(8192):
                body.extend(chunk)
                if len(body)>262144: raise ValueError('CAS response too large')
        finally:
            r.close()
        success = ET.fromstring(body).find('cas:authenticationSuccess',NS)
        if success is None: raise ValueError('CAS rejected ticket')
        principal = success.findtext('cas:user',default='',namespaces=NS).strip()
        attrs = success.find('cas:attributes',NS)
        def attr(name):
            values = [node.text or '' for node in (attrs if attrs is not None else []) if node.tag.split('}')[-1]==name]
            return values[0].strip() if len(values)==1 else ''
        uid = principal if ID_ATTR=='__principal__' else attr(ID_ATTR)
        if not uid or len(uid)>255: raise ValueError('Missing stable ID')
        name, email = attr(NAME_ATTR)[:255] or principal, attr(EMAIL_ATTR)[:320]
    except Exception:
        abort(502)
    # With an exact CAS service URL, the callback cannot carry a unique state.
    # A pending browser cookie gates validation; explicit identity confirmation
    # prevents a substituted ticket from silently signing into another account.
    candidate, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    with database() as db:
        db.execute('INSERT INTO users VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email',(uid,name,email))
        db.execute('DELETE FROM login_confirmations WHERE token=?',(digest(request.cookies.get(CONFIRM_COOKIE,'')),))
        db.execute('INSERT INTO login_confirmations VALUES(?,?,?,?)',(digest(candidate),uid,csrf,int(time.time())+120))
    response = redirect('/auth/confirm',code=303)
    response.delete_cookie('__Host-codynick_login',secure=True,httponly=True,samesite='Lax',path='/')
    response.set_cookie(CONFIRM_COOKIE,candidate,secure=True,httponly=True,samesite='Lax',max_age=120,path='/')
    return response

def confirmation():
    with database() as db:
        row=db.execute('SELECT login_confirmations.*,users.name,users.email FROM login_confirmations JOIN users ON users.id=login_confirmations.user_id WHERE token=? AND expires>?',(digest(request.cookies.get(CONFIRM_COOKIE,'')),time.time())).fetchone()
    if not row: abort(403)
    return dict(row)

@app.get('/auth/confirm')
def confirm():
    candidate=confirmation()
    response=make_confirmation_page(candidate)
    return response

def make_confirmation_page(candidate=None, error_message=None, status=200):
    nonce=secrets.token_urlsafe(24)
    response=app.make_response((render_template_string(CONFIRM_TEMPLATE,
        **(candidate or {}), error_message=error_message, nonce=nonce),status))
    response.headers['Content-Security-Policy']=("default-src 'none'; style-src 'nonce-"+nonce+"'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
    return response

CONFIRM_TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continue to CodyNick</title>
<style nonce="{{ nonce }}">
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f3f6fb;color:#17233b;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}header{background:white;border-bottom:1px solid #e1e7f0;padding:20px 6vw}.brand{font-size:24px;font-weight:800;letter-spacing:-1px}.brand span{color:#2364df}.tag{color:#66758d;font-size:13px;margin-top:2px}main{max-width:510px;margin:64px auto;padding:0 20px}.card{background:white;border:1px solid #e1e7f0;border-radius:20px;padding:32px;box-shadow:0 16px 48px #20345a0d}.badge{display:inline-block;color:#206748;background:#e9f7ef;border-radius:30px;font-size:12px;font-weight:700;padding:6px 12px}h1{font-size:28px;line-height:1.2;letter-spacing:-.7px;margin:20px 0 12px}p{color:#63718a;margin:0 0 24px}dl{margin:0 0 26px;border:1px solid #e4eaf2;border-radius:12px;padding:4px 18px}dl div{padding:12px 0;border-bottom:1px solid #e9edf4}dl div:last-child{border:0}dt{font-size:12px;color:#66758d}dd{margin:3px 0 0;font-weight:600;overflow-wrap:anywhere}button,.primary{display:block;width:100%;padding:13px 18px;border:0;border-radius:10px;background:#2364df;color:white;font:600 15px system-ui;cursor:pointer;text-align:center;text-decoration:none}button:hover,.primary:hover{background:#184fc0}a:focus-visible,button:focus-visible{outline:3px solid #90b9ff;outline-offset:3px}.cancel{display:block;text-align:center;margin-top:18px;color:#50617c;font-size:14px}.foot{text-align:center;font-size:12px;color:#79869b;margin-top:22px}@media(max-width:540px){main{margin:32px auto}.card{padding:24px}h1{font-size:25px}}
</style></head><body><header><div class="brand">Cody<span>Nick</span></div><div class="tag">Create. Connect. Explore.</div></header><main><section class="card">
{% if error_message %}<span class="badge">Sign-in needs attention</span><h1>Let's try that again</h1><p>{{ error_message }}</p><a class="primary" href="/auth/login">Restart sign-in</a><a class="cancel" href="/blocks/">Return to editor</a>
{% else %}<span class="badge">Account verified</span><h1>Continue to CodyNick</h1><p>Check that this is your account before opening your private projects.</p>
<dl><div><dt>Name</dt><dd>{{ name }}</dd></div><div><dt>CodyNick ID</dt><dd>{{ user_id }}</dd></div><div><dt>Email</dt><dd>{{ email or 'Not provided' }}</dd></div></dl>
<form method="post" action="/auth/complete"><input type="hidden" name="csrf" value="{{ csrf }}"><button type="submit">Continue as {{ name }}</button></form><a class="cancel" href="/blocks/">Cancel and return to editor</a>{% endif %}</section><p class="foot">CodyNick account sign-in</p></main></body></html>"""

@app.post('/auth/complete')
def complete():
    candidate=confirmation()
    if request.headers.get('Origin')!=ORIGIN or not secrets.compare_digest(request.form.get('csrf',''),candidate['csrf']): abort(403)
    token,csrf=secrets.token_urlsafe(48),secrets.token_urlsafe(32)
    with database() as db:
        used=db.execute('DELETE FROM login_confirmations WHERE token=? AND expires>? RETURNING user_id',(digest(request.cookies.get(CONFIRM_COOKIE,'')),time.time())).fetchone()
        if not used: abort(403)
        db.execute('DELETE FROM sessions WHERE token=?',(digest(request.cookies.get(COOKIE,'')),))
        db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(digest(token),used['user_id'],csrf,int(time.time())+TTL))
    response=redirect('/blocks/',code=303)
    response.delete_cookie(CONFIRM_COOKIE,secure=True,httponly=True,samesite='Lax',path='/')
    response.set_cookie(COOKIE,token,secure=True,httponly=True,samesite='Lax',max_age=TTL,path='/')
    return response

@app.post('/auth/logout')
def logout():
    authenticated(True)
    with database() as db:
        db.execute('DELETE FROM sessions WHERE token=?',(digest(request.cookies.get(COOKIE,'')),))
        db.execute('DELETE FROM login_confirmations WHERE token=?',(digest(request.cookies.get(CONFIRM_COOKIE,'')),))
        db.execute('DELETE FROM logins WHERE browser=?',(digest(request.cookies.get('__Host-codynick_login','')),))
    response = jsonify(ok=True, logout_url=CAS_LOGOUT)
    response.delete_cookie(COOKIE,secure=True,httponly=True,samesite='Lax',path='/')
    response.delete_cookie(CONFIRM_COOKIE,secure=True,httponly=True,samesite='Lax',path='/')
    response.delete_cookie('__Host-codynick_login',secure=True,httponly=True,samesite='Lax',path='/')
    return response

@app.get('/api/projects')
def projects():
    user=authenticated()
    with database() as db:
        rows=db.execute('SELECT id,title,revision,updated FROM projects WHERE owner=? ORDER BY updated DESC',(user['user_id'],)).fetchall()
    return jsonify(projects=[dict(row) for row in rows])

@app.get('/api/projects/<project_id>')
def project(project_id):
    user=authenticated()
    with database() as db: row=db.execute('SELECT * FROM projects WHERE id=? AND owner=?',(project_id,user['user_id'])).fetchone()
    if not row: abort(404)
    return jsonify(id=row['id'],title=row['title'],revision=row['revision'],project=json.loads(row['body']))

def payload():
    data=request.get_json()
    if not isinstance(data,dict): abort(400)
    title=data.get('title','')
    project=data.get('project')
    if not isinstance(title,str) or not 1<=len(title.strip())<=120: abort(400)
    if not isinstance(project,dict) or project.get('format')!='codynick-webserial' or not isinstance(project.get('workspace'),dict): abort(400)
    blocks=project['workspace'].get('blocks')
    if not isinstance(blocks,dict) or not isinstance(blocks.get('blocks'),list): abort(400)
    return data,title.strip(),json.dumps(project,allow_nan=False)

@app.post('/api/projects')
def create():
    user=authenticated(True)
    data,title,body=payload()
    pid=secrets.token_urlsafe(24); now=int(time.time())
    with database() as db:
        # Transaction serializes the account quota check and insert.
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT count(*) FROM projects WHERE owner=?',(user['user_id'],)).fetchone()[0]>=200: abort(400)
        db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?)',(pid,user['user_id'],title,body,1,now,now))
    return jsonify(id=pid,title=title,revision=1),201

@app.put('/api/projects/<pid>')
def update(pid):
    user=authenticated(True)
    data,title,body=payload()
    revision=data.get('revision')
    if type(revision) is not int: abort(400)
    with database() as db:
        row=db.execute('UPDATE projects SET title=?,body=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=? RETURNING revision',(title,body,int(time.time()),pid,user['user_id'],revision)).fetchone()
        if not row:
            if not db.execute('SELECT id FROM projects WHERE id=? AND owner=?',(pid,user['user_id'])).fetchone(): abort(404)
            abort(409)
    return jsonify(id=pid,title=title,revision=row['revision'])

@app.delete('/api/projects/<pid>')
def delete(pid):
    user=authenticated(True)
    with database() as db:
        result=db.execute('DELETE FROM projects WHERE id=? AND owner=?',(pid,user['user_id']))
        if not result.rowcount: abort(404)
    return jsonify(ok=True)

init_db()
