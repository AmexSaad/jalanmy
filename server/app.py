"""jalanMY API. One instance with a persistent SQLite volume; WSGI compatible."""
import hashlib
import json
import math
import os
import re
import secrets
import sqlite3
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs

CATEGORIES = {'Roadblock', 'Speed trap', 'Kemalangan', 'Banjir', 'Jalan tutup', 'Halangan'}
MODES = {'auto', 'motorcycle', 'bicycle', 'pedestrian'}
TTL = 3600


class APIError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def coordinate(value):
    if not isinstance(value, list) or len(value) != 2:
        raise APIError(400, 'Koordinat tidak sah.')
    lon, lat = value
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in value):
        raise APIError(400, 'Koordinat tidak sah.')
    if not (102.35 <= lon <= 104.6 and 1.15 <= lat <= 2.95):
        raise APIError(400, 'Lokasi di luar kawasan liputan Johor.')
    return lon, lat


def distance(a, b):
    lon, lat = a
    x, y = b
    k = math.pi / 180
    h = math.sin((y-lat)*k/2)**2 + math.cos(lat*k)*math.cos(y*k)*math.sin((x-lon)*k/2)**2
    return 12742000 * math.asin(min(1, math.sqrt(h)))


@contextmanager
def connect(path):
    db = sqlite3.connect(path, timeout=15, uri=path.startswith('file:'))
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
          CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES sessions(token), category TEXT NOT NULL,
            lon REAL NOT NULL, lat REAL NOT NULL, created REAL NOT NULL, expires REAL NOT NULL,
            removed INTEGER NOT NULL DEFAULT 0);
          CREATE INDEX IF NOT EXISTS reports_expiry ON reports(expires, removed);
          CREATE TABLE IF NOT EXISTS votes (
            report TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
            voter TEXT NOT NULL REFERENCES sessions(token), present INTEGER NOT NULL,
            created REAL NOT NULL, PRIMARY KEY(report, voter));
          CREATE TABLE IF NOT EXISTS quotas (
            key TEXT NOT NULL, bucket INTEGER NOT NULL, n INTEGER NOT NULL,
            PRIMARY KEY(key,bucket));
        ''')


class App:
    def __init__(self, path=None, places=None, upstream=None, now=time.time):
        self.path = path or os.getenv('DATABASE_PATH', '/data/reports.sqlite')
        self.places = places or os.getenv('PLACES_PATH', '/data/places.sqlite')
        default_upstream = 'http://'+os.getenv('VALHALLA_HOST','routing')+':8002'
        self.upstream = (upstream or os.getenv('VALHALLA_URL', default_upstream)).rstrip('/')
        self.now = now
        self.rate_lock = Lock()
        self.rates = defaultdict(deque)
        initialize(self.path)

    def rate(self, key, count=60, window=60):
        with self.rate_lock:
            now = self.now()
            # Bounded even if many distinct IP addresses submit requests.
            if len(self.rates) > 10000:
                self.rates = defaultdict(deque, {k:v for k,v in self.rates.items() if v and v[-1] > now-window})
            values = self.rates[key]
            while values and values[0] <= now-window:
                values.popleft()
            if len(values) >= count:
                raise APIError(429, 'Terlalu banyak permintaan. Cuba sebentar lagi.')
            values.append(now)

    def quota(self, db, key, count, window):
        bucket = int(self.now() // window)
        db.execute('INSERT INTO quotas VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET n=n+1', (key,bucket))
        if db.execute('SELECT n FROM quotas WHERE key=? AND bucket=?', (key,bucket)).fetchone()[0] > count:
            raise APIError(429, 'Had penghantaran dicapai. Cuba kemudian.')
        db.execute('DELETE FROM quotas WHERE bucket < ? AND key=?', (bucket-2,key))

    def auth(self, env, db):
        bearer = env.get('HTTP_AUTHORIZATION', '')
        if not bearer.startswith('Bearer ') or len(bearer) > 150:
            raise APIError(401, 'Sesi diperlukan.')
        digest = hashlib.sha256(bearer[7:].encode()).hexdigest()
        if not db.execute('SELECT 1 FROM sessions WHERE token=? AND created>?', (digest,self.now()-90*86400)).fetchone():
            raise APIError(401, 'Sesi tamat. Cuba hantar semula.')
        return digest

    def call_routing(self, method, payload):
        req = urllib.request.Request(self.upstream+'/'+method, data=json.dumps(payload).encode(), headers={'Content-Type':'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=20) as result:
                body = result.read(6_000_001)
                if len(body) > 6_000_000:
                    raise APIError(502, 'Respons laluan terlalu besar.')
                return json.loads(body)
        except urllib.error.HTTPError as error:
            if error.code in (400,404):
                raise APIError(422, 'Laluan tidak dijumpai untuk lokasi ini.') from error
            raise APIError(503, 'Enjin laluan belum tersedia.') from error
        except (OSError, ValueError) as error:
            raise APIError(503, 'Enjin laluan belum tersedia.') from error

    def dispatch(self, env, body):
        method, path = env['REQUEST_METHOD'], env.get('PATH_INFO','/')
        query = parse_qs(env.get('QUERY_STRING',''))
        # X-Forwarded-For is deliberately not trusted. Configure a trusted proxy
        # to set REMOTE_ADDR before increasing the shared-IP quota in production.
        ip = env.get('REMOTE_ADDR','unknown')
        self.rate('read:'+ip, 300)
        if path == '/health' and method == 'GET':
            return {'ok':True, 'placesReady':Path(self.places).exists(), 'trafficLive':False}
        if path == '/search' and method == 'GET':
            q = query.get('q',[''])[0].strip()
            words = re.findall(r'\w+', q, re.UNICODE)[:8]
            if len(q) < 2 or len(q) > 150 or not words:
                raise APIError(400, 'Masukkan nama tempat atau alamat.')
            if not Path(self.places).exists():
                raise APIError(503, 'Indeks tempat sedang disediakan.')
            with connect(f'file:{self.places}?mode=ro') as db:
                expression = ' AND '.join('"'+w.replace('"','')+'"*' for w in words)
                rows = db.execute('''SELECT p.name,p.lon,p.lat,p.address,p.kind FROM places_fts f
                  JOIN places p ON p.id=f.rowid WHERE places_fts MATCH ? ORDER BY rank LIMIT 20''', (expression,)).fetchall()
                return {'places':[{'name':r['name'],'coordinate':[r['lon'],r['lat']],'address':r['address'],'kind':r['kind']} for r in rows]}
        if path == '/route' and method == 'POST':
            self.rate('route:'+ip,30)
            a, b = coordinate(body.get('from')), coordinate(body.get('to'))
            mode = body.get('mode','auto')
            if not isinstance(mode,str) or mode not in MODES or not isinstance(body.get('avoidTolls',False), bool):
                raise APIError(400, 'Pilihan laluan tidak sah.')
            options = {'use_tolls':0 if body.get('avoidTolls') else 0.5} if mode in ('auto','motorcycle') else {}
            return self.call_routing('route', {'locations':[{'lon':a[0],'lat':a[1]},{'lon':b[0],'lat':b[1]}],
                'costing':mode,'costing_options':{mode:options},'units':'kilometers','language':'en-US',
                'shape_format':'polyline6','alternates':2})
        if path == '/speed-limit' and method == 'POST':
            # Two timestamp-ordered GPS points are needed to distinguish parallel roads.
            points = body.get('points')
            if not isinstance(points,list) or not 2 <= len(points) <= 5:
                raise APIError(400, 'Jejak GPS tidak sah.')
            checked = [coordinate(p) for p in points]
            if any(distance(checked[i-1],checked[i]) > 1500 for i in range(1,len(checked))):
                raise APIError(400, 'Jejak GPS terlalu jauh.')
            result = self.call_routing('trace_attributes', {'shape':[{'lon':p[0],'lat':p[1]} for p in checked],
                'costing':'auto','shape_match':'map_snap','units':'kilometers',
                'filters':{'action':'include','attributes':['edge.speed_limit','matched.point','matched.type','matched.edge_index','matched.distance_from_trace_point']}})
            matched = result.get('matched_points',[])
            last = matched[-1] if matched else {}
            edge_index = last.get('edge_index')
            edges = result.get('edges',[])
            limit = None
            # Show unknown if the most recent point did not match reliably.
            if last.get('type') == 'matched' and last.get('distance_from_trace_point',999) <= 20 and isinstance(edge_index,int) and 0 <= edge_index < len(edges):
                candidate = edges[edge_index].get('speed_limit')
                if isinstance(candidate,(int,float)) and 0 < candidate <= 160:
                    limit = candidate
            return {'limit':limit,'source':'OpenStreetMap','live':False}
        with connect(self.path) as db:
            if path == '/session' and method == 'POST':
                self.quota(db,'session:'+ip,20,3600)
                token = secrets.token_urlsafe(32)
                db.execute('INSERT INTO sessions VALUES(?,?)',(hashlib.sha256(token.encode()).hexdigest(), self.now()))
                return {'token':token,'expiresIn':90*86400}
            if path == '/reports' and method == 'GET':
                db.execute('DELETE FROM reports WHERE expires < ?', (self.now()-86400,))
                db.execute('DELETE FROM sessions WHERE created < ? AND token NOT IN (SELECT owner FROM reports) AND token NOT IN (SELECT voter FROM votes)',(self.now()-90*86400,))
                rows = db.execute('''SELECT r.*,SUM(CASE WHEN v.present=1 THEN 1 ELSE 0 END) AS confirmed,
                    SUM(CASE WHEN v.present=0 THEN 1 ELSE 0 END) AS absent
                    FROM reports r LEFT JOIN votes v ON r.id=v.report AND v.created>?
                    WHERE r.removed=0 AND r.expires>? GROUP BY r.id ORDER BY r.created DESC LIMIT 500''',(self.now()-TTL,self.now())).fetchall()
                return {'reports':[{'id':r['id'],'category':r['category'],'lon':r['lon'],'lat':r['lat'],
                    'createdAt':int(r['created']*1000),'expiresAt':int(r['expires']*1000),
                    'confirmed':r['confirmed'] or 0,'absent':r['absent'] or 0} for r in rows]}
            if path == '/reports' and method == 'POST':
                owner = self.auth(env,db)
                category = body.get('category')
                if not isinstance(category,str) or category not in CATEGORIES:
                    raise APIError(400, 'Kategori laporan tidak sah.')
                lon,lat = coordinate(body.get('coordinate'))
                self.quota(db,'report:'+owner,5,600)
                self.quota(db,'write:'+ip,60,600)
                # Merge the same category within 100m instead of creating clutter.
                candidates = db.execute('SELECT * FROM reports WHERE category=? AND removed=0 AND expires>?',(category,self.now())).fetchall()
                existing = next((r for r in candidates if distance((lon,lat),(r['lon'],r['lat'])) < 100),None)
                if existing:
                    return {'id':existing['id'],'merged':True}
                rid = secrets.token_hex(16)
                db.execute('INSERT INTO reports(id,owner,category,lon,lat,created,expires) VALUES(?,?,?,?,?,?,?)',
                    (rid,owner,category,lon,lat,self.now(),self.now()+TTL))
                return {'id':rid,'merged':False}
            vote = re.fullmatch(r'/reports/([a-f0-9]{32})/vote', path)
            if vote and method == 'POST':
                voter = self.auth(env,db)
                self.quota(db,'vote:'+voter,60,600)
                rid = vote[1]
                report = db.execute('SELECT * FROM reports WHERE id=? AND removed=0 AND expires>?',(rid,self.now())).fetchone()
                if not report:
                    raise APIError(404, 'Laporan sudah tamat.')
                point = coordinate(body.get('coordinate'))
                if distance(point,(report['lon'],report['lat'])) > 1000:
                    raise APIError(400, 'Sahkan laporan apabila berhampiran lokasinya.')
                present = body.get('present')
                if not isinstance(present,bool):
                    raise APIError(400, 'Pengesahan tidak sah.')
                if report['owner'] == voter and not present:
                    db.execute('UPDATE reports SET removed=1 WHERE id=?',(rid,))
                elif report['owner'] == voter:
                    # Author cannot self-confirm or indefinitely extend their report.
                    raise APIError(400, 'Laporan anda menunggu pengesahan pengguna lain.')
                else:
                    db.execute('INSERT INTO votes VALUES(?,?,?,?) ON CONFLICT(report,voter) DO UPDATE SET present=excluded.present,created=excluded.created', (rid,voter,int(present),self.now()))
                    counts = db.execute('SELECT SUM(present),SUM(1-present) FROM votes WHERE report=? AND created>?',(rid,self.now()-TTL)).fetchone()
                    yes,no = counts[0] or 0,counts[1] or 0
                    if no >= 2 and no > yes:
                        db.execute('UPDATE reports SET removed=1 WHERE id=?',(rid,))
                    elif present:
                        db.execute('UPDATE reports SET expires=MIN(created+21600,MAX(expires,?)) WHERE id=?',(self.now()+1800,rid))
                return {'ok':True}
            if path.startswith('/admin/reports/') and method == 'DELETE':
                key = os.getenv('ADMIN_TOKEN','')
                if not key or not secrets.compare_digest(env.get('HTTP_AUTHORIZATION',''), 'Bearer '+key):
                    raise APIError(403, 'Akses pentadbir diperlukan.')
                db.execute('UPDATE reports SET removed=1 WHERE id=?',(path.rsplit('/',1)[-1],))
                return {'ok':True}
        raise APIError(404, 'Tidak dijumpai.')

    def __call__(self, env, start_response):
        origin = env.get('HTTP_ORIGIN','')
        allowed = set(os.getenv('ALLOWED_ORIGINS','https://localhost,http://localhost,http://localhost:5173,http://127.0.0.1:5173').split(','))
        headers = [('Content-Type','application/json; charset=utf-8'),('Cache-Control','no-store'),('X-Content-Type-Options','nosniff')]
        if origin in allowed:
            headers += [('Access-Control-Allow-Origin',origin),('Vary','Origin'),('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS'),('Access-Control-Allow-Headers','Content-Type, Authorization')]
        try:
            if origin and origin not in allowed:
                raise APIError(403, 'Origin tidak dibenarkan.')
            if env['REQUEST_METHOD'] == 'OPTIONS':
                start_response('204 No Content',headers)
                return [b'']
            try:
                size = int(env.get('CONTENT_LENGTH') or 0)
            except ValueError:
                raise APIError(400,'Permintaan tidak sah.')
            if size < 0 or size > 10000:
                raise APIError(413,'Permintaan terlalu besar.')
            raw = env['wsgi.input'].read(size) if size else b'{}'
            try:
                body = json.loads(raw)
            except (ValueError,UnicodeError):
                raise APIError(400,'JSON tidak sah.')
            if not isinstance(body,dict):
                raise APIError(400,'Permintaan tidak sah.')
            result = self.dispatch(env,body)
            code = 200
        except APIError as error:
            code,result = error.code, {'error':error.message}
        except Exception:
            # Do not leak report coordinates, tokens or stack traces in responses/logs.
            code,result = 500, {'error':'Pelayan mengalami masalah. Cuba lagi.'}
        start_response(f'{code} '+{200:'OK',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',413:'Content Too Large',422:'Unprocessable Content',429:'Too Many Requests',502:'Bad Gateway',503:'Service Unavailable',500:'Internal Server Error'}[code], headers)
        return [json.dumps(result,ensure_ascii=False,allow_nan=False).encode()]


def create_app():
    return App()
