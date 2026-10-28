import os,tempfile,unittest,time,re
from urllib.parse import urlsplit,parse_qs,urlencode
from unittest.mock import patch
fd,path=tempfile.mkstemp();os.close(fd)
os.environ['DATABASE']=path
os.environ['PUBLIC_ORIGIN']='https://ide.codynick.com'
import app as m

PROJECT={'format':'codynick-webserial','version':2,'workspace':{'blocks':{'languageVersion':0,'blocks':[]}}}
XML=b'''<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas"><cas:authenticationSuccess><cas:user>id-123</cas:user><cas:attributes><cas:name>Test User</cas:name><cas:email>test@example.test</cas:email></cas:attributes></cas:authenticationSuccess></cas:serviceResponse>'''
class Reply:
 status_code=200
 def raise_for_status(self):pass
 def iter_content(self,n):yield XML
 def close(self):pass
class Tests(unittest.TestCase):
 def setUp(self):
  with m.database() as db:
   for table in ['login_confirmations','users','sessions','projects','logins']:db.execute('DELETE FROM '+table)
  self.client=m.app.test_client()
 def user(self,client,uid):
  token='token-'+uid;csrf='csrf-'+uid
  with m.database() as db:
   db.execute('INSERT OR IGNORE INTO users VALUES(?,?,?)',(uid,uid,uid+'@test'))
   db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(m.digest(token),uid,csrf,int(time.time())+1000))
  client.set_cookie(m.COOKIE,token,domain='ide.codynick.com',secure=True)
  return {'Origin':m.ORIGIN,'X-CSRF-Token':csrf}
 def call(self,method,path,**kwargs):return getattr(self.client,method)(path,base_url=m.ORIGIN,**kwargs)
 def test_guest_denied(self):
  self.assertIsNone(self.call('get','/api/me').json['user'])
  for method,path in [('get','/api/projects'),('post','/api/projects'),('get','/api/projects/known'),('delete','/api/projects/known')]:self.assertEqual(self.call(method,path).status_code,401)
 def test_owner_and_conflicts(self):
  a=self.user(self.client,'A')
  r=self.call('post','/api/projects',json={'title':'Private','project':PROJECT},headers=a)
  self.assertEqual(r.status_code,201);pid=r.json['id']
  b=m.app.test_client();bh=self.user(b,'B')
  self.assertEqual(b.get('/api/projects',base_url=m.ORIGIN).json['projects'],[])
  for method in ['get','put','delete']:
   opts={'headers':bh}
   if method=='put':opts['json']={'title':'stolen','project':PROJECT,'revision':1}
   self.assertEqual(getattr(b,method)('/api/projects/'+pid,base_url=m.ORIGIN,**opts).status_code,404)
  data={'title':'Private','project':PROJECT,'revision':1}
  self.assertEqual(self.call('put','/api/projects/'+pid,json=data,headers=a).json['revision'],2)
  self.assertEqual(self.call('put','/api/projects/'+pid,json=data,headers=a).status_code,409)
  self.assertEqual(self.call('delete','/api/projects/'+pid,headers=a).status_code,200)
 def test_csrf(self):
  h=self.user(self.client,'A')
  self.assertEqual(self.call('post','/api/projects',json={'title':'x','project':PROJECT}).status_code,403)
  h['Origin']='https://evil.example'
  self.assertEqual(self.call('post','/api/projects',json={'title':'x','project':PROJECT},headers=h).status_code,403)
 def test_expiry_logout(self):
  h=self.user(self.client,'A')
  result=self.call('post','/auth/logout',headers=h)
  self.assertEqual(result.status_code,200)
  self.assertEqual(result.json['logout_url'],m.CAS_LOGOUT)
  self.assertNotIn(m.COOKIE+'=',result.json['logout_url'])
  self.assertEqual(self.call('get','/api/projects').status_code,401)
 def begin(self):
  response=self.call('get','/auth/login')
  self.assertEqual(response.status_code,302)
  service=parse_qs(urlsplit(response.location).query)['service'][0]
  self.assertEqual(service,m.ORIGIN+'/auth/callback')
  self.assertEqual(urlsplit(service).query,'')
  self.assertEqual(parse_qs(urlsplit(response.location).query)['renew'],['true'])
  return service
 def validate(self):
  with patch.object(m.requests,'get',return_value=Reply()) as get:
   result=self.call('get','/auth/callback?ticket=ST-test')
   self.assertEqual(result.status_code,303)
   self.assertEqual(result.location,'/auth/confirm')
   self.assertEqual(get.call_args.kwargs['params']['service'],m.ORIGIN+'/auth/callback')
   self.assertEqual(get.call_args.kwargs['params']['renew'],'true')
  return result
 def form_token(self):
  page=self.call('get','/auth/confirm')
  self.assertEqual(page.status_code,200)
  self.assertIn(b'id-123',page.data)
  self.assertIn(b'Test User',page.data)
  self.assertIn(b'test@example.test',page.data)
  return re.search(r'name="csrf" value="([^"]+)"',page.text).group(1)
 def test_fixed_service_binding_confirmation_and_replay(self):
  self.begin()
  stranger=m.app.test_client()
  with patch.object(m.requests,'get') as get:
   self.assertEqual(stranger.get('/auth/callback?ticket=ST-test',base_url=m.ORIGIN).status_code,400)
   get.assert_not_called()
  result=self.validate()
  self.assertIsNone(self.call('get','/api/me').json['user'],'validation alone must not create a session')
  self.assertEqual(self.call('get','/auth/callback?ticket=ST-test').status_code,400)
  token=self.form_token()
  complete=self.call('post','/auth/complete',data={'csrf':token},headers={'Origin':m.ORIGIN})
  self.assertEqual(complete.status_code,303)
  self.assertEqual(self.call('get','/api/me').json['user']['user_id'],'id-123')
  self.assertEqual(self.call('post','/auth/complete',data={'csrf':token},headers={'Origin':m.ORIGIN}).status_code,403)
  cookies=complete.headers.getlist('Set-Cookie')[-1]
  self.assertIn('HttpOnly',cookies);self.assertIn('Secure',cookies)
 def test_cas_failure(self):
  self.begin()
  with patch.object(m.requests,'get',side_effect=RuntimeError('secret-ticket')):
   result=self.call('get','/auth/callback?ticket=ST-secret')
  self.assertEqual(result.status_code,502);self.assertNotIn(b'ST-secret',result.data)
  self.assertEqual(self.call('get','/auth/callback?ticket=ST-secret').status_code,403)
 def test_missing_id_attribute(self):
  self.begin()
  with patch.object(m,'ID_ATTR','missing'),patch.object(m.requests,'get',return_value=Reply()):
   self.assertEqual(self.call('get','/auth/callback?ticket=ST-test').status_code,502)
 def test_pending_login_expiry(self):
  self.begin()
  with m.database() as db:db.execute('UPDATE logins SET expires=0')
  with patch.object(m.requests,'get') as get:
   self.assertEqual(self.call('get','/auth/callback?ticket=ST-test').status_code,403)
   get.assert_not_called()
 def test_confirmation_csrf_origin_and_expiry(self):
  self.begin();self.validate();token=self.form_token()
  self.assertEqual(self.call('post','/auth/complete',data={'csrf':'wrong'},headers={'Origin':m.ORIGIN}).status_code,403)
  self.assertEqual(self.call('post','/auth/complete',data={'csrf':token},headers={'Origin':'https://evil.example'}).status_code,403)
  self.assertEqual(self.call('post','/auth/complete',data={'csrf':token}).status_code,403)
  self.assertIsNone(self.call('get','/api/me').json['user'])
  with m.database() as db:db.execute('UPDATE login_confirmations SET expires=0')
  self.assertEqual(self.call('post','/auth/complete',data={'csrf':token},headers={'Origin':m.ORIGIN}).status_code,403)
 def test_new_login_supersedes_previous(self):
  self.begin()
  first=self.client.get_cookie('__Host-codynick_login',domain='ide.codynick.com').value
  self.begin()
  second=self.client.get_cookie('__Host-codynick_login',domain='ide.codynick.com').value
  self.assertNotEqual(first,second)
  with m.database() as db:self.assertEqual(db.execute('SELECT count(*) FROM logins').fetchone()[0],1)
  self.client.set_cookie('__Host-codynick_login',first,domain='ide.codynick.com',secure=True)
  self.assertEqual(self.call('get','/auth/callback?ticket=ST-test').status_code,403)
 def test_duplicate_ticket_or_old_state_rejected(self):
  self.begin()
  with patch.object(m.requests,'get') as get:
   self.assertEqual(self.call('get','/auth/callback?ticket=A&ticket=B').status_code,400)
   self.assertEqual(self.call('get','/auth/callback?state=old&ticket=A').status_code,400)
   get.assert_not_called()
 def test_confirmation_output_escaped(self):
  self.begin();self.validate()
  with m.database() as db:db.execute('UPDATE users SET name=?',('<script>alert(1)</script>',))
  page=self.call('get','/auth/confirm')
  self.assertNotIn(b'<script>',page.data)
  self.assertIn(b'&lt;script&gt;',page.data)
  self.assertIn("frame-ancestors 'none'",page.headers['Content-Security-Policy'])
 def test_confirmation_policy_and_styling(self):
  self.begin();self.validate()
  page=self.call('get','/auth/confirm')
  self.assertEqual(page.headers['Referrer-Policy'],'same-origin')
  self.assertIn(b'<style nonce="',page.data)
  nonce=re.search(r'<style nonce="([^" ها]+)"',page.text).group(1)
  self.assertIn("style-src 'nonce-"+nonce+"'",page.headers['Content-Security-Policy'])
  self.assertEqual(self.call('get','/api/me').headers['Referrer-Policy'],'no-referrer')
 def test_null_origin_rejected_with_retry_page(self):
  self.begin();self.validate();token=self.form_token()
  result=self.call('post','/auth/complete',data={'csrf':token},headers={'Origin':'null'})
  self.assertEqual(result.status_code,403)
  self.assertIn(b'Restart sign-in',result.data)
  self.assertIsNone(self.call('get','/api/me').json['user'])
 def test_limits_and_cache(self):
  h=self.user(self.client,'A')
  self.assertEqual(self.call('post','/api/projects',json={'title':'','project':PROJECT},headers=h).status_code,400)
  r=self.call('post','/api/projects',json={'title':'x','project':{'workspace':[]}},headers=h)
  self.assertEqual(r.status_code,400)
  self.assertEqual(self.call('get','/api/me').headers['Cache-Control'],'no-store')
  self.assertEqual(self.call('post','/api/projects',data=b'x'*(2*1024*1024+1),content_type='application/json',headers=h).status_code,413)
if __name__=='__main__':
 try:unittest.main(verbosity=2)
 finally:os.unlink(path)
