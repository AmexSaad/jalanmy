"""Import named OSM nodes, addresses and ways into an atomic SQLite FTS index."""
import argparse
import os
import sqlite3
from pathlib import Path
import osmium


class Places(osmium.SimpleHandler):
    def __init__(self, db):
        super().__init__()
        self.db = db
        self.buffer = []

    def add(self, tags, lon, lat, oid):
        if not (102.35 <= lon <= 104.6 and 1.15 <= lat <= 2.95):
            return
        street, number = tags.get('addr:street',''), tags.get('addr:housenumber','')
        address = ', '.join(x for x in [number,street,tags.get('addr:suburb',''),tags.get('addr:city',''),tags.get('addr:postcode','')] if x)
        name = tags.get('name:ms') or tags.get('name') or (f'{number} {street}'.strip() if street else '')
        if not name:
            return
        kind = next((tags[k] for k in ('amenity','shop','tourism','place','highway','leisure') if k in tags),'alamat')
        text = ' '.join([name,address,tags.get('name:en',''),tags.get('alt_name',''),tags.get('brand','')])
        self.buffer.append((oid,name,lon,lat,address,kind,text))
        if len(self.buffer) >= 3000:
            self.flush()

    def flush(self):
        self.db.executemany('INSERT OR IGNORE INTO places(osm_id,name,lon,lat,address,kind,search) VALUES(?,?,?,?,?,?,?)',self.buffer)
        self.buffer.clear()
        self.db.commit()

    def node(self, node):
        if node.location.valid():
            self.add(node.tags,node.location.lon,node.location.lat,'n'+str(node.id))

    def way(self, way):
        if not (way.tags.get('name') or way.tags.get('name:ms') or way.tags.get('addr:street')):
            return
        points = [(n.lon,n.lat) for n in way.nodes if n.location.valid()]
        if points:
            # Representative point on geometry, rather than a centroid outside the road.
            lon,lat = points[len(points)//2]
            self.add(way.tags,lon,lat,'w'+str(way.id))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('pbf')
    parser.add_argument('--output',default='/data/places.sqlite')
    args = parser.parse_args()
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    temp = args.output+'.importing'
    Path(temp).unlink(missing_ok=True)
    db = sqlite3.connect(temp)
    db.executescript('''CREATE TABLE places(id INTEGER PRIMARY KEY,osm_id TEXT UNIQUE,name TEXT,lon REAL,lat REAL,address TEXT,kind TEXT,search TEXT);
      CREATE VIRTUAL TABLE places_fts USING fts5(search,content=places,content_rowid=id,tokenize='unicode61 remove_diacritics 2');''')
    handler = Places(db)
    handler.apply_file(args.pbf,locations=True,idx='flex_mem')
    handler.flush()
    db.execute("INSERT INTO places_fts(places_fts) VALUES('rebuild')")
    db.commit()
    count = db.execute('SELECT COUNT(*) FROM places').fetchone()[0]
    db.close()
    if not count:
        raise RuntimeError('No places imported; previous index preserved')
    os.replace(temp,args.output)
    print(f'Imported {count} named places/addresses. OSM data © OpenStreetMap contributors, ODbL.')


if __name__ == '__main__':
    main()
