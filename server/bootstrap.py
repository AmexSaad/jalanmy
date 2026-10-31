"""Start the API immediately and build the place index on first persistent-volume startup."""
import os
import subprocess
import sys
import threading
import signal
import time
import urllib.request
from pathlib import Path


def import_data():
    target = Path(os.getenv('PLACES_PATH','/data/places.sqlite'))
    if target.exists():
        return
    pbf = target.parent/'malaysia-singapore-brunei-latest.osm.pbf'
    url = os.getenv('OSM_PBF_URL','https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf')
    for attempt in range(3):
        try:
            if not pbf.exists():
                temporary = pbf.with_suffix('.download')
                with urllib.request.urlopen(url,timeout=90) as response, open(temporary,'wb') as output:
                    total=0
                    while chunk := response.read(1024*1024):
                        total+=len(chunk)
                        if total > 2_000_000_000:
                            raise RuntimeError('OSM download exceeds configured size limit')
                        output.write(chunk)
                os.replace(temporary,pbf)
            subprocess.run([sys.executable,'-m','server.import_places',str(pbf),'--output',str(target)],check=True)
            return
        except Exception as error:
            print(f'Place import attempt {attempt+1} failed: {type(error).__name__}',flush=True)
            time.sleep(30)
    print('Place import failed. Operator intervention required.',flush=True)


def main():
    Path(os.getenv('DATABASE_PATH','/data/reports.sqlite')).parent.mkdir(parents=True,exist_ok=True)
    api=subprocess.Popen([sys.executable,'-m','gunicorn','--bind','0.0.0.0:'+os.getenv('PORT','8080'),'--workers','1','--threads','8','--timeout','60','server.app:create_app()'])
    def stop(signum,frame):
        api.terminate()
        raise SystemExit(0)
    signal.signal(signal.SIGTERM,stop)
    signal.signal(signal.SIGINT,stop)
    import_data()
    raise SystemExit(api.wait())


if __name__=='__main__':
    main()
