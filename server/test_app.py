import io
import os
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from server.app import App, connect


class APITest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.getenv('TEST_TMP_DIR'))
        self.clock = [1000000]
        self.app = App(path=self.temp.name+'/reports.sqlite', places=self.temp.name+'/places.sqlite', now=lambda:self.clock[0])

    def tearDown(self):
        self.temp.cleanup()

    def request(self, method, path, body=None, token=None, ip='127.0.0.1', query=''):
        raw = json.dumps(body or {}).encode()
        env = {'REQUEST_METHOD':method,'PATH_INFO':path,'QUERY_STRING':query,'CONTENT_LENGTH':str(len(raw)), 'wsgi.input':io.BytesIO(raw),'REMOTE_ADDR':ip}
        if token:
            env['HTTP_AUTHORIZATION']='Bearer '+token
        response = []
        data = b''.join(self.app(env,lambda status,headers:response.append(status)))
        return int(response[0][:3]),json.loads(data)

    def token(self):
        code,data = self.request('POST','/session')
        self.assertEqual(code,200)
        return data['token']

    def report(self, token):
        code,data = self.request('POST','/reports',{'category':'Banjir','coordinate':[103.7,1.5]},token)
        self.assertEqual(code,200)
        return data['id']

    def test_auth_validation_and_expiry(self):
        self.assertEqual(self.request('POST','/reports')[0],401)
        token = self.token()
        self.assertEqual(self.request('POST','/reports',{'category':'x','coordinate':[103.7,1.5]},token)[0],400)
        self.assertEqual(self.request('POST','/route',{'from':[True,1.5],'to':[103.7,1.5]})[0],400)
        self.report(token)
        self.assertEqual(len(self.request('GET','/reports')[1]['reports']),1)
        self.clock[0] += 3601
        self.assertEqual(self.request('GET','/reports')[1]['reports'],[])

    def test_votes_require_distinct_nearby_sessions(self):
        owner,first,second = self.token(),self.token(),self.token()
        rid = self.report(owner)
        path = '/reports/'+rid+'/vote'
        self.assertEqual(self.request('POST',path,{'present':True,'coordinate':[103.7,1.5]},owner)[0],400)
        self.assertEqual(self.request('POST',path,{'present':False,'coordinate':[103.9,1.5]},first)[0],400)
        for _ in range(2):
            self.assertEqual(self.request('POST',path,{'present':False,'coordinate':[103.7,1.5]},first)[0],200)
        self.assertEqual(len(self.request('GET','/reports')[1]['reports']),1)
        self.request('POST',path,{'present':False,'coordinate':[103.7,1.5]},second)
        self.assertEqual(self.request('GET','/reports')[1]['reports'],[])

    def test_duplicate_reports_merge_and_owner_can_remove(self):
        token = self.token()
        rid = self.report(token)
        self.assertEqual(self.report(token),rid)
        self.request('POST','/reports/'+rid+'/vote',{'present':False,'coordinate':[103.7,1.5]},token)
        self.assertEqual(self.request('GET','/reports')[1]['reports'],[])

    def test_full_text_search_handles_punctuation_without_sql_injection(self):
        with connect(self.app.places) as db:
            db.executescript('''CREATE TABLE places(id INTEGER PRIMARY KEY,name,lon,lat,address,kind);
            CREATE VIRTUAL TABLE places_fts USING fts5(search);
            INSERT INTO places VALUES(1,'Hospital Sultanah Aminah',103.7,1.5,'Johor Bahru','hospital');
            INSERT INTO places_fts VALUES('Hospital Sultanah Aminah Johor Bahru');''')
        code,data = self.request('GET','/search',query='q=hospital+johor')
        self.assertEqual(code,200)
        self.assertEqual(data['places'][0]['name'],'Hospital Sultanah Aminah')
        self.assertEqual(self.request('GET','/search',query='q=%22%3B')[0],400)

    def test_upstream_route_options_and_invalid_costing(self):
        calls = []
        self.app.call_routing = lambda method,payload: calls.append((method,payload)) or {'trip':{'status':0}}
        code,_ = self.request('POST','/route',{'from':[103.7,1.5],'to':[103.8,1.6],'mode':'motorcycle','avoidTolls':True})
        self.assertEqual(code,200)
        self.assertEqual(calls[0][1]['costing_options']['motorcycle']['use_tolls'],0)
        self.assertEqual(self.request('POST','/route',{'from':[103.7,1.5],'to':[103.8,1.6],'mode':'truck'})[0],400)

    def test_unknown_or_poor_speed_match_is_not_invented(self):
        self.app.call_routing = lambda *args: {'edges':[{'speed_limit':90}],'matched_points':[{'type':'matched','edge_index':0,'distance_from_trace_point':50}]}
        self.assertIsNone(self.request('POST','/speed-limit',{'points':[[103.7,1.5],[103.701,1.5]]})[1]['limit'])

    def test_quota_survives_new_app_instance(self):
        for _ in range(20): self.token()
        self.app = App(path=self.app.path,places=self.app.places,now=lambda:self.clock[0])
        self.assertEqual(self.request('POST','/session')[0],429)


if __name__ == '__main__':
    unittest.main()
