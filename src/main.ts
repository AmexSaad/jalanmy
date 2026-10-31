import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import './journey.css';
import {startLocation} from './location';
import {categories,decodePolyline,gpsSpeed,inCoverage} from './domain.mjs';
import {cumulative,project,instruction,aheadReport,meters} from './navigation.mjs';
import {request,configured} from './api';
import {speak,stopSpeech,keepAwake} from './speech';
import {geoKey,freeConfigured,loadMapConfig} from './free-services';

type Place={name:string;coordinate:[number,number];address?:string};
type Report={id:string;category:string;lon:number;lat:number;createdAt:number;expiresAt:number;confirmed:number;absent:number};
type Maneuver={type:number;begin_shape_index:number;end_shape_index:number;instruction:string;street_names?:string[];roundabout_exit_count?:number};
type LimitSegment={from:number;to:number;limit:number|null};
type Trip={status:number;summary:{time:number;length:number};legs:{shape:string;maneuvers:Maneuver[];speedLimits?:LimitSegment[]}[]};
type Route={trip:Trip;coordinates:number[][];lengths:number[];maneuvers:Maneuver[];speedLimits:LimitSegment[]};
document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<div id="map" aria-label="Peta Johor"></div>
<aside class="panel"><header><div class="brand">jalan<span>MY</span></div><span class="badge">JOHOR</span></header>
<h1>Jalan kita. Cerita kita.</h1><p class="muted">Cari tempat, pilih laluan dan bantu komuniti.</p>
<form id="search-form"><label for="search">Nak ke mana?</label><div class="search-line"><input id="search" type="search" placeholder="Nama tempat atau alamat di Johor" autocomplete="off" required minlength="2" maxlength="150"><button id="search-button">Cari</button></div></form><div id="places"></div>
<div class="journey"><strong id="destination">Pilih destinasi pada peta</strong><p class="muted">Cari alamat atau sentuh peta untuk pilih lokasi.</p>
<label for="mode">Jenis perjalanan</label><select id="mode"><option value="auto">🚗 Kereta</option><option value="motorcycle">🏍️ Motosikal</option><option value="bicycle">🚲 Basikal</option><option value="pedestrian">🚶 Berjalan kaki</option></select>
<button id="locate" class="secondary">◎ Gunakan lokasi saya</button><p id="origin">Lokasi mula belum dipilih.</p>
<label class="check"><input id="tolls" type="checkbox"> Utamakan laluan tanpa tol</label>
<button id="route">Kira laluan</button><div id="alternatives"></div><div id="summary"></div>
<button id="start" hidden>Mula perjalanan</button><button id="stop" class="secondary" hidden>Tamat perjalanan</button>
<label class="check"><input id="voice" type="checkbox" checked> Panduan suara</label></div>
<p id="status" role="status" aria-live="polite">${configured?'Cari destinasi untuk bermula.':'Perkhidmatan belum disambungkan. Navigasi dan laporan bersama belum tersedia.'}</p>
<details><summary>Laporan komuniti <span id="count">0</span></summary><p id="report-status" class="muted">Memuatkan laporan…</p><div id="reports"></div></details>
<footer>Anggaran masa tanpa trafik langsung. Had laju bergantung pada data OSM.<br>Laporan komuniti mungkin belum disahkan. Lokasi dihantar kepada pelayan semasa menggunakan laluan, had laju atau laporan.</footer></aside>
<div id="guidance" class="guidance" hidden><strong id="turn-distance"></strong><div id="turn"></div><small id="navigation-status"></small></div>
<div class="speed"><strong id="speed">—</strong><small>km/j · GPS</small><span>Had: <b id="limit">—</b></span></div>
<button id="report-open" class="report-fab">＋ Lapor</button>
<dialog id="report-dialog"><form method="dialog"><button class="close" aria-label="Tutup">×</button></form><h2>Lapor keadaan jalan</h2><p>Gunakan lokasi GPS semasa. Penumpang boleh melapor; pemandu berhenti dahulu.</p><div id="categories"></div><p id="sending" role="status"></p><p class="muted">Lokasi laporan dikongsi dengan komuniti. Jangan sertakan maklumat peribadi.</p></dialog>`;
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=(message:string)=>{$('status').textContent=message;};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'Permintaan gagal. Cuba lagi.';
const environment=(import.meta as ImportMeta&{env:Record<string,string>}).env;
const map=new maplibregl.Map({container:'map',center:[103.65,1.62],zoom:9.5,style:{version:8,sources:{osm:{type:'raster',tiles:[environment.VITE_TILE_URL||(geoKey?`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(geoKey)}`:'https://tile.openstreetmap.org/{z}/{x}/{y}.png')],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'+(geoKey?' · Powered by <a href="https://www.geoapify.com/">Geoapify</a>':'')}},layers:[{id:'osm',type:'raster',source:'osm'}]}});
map.addControl(new maplibregl.NavigationControl(),'top-right');
// Configuration is retrieved through the authenticated RPC; no key is committed.
void loadMapConfig().then(()=>{
  if(!geoKey)return;
  const useProvider=()=>{
    if(environment.VITE_TILE_URL)return;
    const source=map.getSource('osm') as maplibregl.RasterTileSource|undefined;
    source?.setTiles([`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(geoKey)}`]);
    const attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Powered by <a href="https://www.geoapify.com/">Geoapify</a>';
    map.addControl(new maplibregl.AttributionControl({customAttribution:attribution,compact:true}),'bottom-right');
    status('Perkhidmatan jalanMY bersambung. Cari destinasi untuk bermula.');
  };
  if(map.isStyleLoaded())useProvider();else map.once('load',useProvider);
}).catch(e=>status(errorMessage(e)));
let destination:Place|null=null,origin:[number,number]|null=null,originUpdated=0,accuracy=Infinity;
let destinationMarker:maplibregl.Marker|null=null,locationMarker:maplibregl.Marker|null=null;
let stopLocation:(()=>void)|null=null,locationStarting=false,locationGeneration=0;
let reportMarkers:maplibregl.Marker[]=[],reports:Report[]=[];
let routes:Route[]=[],selected:Route|null=null,navigating=false,progress=0,offRouteCount=0;
let routeRequest:AbortController|null=null,routeVersion=0,searchRequest:AbortController|null=null;
let lastReroute=0,lastLimitRequest=0,lastSpeedWarning=0,speedLimit:number|null=null;
let gpsTrail:number[][]=[],lastInstruction='',lastAlertTime=0,pausedNavigation=false,limitPosition:number[]|null=null;
const alerted=new Set<string>();
const freshOrigin=()=>origin&&Date.now()-originUpdated<15000;
const say=(text:string)=>{if($<HTMLInputElement>('voice').checked)void speak(text).catch(e=>status(errorMessage(e)));};
function finish(message='Perjalanan ditamatkan.'){
  navigating=false;pausedNavigation=false;keepAwake(false);stopSpeech();$('guidance').hidden=true;$('start').hidden=!selected;$('stop').hidden=true;status(message);
}
function clearRoute(){
  routeVersion++;routeRequest?.abort();routes=[];selected=null;finish();$('start').hidden=true;$('alternatives').replaceChildren();$('summary').replaceChildren();$<HTMLButtonElement>('route').disabled=false;
  if(map.getLayer('route'))map.removeLayer('route');if(map.getSource('route'))map.removeSource('route');
}
function choosePlace(place:Place){
  clearRoute();destination=place;$('destination').textContent=place.name;destinationMarker?.remove();
  destinationMarker=new maplibregl.Marker({color:'#ef7745'}).setLngLat(place.coordinate).addTo(map);map.flyTo({center:place.coordinate,zoom:14});
  status('Destinasi dipilih. Dapatkan lokasi anda dan kira laluan.');
}
function showRoute(index:number,fit=true){
  selected=routes[index];progress=0;lastInstruction='';offRouteCount=0;alerted.clear();
  if(map.getLayer('route'))map.removeLayer('route');if(map.getSource('route'))map.removeSource('route');
  map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:selected.coordinates}}});
  map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#008b8b','line-width':6}});
  if(fit){const bounds=new maplibregl.LngLatBounds();selected.coordinates.forEach(c=>bounds.extend([c[0],c[1]]));map.fitBounds(bounds,{padding:70});}
  $('summary').textContent=`${Math.ceil(selected.trip.summary.time/60)} min · ${selected.trip.summary.length.toFixed(1)} km`;
  $('start').hidden=navigating;$('stop').hidden=!navigating;
  Array.from($('alternatives').children).forEach((child,i)=>child.classList.toggle('selected',index===i));
}
function toRoute(trip:Trip):Route{
  if(trip.status!==0||!trip.legs?.length||!Number.isFinite(trip.summary?.time)||!Number.isFinite(trip.summary?.length))throw new Error('Respons laluan tidak sah.');
  const coordinates:number[][]=[],maneuvers:Maneuver[]=[],speedLimits:LimitSegment[]=[];
  for(const leg of trip.legs){const decoded=decodePolyline(leg.shape),offset=Math.max(0,coordinates.length-1);coordinates.push(...(coordinates.length?decoded.slice(1):decoded));maneuvers.push(...leg.maneuvers.map(m=>({...m,begin_shape_index:m.begin_shape_index+offset,end_shape_index:m.end_shape_index+offset})));speedLimits.push(...(leg.speedLimits||[]).map(s=>({...s,from:s.from+offset,to:s.to+offset})));}
  if(coordinates.length<2)throw new Error('Geometri laluan tidak sah.');
  return {trip,coordinates,maneuvers,lengths:cumulative(coordinates),speedLimits};
}
async function calculateRoute(reroute=false){
  if(!destination)return status('Pilih destinasi dahulu.');if(!freshOrigin())return status('Dapatkan lokasi GPS terkini dahulu.');
  routeRequest?.abort();const version=++routeVersion,controller=new AbortController();routeRequest=controller;
  const timeout=window.setTimeout(()=>controller.abort(),25000),button=$<HTMLButtonElement>('route');button.disabled=true;
  status(reroute?'Mengira semula laluan…':'Mengira laluan…');
  try{
    const result=await request<{trip:Trip;alternates?:{trip:Trip}[]}>('/route',{from:origin,to:destination.coordinate,mode:$<HTMLSelectElement>('mode').value,avoidTolls:$<HTMLInputElement>('tolls').checked},controller.signal);
    if(version!==routeVersion)return;
    routes=[result.trip,...(result.alternates||[]).map(a=>a.trip)].map(toRoute);$('alternatives').replaceChildren();
    routes.forEach((r,i)=>{const b=document.createElement('button');b.className='secondary route-option';b.textContent=`${i===0?'Disyorkan':'Alternatif '+i} · ${Math.ceil(r.trip.summary.time/60)} min · ${r.trip.summary.length.toFixed(1)} km`;b.onclick=()=>{if(!navigating)showRoute(i);};$('alternatives').append(b);});
    showRoute(0,!reroute);status('Laluan tersedia. Anggaran masa tanpa trafik langsung.');
    if(reroute){say('Laluan baharu tersedia.');if(origin)updateNavigation(origin);}
  }catch(e){if(version===routeVersion){status(errorMessage(e));if(reroute)$('navigation-status').textContent='Kiraan semula gagal. Ikut papan tanda dan cuba lagi.';}}
  finally{window.clearTimeout(timeout);if(version===routeVersion)button.disabled=false;}
}
$('route').onclick=()=>{finish();void calculateRoute();};
for(const id of ['mode','tolls'])$(id).addEventListener('change',()=>{clearRoute();status('Pilihan diubah. Kira laluan semula.');});
$('search-form').onsubmit=async e=>{
  e.preventDefault();searchRequest?.abort();const controller=new AbortController();searchRequest=controller;
  const button=$<HTMLButtonElement>('search-button');button.disabled=true;
  try{const result=await request<{places:Place[]}>('/search?q='+encodeURIComponent($<HTMLInputElement>('search').value.trim()),undefined,controller.signal);
    if(controller!==searchRequest)return;$('places').replaceChildren();
    result.places.forEach(place=>{const b=document.createElement('button');b.className='place';const title=document.createElement('strong');title.textContent=place.name;const address=document.createElement('small');address.textContent=place.address||'Johor';b.append(title,address);b.onclick=()=>choosePlace(place);$('places').append(b);});
    status(result.places.length?'Pilih tempat daripada hasil carian.':'Tiada hasil. Cuba nama lain atau pilih lokasi pada peta.');
  }catch(error){if(!controller.signal.aborted)status(errorMessage(error));}finally{if(controller===searchRequest)button.disabled=false;}
};
map.on('click',e=>{if((e.originalEvent.target as HTMLElement).closest('.maplibregl-marker,.maplibregl-popup')||navigating)return;if(!inCoverage(e.lngLat.lng,e.lngLat.lat))return status('Di luar liputan Johor.');choosePlace({name:`Destinasi · ${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)}`,coordinate:[e.lngLat.lng,e.lngLat.lat]});});
map.on('error',()=>status('Peta tidak dapat dimuatkan. Semak sambungan internet.'));

function updateNavigation(point:[number,number]){
  if(!navigating||!selected||accuracy>50)return;
  const match=project(point,selected.coordinates,selected.lengths,progress);
  if(match.distance>70){offRouteCount++;$('navigation-status').textContent='Anda di luar laluan.';if(offRouteCount>=3&&Date.now()-lastReroute>30000){lastReroute=Date.now();void calculateRoute(true);}return;}
  offRouteCount=0;progress=match.progress;
  if(freeConfigured&&accuracy<25){speedLimit=selected.speedLimits.find(s=>s.from<=match.index&&s.to>match.index)?.limit??null;limitPosition=point;$('limit').textContent=speedLimit?`${speedLimit} km/j`:'—';}
  const total=selected.lengths.at(-1)!,remaining=Math.max(0,total-progress);
  if(remaining<80&&destination&&meters(point,destination.coordinate)<40&&accuracy<35){finish('Anda telah tiba di destinasi.');say('Anda telah tiba di destinasi.');return;}
  const next=selected.maneuvers.find(m=>selected!.lengths[m.begin_shape_index]>progress+10)||selected.maneuvers.at(-1);
  if(!next)return;
  const distance=Math.max(0,(selected.lengths[next.begin_shape_index]||total)-progress),text=instruction(next);
  $('turn-distance').textContent=distance<1000?`${Math.round(distance/10)*10} m`:`${(distance/1000).toFixed(1)} km`;$('turn').textContent=text;
  const minutes=Math.max(1,Math.ceil(selected.trip.summary.time*(remaining/Math.max(1,total))/60));$('summary').textContent=`${minutes} min · ${(remaining/1000).toFixed(1)} km lagi`;
  $('navigation-status').textContent=accuracy>30?'Ketepatan GPS rendah. Semak papan tanda.':'Anggaran tanpa trafik langsung';
  const phase=distance<60?'now':distance<300?'soon':'far',key=`${next.begin_shape_index}:${phase}`;
  if(key!==lastInstruction){lastInstruction=key;if(phase!=='far')say(phase==='now'?text:`Dalam ${Math.round(distance/50)*50} meter, ${text}`);}
  map.easeTo({center:point,zoom:16,duration:800});
  const nearby=reports.filter(r=>!alerted.has(r.id)).map(r=>({r,d:aheadReport(r,selected!.coordinates,progress,selected!.lengths,point)})).filter(x=>x.d!==null).sort((a,b)=>a.d!-b.d!)[0];
  if(nearby&&Date.now()-lastAlertTime>12000){alerted.add(nearby.r.id);lastAlertTime=Date.now();const alert=`${nearby.r.category} dilaporkan, ${Math.round(nearby.d!/50)*50} meter di hadapan`;status(alert);say(alert);}
}
async function updateLimit(point:[number,number]){
  if(freeConfigured)return;
  if(accuracy>25){speedLimit=null;$('limit').textContent='—';return;}
  if(gpsTrail.length&&meters(gpsTrail.at(-1)!,point)<10)return;
  gpsTrail.push(point);gpsTrail=gpsTrail.slice(-4);
  if(gpsTrail.length<2||Date.now()-lastLimitRequest<15000||!configured)return;lastLimitRequest=Date.now();
  try{const result=await request<{limit:number|null}>('/speed-limit',{points:gpsTrail});if(!freshOrigin()||meters(origin!,point)>40)return;speedLimit=result.limit;limitPosition=point;$('limit').textContent=speedLimit?`${speedLimit} km/j`:'—';}
  catch{speedLimit=null;$('limit').textContent='—';}
}
function resetGps(){origin=null;originUpdated=0;accuracy=Infinity;gpsTrail=[];speedLimit=null;$('speed').textContent='—';$('limit').textContent='—';locationMarker?.remove();locationMarker=null;}
async function locate(){
  if(locationStarting)return;locationStarting=true;const generation=++locationGeneration;stopLocation?.();stopLocation=null;resetGps();
  try{const stop=await startLocation(position=>{
    if(document.hidden||generation!==locationGeneration)return;
    const {longitude,latitude,speed}=position.coords;
    if(!inCoverage(longitude,latitude)){resetGps();if(navigating)finish();return status('Lokasi GPS di luar liputan Johor.');}
    origin=[longitude,latitude];originUpdated=Date.now();accuracy=position.coords.accuracy;
    const first=!locationMarker;locationMarker??=new maplibregl.Marker({color:'#008b8b'}).addTo(map);locationMarker.setLngLat(origin);if(first)map.flyTo({center:origin,zoom:14});
    if(limitPosition&&meters(origin,limitPosition)>40){speedLimit=null;$('limit').textContent='—';}
    const value=gpsSpeed(speed);$('speed').textContent=value===null?'—':String(value);$('origin').textContent=`Lokasi GPS · ketepatan ±${Math.round(accuracy)} m`;
    $('speed').classList.toggle('over-limit',value!==null&&speedLimit!==null&&value>speedLimit);
    if(navigating&&value!==null&&speedLimit!==null&&value>speedLimit+5&&Date.now()-lastSpeedWarning>60000){lastSpeedWarning=Date.now();say(`Had laju ${speedLimit} kilometer sejam.`);}
    if(pausedNavigation){pausedNavigation=false;navigating=true;keepAwake(true);$('guidance').hidden=false;$('stop').hidden=false;$('start').hidden=true;lastReroute=Date.now();void calculateRoute(true);}
    if(navigating)updateNavigation(origin);void updateLimit(origin);
  },()=>{if(generation!==locationGeneration)return;resetGps();status('GPS tidak tersedia. Semak izin lokasi dan hidupkan GPS.');if(navigating)$('navigation-status').textContent='Isyarat GPS hilang.';});if(document.hidden||generation!==locationGeneration)stop();else stopLocation=stop;}
  catch(e){resetGps();status(errorMessage(e));}finally{locationStarting=false;}
}
$('locate').onclick=()=>void locate();
$('start').onclick=()=>{if(!selected||!freshOrigin())return status('Dapatkan lokasi GPS terkini dahulu.');navigating=true;progress=0;lastInstruction='';lastReroute=Date.now();alerted.clear();keepAwake(true);$('guidance').hidden=false;$('start').hidden=true;$('stop').hidden=false;say('Perjalanan bermula.');updateNavigation(origin!);};
$('stop').onclick=()=>finish();
let reportsLoading=false;
async function loadReports(){
  if(reportsLoading||document.hidden)return;reportsLoading=true;
  try{const result=await request<{reports:Report[]}>('/reports');reports=result.reports.filter(r=>r.expiresAt>Date.now());renderReports();$('report-status').textContent='Dikemas kini '+new Date().toLocaleTimeString('ms-MY')+' · laporan komuniti, bukan pengesahan rasmi.';}
  catch(e){$('report-status').textContent=errorMessage(e);reports=reports.filter(r=>r.expiresAt>Date.now());renderReports();}finally{reportsLoading=false;}
}
function renderReports(){
  reportMarkers.forEach(m=>m.remove());reportMarkers=[];$('reports').replaceChildren();$('count').textContent=String(reports.length);
  for(const report of reports){
    const row=document.createElement('div');row.className='report-row';const text=document.createElement('p');text.textContent=`${report.category} · ${Math.max(0,Math.floor((Date.now()-report.createdAt)/60000))} min lalu · ${report.confirmed} pengesahan`;row.append(text);
    for(const [label,present] of [['Masih ada',true],['Dah tiada',false]] as const){const b=document.createElement('button');b.className='small';b.textContent=label;b.onclick=async()=>{if(!freshOrigin()||accuracy>100)return status('Dapatkan GPS tepat berhampiran lokasi laporan.');b.disabled=true;try{await request(`/reports/${report.id}/vote`,{coordinate:origin,present},undefined,true);status('Pengesahan dihantar.');await loadReports();}catch(e){status(errorMessage(e));}finally{b.disabled=false;}};row.append(b);}
    $('reports').append(row);const content=document.createElement('p');content.textContent=text.textContent;reportMarkers.push(new maplibregl.Marker({color:'#db8b19'}).setLngLat([report.lon,report.lat]).setPopup(new maplibregl.Popup().setDOMContent(content)).addTo(map));
  }
}
const dialog=$<HTMLDialogElement>('report-dialog');$('report-open').onclick=()=>dialog.showModal();let sending=false;
for(const category of categories){const b=document.createElement('button');b.className='secondary';b.textContent=category;b.onclick=async()=>{
  if(sending)return;if(!freshOrigin()||accuracy>100){dialog.close();return status('Dapatkan lokasi GPS tepat dahulu.');}sending=true;$('sending').textContent='Menghantar…';
  try{await request('/reports',{category,coordinate:origin},undefined,true);dialog.close();status('Laporan dikongsi dengan komuniti.');await loadReports();}catch(e){$('sending').textContent=errorMessage(e);}finally{sending=false;}
};$('categories').append(b);}
void loadReports();window.setInterval(()=>void loadReports(),30000);
window.setInterval(()=>{if(!freshOrigin()){$('speed').textContent='—';$('limit').textContent='—';speedLimit=null;$('speed').classList.remove('over-limit');if(navigating)$('navigation-status').textContent='Menunggu lokasi GPS terkini…';}},5000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){locationGeneration++;pausedNavigation=navigating;navigating=false;stopLocation?.();stopLocation=null;resetGps();keepAwake(false);stopSpeech();}else{void loadReports();if(pausedNavigation)void locate();}});
window.addEventListener('pagehide',()=>{stopLocation?.();keepAwake(false);stopSpeech();});
