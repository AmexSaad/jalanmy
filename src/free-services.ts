import {createClient} from '@supabase/supabase-js';
import {geoRoutes,geoPlaces} from './geoapify.mjs';
import {projectUrl,publishableKey} from './project-config';
const env=(import.meta as ImportMeta&{env:Record<string,string>}).env;
const databaseUrl=env.VITE_SUPABASE_URL||projectUrl;
const databaseKey=env.VITE_SUPABASE_ANON_KEY||publishableKey;
export const reportsConfigured=Boolean(databaseUrl&&databaseKey);
export let freeConfigured=Boolean(env.VITE_GEOAPIFY_KEY&&reportsConfigured);
export let geoKey=env.VITE_GEOAPIFY_KEY||'';
const supabase=reportsConfigured?createClient(databaseUrl,databaseKey):null;
let signingIn:Promise<void>|null=null;
async function session(){
  if(!supabase)throw new Error('Pangkalan data belum disambungkan.');
  const {data,error}=await supabase.auth.getSession();if(error)throw error;
  if(!data.session){signingIn??=supabase.auth.signInAnonymously().then(({error})=>{if(error)throw error;}).finally(()=>{signingIn=null;});await signingIn;}
}
async function rpc(name:string,args:Record<string,unknown>={}){
  await session();const {data,error}=await supabase!.rpc(name,args);if(error)throw new Error(error.message);return data;
}
let configRequest:Promise<void>|null=null;
export async function loadMapConfig(){
  if(geoKey||!reportsConfigured)return;
  configRequest??=rpc('jalanmy_client_config').then(result=>{
    if(typeof result?.geoapifyKey==='string'&&result.geoapifyKey.length>=16){geoKey=result.geoapifyKey;freeConfigured=true;}
  }).finally(()=>{configRequest=null;});
  await configRequest;
}
async function geo(path:string,params:Record<string,string>,signal?:AbortSignal){
  await loadMapConfig();
  if(!geoKey)throw new Error('Perkhidmatan peta belum disambungkan. Projek Geoapify perlu diaktifkan dahulu.');
  const url=new URL('https://api.geoapify.com/v1/'+path);Object.entries({...params,apiKey:geoKey}).forEach(([key,value])=>url.searchParams.set(key,value));
  const response=await fetch(url,{signal:signal||AbortSignal.timeout(25000)});const data=await response.json();
  if(!response.ok)throw new Error(response.status===429?'Kuota percuma carian atau laluan dicapai. Cuba kemudian.':data.message||'Perkhidmatan peta tidak tersedia.');return data;
}
export async function freeRequest(path:string,body:unknown,signal?:AbortSignal):Promise<unknown>{
  const payload=body as Record<string,unknown>|undefined;
  if(path.startsWith('/search?')){const q=new URLSearchParams(path.split('?')[1]).get('q')||'';return geoPlaces(await geo('geocode/search',{text:q,format:'json',filter:'rect:102.35,1.15,104.6,2.95|countrycode:my',bias:'countrycode:my',limit:'20'},signal));}
  if(path==='/route'){
    const from=payload!.from as number[],to=payload!.to as number[],mode=String(payload!.mode);
    const params:Record<string,string>={waypoints:`${from[1]},${from[0]}|${to[1]},${to[0]}`,mode:({auto:'drive',pedestrian:'walk'} as Record<string,string>)[mode]||mode,details:'instruction_details,route_details,polyline6',units:'metric',lang:'en'};
    if(payload!.avoidTolls)params.avoid='tolls';return geoRoutes(await geo('routing',params,signal));
  }
  // In this mode speed limits come from the selected route, never from guessed speeds.
  if(path==='/speed-limit')return {limit:null};
  if(path==='/reports'&&body===undefined)return {reports:await rpc('jalanmy_reports')};
  if(path==='/reports')return rpc('jalanmy_report',{category:payload!.category,coordinate:payload!.coordinate});
  const vote=path.match(/^\/reports\/([a-f0-9-]+)\/vote$/);
  if(vote)return rpc('jalanmy_vote',{report_id:vote[1],coordinate:payload!.coordinate,present:payload!.present});
  throw new Error('Perkhidmatan tidak dikenali.');
}
