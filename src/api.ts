import {freeConfigured,freeRequest,reportsConfigured,geoKey} from './free-services';
const endpoint=((import.meta as ImportMeta&{env:Record<string,string>}).env.VITE_API_URL||'').replace(/\/$/,'');
export const configured=Boolean(endpoint)||freeConfigured;
let token='';try{token=localStorage.getItem('jalanmy.session')||'';}catch{/* memory session */}
let sessionRequest:Promise<void>|null=null;
export async function request<T>(path:string,body?:unknown,signal?:AbortSignal,authenticated=false,retry=true):Promise<T>{
  if(!endpoint&&(reportsConfigured||geoKey))return await freeRequest(path,body,signal) as T;
  if(!endpoint)throw new Error('Perkhidmatan jalanMY belum diaktifkan. APK ini belum bersambung ke pelayan.');
  if(authenticated&&!token){sessionRequest??=request<{token:string}>('/session',{}).then(r=>{token=r.token;try{localStorage.setItem('jalanmy.session',token);}catch{/* memory session */}}).finally(()=>{sessionRequest=null;});await sessionRequest;}
  const response=await fetch(endpoint+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(authenticated?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:signal||AbortSignal.timeout(25000)});
  if(response.status===401&&authenticated&&retry){token='';return request<T>(path,body,signal,true,false);}
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Perkhidmatan tidak tersedia. Cuba lagi.');return data;
}
