import {Capacitor,registerPlugin} from '@capacitor/core';
const native=registerPlugin<{speak(options:{text:string}):Promise<void>;stop():Promise<void>;keepAwake(options:{enabled:boolean}):Promise<void>}>('JalanSpeech');
export async function speak(text:string){if(Capacitor.isNativePlatform())await native.speak({text});else if('speechSynthesis'in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ms-MY';window.speechSynthesis.speak(u);}else throw new Error('Panduan suara tidak tersedia pada peranti ini.');}
export function stopSpeech(){if(Capacitor.isNativePlatform())void native.stop().catch(()=>{});else window.speechSynthesis?.cancel();}
export function keepAwake(enabled:boolean){if(Capacitor.isNativePlatform())void native.keepAwake({enabled}).catch(()=>{});}
