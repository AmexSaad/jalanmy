import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { startLocation } from './location';
import { activeReports, categories, decodePolyline, gpsSpeed, inCoverage } from './domain.mjs';

type Report = {id: string; category: string; lon: number; lat: number; createdAt: number};
type Place = {name: string; coordinate: [number, number]};
const places: Place[] = [
  {name: 'JB Sentral', coordinate: [103.7637, 1.4625]},
  {name: 'Johor Bahru City Square', coordinate: [103.7638, 1.4615]},
  {name: 'Senai Airport', coordinate: [103.6703, 1.6368]},
  {name: 'LEGOLAND Malaysia', coordinate: [103.6297, 1.4273]},
  {name: 'Pasir Gudang', coordinate: [103.902, 1.47]},
  {name: 'Kulai', coordinate: [103.603, 1.656]},
  {name: 'Batu Pahat', coordinate: [102.928, 1.854]},
  {name: 'Muar', coordinate: [102.569, 2.044]},
  {name: 'Kluang', coordinate: [103.319, 2.031]},
  {name: 'Mersing', coordinate: [103.841, 2.431]},
];
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="map" aria-label="Peta Johor"></div>
  <aside class="panel"><header><div class="brand">jalan<span>MY</span></div><span class="badge">JOHOR · ALFA</span></header>
  <h1>Jalan kita. Cerita kita.</h1><p class="muted">Terokai Johor, satu perjalanan pada satu masa.</p>
  <label for="search">Nak ke mana?</label><input id="search" type="search" placeholder="Cari dalam 10 tempat percubaan…" autocomplete="off"><div id="places"></div>
  <div class="journey"><strong id="destination">Pilih destinasi pada peta</strong><p class="muted">Klik peta untuk destinasi lain. Carian penuh belum disambungkan.</p>
  <div class="mode">🚗 Kereta <span>Mod pertama</span></div>
  <button id="locate" class="secondary">◎ Gunakan lokasi saya</button><p id="origin">Lokasi mula belum dipilih.</p>
  <label class="check"><input id="tolls" type="checkbox"> Elak tol</label>
  <button id="route">Kira laluan</button><div id="summary"></div></div>
  <p id="status" role="status" aria-live="polite">Pilih tempat atau klik pada peta untuk bermula.</p>
  <details><summary>Laporan peranti ini <span id="count">0</span></summary><p class="muted">Belum dikongsi dengan pengguna lain. Luput selepas 1 jam.</p><div id="reports"></div></details>
  <footer>Prototaip • Tiada trafik langsung atau panduan suara.<br>Lokasi GPS hanya diminta apabila anda menekan butang lokasi.</footer></aside>
  <div class="speed" aria-label="Kelajuan"><strong id="speed">—</strong><small>km/j · GPS</small><span>Had laju: —</span></div>
  <button id="report-open" class="report-fab">＋ Lapor</button>
  <dialog id="report-dialog"><form method="dialog"><button class="close" aria-label="Tutup">×</button></form><h2>Lapor keadaan jalan</h2><p>Laporan diletakkan di lokasi GPS anda. Penumpang boleh melapor; pemandu berhenti dahulu.</p><div id="categories"></div><p class="muted">Laporan ini disimpan pada peranti anda sahaja.</p></dialog>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (message: string) => { $('status').textContent = message; };
const map = new maplibregl.Map({container: 'map', center: [103.65, 1.62], zoom: 9.5,
  style: {version: 8, sources: {osm: {type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}}, layers: [{id: 'osm', type: 'raster', source: 'osm'}]}});
map.addControl(new maplibregl.NavigationControl(), 'top-right');
let destination: Place | null = null;
let origin: [number, number] | null = null;
let originUpdated = 0;
let destinationMarker: maplibregl.Marker | null = null;
let locationMarker: maplibregl.Marker | null = null;
let reportMarkers: maplibregl.Marker[] = [];
let routeRequest: AbortController | null = null;
let routeVersion = 0;
let stopLocation: (() => void) | null = null;
let reports: Report[] = [];
try { reports = activeReports(JSON.parse(localStorage.getItem('jalanmy.reports') || '[]')); } catch { status('Simpanan laporan tidak dapat dibaca. Anda masih boleh guna peta.'); }

