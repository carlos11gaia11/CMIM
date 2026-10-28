import {createClient} from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const client = url && publicKey ? createClient(url, publicKey, {auth:{persistSession:false,autoRefreshToken:false}}) : null;

export const isConfigured = () => Boolean(url && publicKey);
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

export async function apiRequest(path:string, options:{method?:string;token?:string;body?:unknown} = {}) {
 if(!isConfigured()) throw Error('Supabase não configurado. Consulte o LEIA-ME.');
 const response = await fetch(`${url}/functions/v1/cmim-draft-api${path}`, {
  method:options.method||'GET',
  headers:{'Content-Type':'application/json','apikey':publicKey,...(options.token?{'X-CMIM-Captain':options.token}:{})},
  ...(options.body!==undefined?{body:JSON.stringify(options.body)}:{}),
  cache:'no-store'
 });
 const data=await response.json().catch(()=>({error:'Resposta inválida do Supabase.'}));
 if(!response.ok) throw Error(data.error||`Erro ${response.status} no Supabase.`);
 return data;
}

// Realtime é usado apenas como notificação. Todo estado vem da Edge Function,
// que valida os tokens de cada capitão e aplica as regras do motor no servidor.
const channels = new Map<string, {channel:any,count:number}>();
function getRoomChannel(id:string) {
 if(!client) return null;
 const existing=channels.get(id);
 if(existing){existing.count++;return existing.channel;}
 const channel=client.channel('cmim-draft-'+id,{config:{broadcast:{self:false}}});
 channels.set(id,{channel,count:1});
 return channel;
}
export function watchRoom(id:string, refresh:()=>void) {
 const channel=getRoomChannel(id);
 if(!channel)return ()=>{};
 channel.on('broadcast',{event:'updated'},refresh).subscribe();
 return ()=>{const item=channels.get(id);if(item&&--item.count<=0){channels.delete(id);client?.removeChannel(channel)}};
}
export async function notifyRoom(id:string){
 const c=channels.get(id)?.channel;
 if(c) await c.send({type:'broadcast',event:'updated',payload:{revisionChanged:true}}).catch(()=>{});
}