function clearRoute() {
  routeVersion++; routeRequest?.abort(); $('summary').replaceChildren();
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
}
function selectPlace(place: Place) {
  clearRoute(); destination = place; $('destination').textContent = place.name;
  destinationMarker?.remove(); destinationMarker = new maplibregl.Marker({color: '#ef7745'}).setLngLat(place.coordinate).addTo(map);
  map.flyTo({center: place.coordinate, zoom: 13}); status('Destinasi dipilih. Gunakan lokasi anda untuk kira laluan.');
}
function renderPlaces() {
  const query = $<HTMLInputElement>('search').value.toLocaleLowerCase(); $('places').replaceChildren();
  const matches = places.filter(p => p.name.toLocaleLowerCase().includes(query));
  for (const place of matches.slice(0, 4)) { const b = document.createElement('button'); b.className = 'place'; b.textContent = `↗  ${place.name}`; b.onclick = () => selectPlace(place); $('places').append(b); }
  if (!matches.length) { const p = document.createElement('p'); p.textContent = 'Tiada dalam senarai percubaan. Klik lokasi pada peta.'; $('places').append(p); }
}
$('search').addEventListener('input', renderPlaces); renderPlaces();
map.on('click', e => {
  if ((e.originalEvent.target as HTMLElement).closest('.maplibregl-marker,.maplibregl-popup')) return;
  if (!inCoverage(e.lngLat.lng, e.lngLat.lat)) return status('Kawasan ini di luar liputan percubaan Johor.');
  selectPlace({name: `Pin destinasi · ${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)}`, coordinate: [e.lngLat.lng, e.lngLat.lat]});
});
map.on('error', () => status('Peta mengalami masalah sambungan. Semak internet dan muat semula jika perlu.'));
$('tolls').addEventListener('change', clearRoute);
$('locate').onclick = async () => {
  if (!navigator.geolocation) return status('Pelayar ini tidak menyokong GPS.');
  stopLocation?.();
  try { stopLocation = await startLocation(position => {
    const {longitude, latitude, speed} = position.coords;
    if (!inCoverage(longitude, latitude)) { origin = null; originUpdated = 0; locationMarker?.remove(); $('speed').textContent = '—'; $('origin').textContent = 'Lokasi di luar liputan percubaan.'; clearRoute(); return status('GPS anda berada di luar kawasan percubaan Johor.'); }
    origin = [longitude, latitude]; originUpdated = Date.now();
    const first = !locationMarker;
    locationMarker ??= new maplibregl.Marker({color: '#008b8b'}).addTo(map);
    locationMarker.setLngLat(origin);
    if (first) map.flyTo({center: origin, zoom: 14});
    const value = gpsSpeed(speed); $('speed').textContent = value === null ? '—' : String(value);
    $('origin').textContent = `Lokasi GPS · ketepatan ±${Math.round(position.coords.accuracy)} m`;
    status('Lokasi diterima. Anda boleh kira laluan atau hantar laporan.');
  }, () => { origin = null; originUpdated = 0; locationMarker?.remove(); locationMarker = null; $('speed').textContent = '—'; $('origin').textContent = 'Lokasi tidak tersedia.'; clearRoute(); status('Lokasi tidak dapat diperoleh. Benarkan akses lokasi dan cuba lagi.'); }); } catch { status('Akses lokasi tidak tersedia. Benarkan lokasi dalam tetapan aplikasi.'); }
};
const freshOrigin = () => origin && Date.now() - originUpdated < 60000;
$('route').onclick = async () => {
  if (!destination) return status('Pilih destinasi dahulu.');
  if (!freshOrigin()) return status('Dapatkan lokasi GPS terkini dahulu.');
  const endpoint = (import.meta as ImportMeta & {env: Record<string,string>}).env.VITE_VALHALLA_URL;
  if (!endpoint) return status('Enjin laluan belum disambungkan. Tetapkan VITE_VALHALLA_URL mengikut README projek.');
  clearRoute(); const version = routeVersion; routeRequest = new AbortController();
  const timeout = window.setTimeout(() => routeRequest?.abort(), 20000);
  const button = $<HTMLButtonElement>('route'); button.disabled = true; status('Sedang mengira laluan…');
  try {
    const payload = {locations: [{lon: origin![0], lat: origin![1]}, {lon: destination.coordinate[0], lat: destination.coordinate[1]}], costing: 'auto', costing_options: {auto: {use_tolls: $<HTMLInputElement>('tolls').checked ? 0 : 0.5}}, units: 'kilometers', shape_format: 'polyline6'};
    const url = new URL('route', endpoint.endsWith('/') ? endpoint : endpoint + '/'); url.searchParams.set('json', JSON.stringify(payload));
    const response = await fetch(url, {signal: routeRequest.signal}); if (!response.ok) throw new Error('route');
    const result = await response.json(); if (version !== routeVersion) return;
    const trip = result.trip; if (trip?.status !== 0 || !trip.legs?.length) throw new Error('route');
    const coordinates = trip.legs.flatMap((leg: {shape: string}) => decodePolyline(leg.shape));
    if (coordinates.length < 2 || !Number.isFinite(trip.summary?.time) || !Number.isFinite(trip.summary?.length)) throw new Error('route');
    map.addSource('route', {type: 'geojson', data: {type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates}}});
    map.addLayer({id: 'route', type: 'line', source: 'route', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {'line-color': '#008b8b', 'line-width': 6}});
    const bounds = new maplibregl.LngLatBounds(); coordinates.forEach((c: number[]) => bounds.extend([c[0],c[1]])); map.fitBounds(bounds, {padding: 70});
    $('summary').textContent = `${Math.ceil(trip.summary.time / 60)} min · ${trip.summary.length.toFixed(1)} km`;
    status('Laluan kereta tersedia. Anggaran ini tidak menggunakan trafik langsung. Elak tol ialah keutamaan, bukan jaminan.');
  } catch { if (version === routeVersion) status('Laluan tidak dapat dikira. Semak pelayan laluan dan sambungan internet.'); }
  finally { window.clearTimeout(timeout); button.disabled = false; }
};
function saveReports() { try { localStorage.setItem('jalanmy.reports', JSON.stringify(reports)); } catch { status('Laporan dipaparkan sementara; simpanan peranti tidak tersedia.'); } }
function renderReports() {
  reports = activeReports(reports); reportMarkers.forEach(m => m.remove()); reportMarkers = []; $('reports').replaceChildren(); $('count').textContent = String(reports.length);
  for (const report of reports) {
    const minutes = Math.max(0, Math.floor((Date.now() - report.createdAt) / 60000));
    const row = document.createElement('div'); row.className = 'report-row';
    const text = document.createElement('p'); text.textContent = `${report.category} · ${minutes} min lalu · belum disahkan`; row.append(text);
    for (const [label, action] of [['Masih ada', 'keep'], ['Dah tiada', 'remove']]) {
      const b = document.createElement('button'); b.className = 'small'; b.textContent = label; b.onclick = () => { reports = action === 'remove' ? reports.filter(r => r.id !== report.id) : reports.map(r => r.id === report.id ? {...r, createdAt: Date.now()} : r); saveReports(); renderReports(); }; row.append(b);
    }
    $('reports').append(row);
    const content = document.createElement('p'); content.textContent = `${report.category} · ${minutes} min lalu. Laporan peranti ini; belum disahkan.`;
    reportMarkers.push(new maplibregl.Marker({color: '#db8b19'}).setLngLat([report.lon,report.lat]).setPopup(new maplibregl.Popup().setDOMContent(content)).addTo(map));
  }
}
const dialog = $<HTMLDialogElement>('report-dialog'); $('report-open').onclick = () => dialog.showModal();
for (const category of categories) { const b = document.createElement('button'); b.className = 'secondary'; b.textContent = category; b.onclick = () => {
  if (!freshOrigin()) { dialog.close(); return status('Gunakan lokasi saya dahulu. Laporan memerlukan GPS terkini.'); }
  reports.push({id: crypto.randomUUID(), category, lon: origin![0], lat: origin![1], createdAt: Date.now()}); saveReports(); renderReports(); dialog.close(); status('Laporan ditambah pada peranti ini. Belum dikongsi kepada orang lain.');
}; $('categories').append(b); }
renderReports(); window.setInterval(renderReports, 30000);
window.setInterval(() => { if (!freshOrigin()) $('speed').textContent = '—'; }, 5000);
window.addEventListener('pagehide', () => { stopLocation?.(); });
