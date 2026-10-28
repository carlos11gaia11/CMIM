import {initial, apply, roleFor} from './engine.mjs';

// A Edge Function guarda os tokens como hashes. A chave administrativa do Supabase
// nunca é enviada ao navegador/GitHub Pages. A tabela não possui RLS para anon.
const BASE = Deno.env.get('SUPABASE_URL') || '';
const SERVER_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TABLE = `${BASE}/rest/v1/cmim_draft_rooms`;
const REPORTS = `${BASE}/rest/v1/cmim_draft_game_reports`;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-cmim-captain, x-client-info',
  'Access-Control-Max-Age': '86400',
};
const response = (data:unknown, status=200) => new Response(JSON.stringify(data), {
  status,
  headers:{...CORS,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const fail = (message:string, status=400) => response({error:message},status);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = () => crypto.randomUUID();
const hash = async (input:string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const adminHeaders = {'apikey':SERVER_KEY,'Authorization':`Bearer ${SERVER_KEY}`,'Content-Type':'application/json'};

// Nao revelar o voto do adversario antes do consenso: o navegador so ve seu voto.
function safeState(state:any,role:string){
 const copy=structuredClone(state);
 if(copy.resultVotes){
  for(const side of ['B','R']){
   const v=copy.resultVotes[side];
   if(v&&side!==role)copy.resultVotes[side]={submitted:true};
  }
  const count=Number(!!copy.resultVotes.B)+Number(!!copy.resultVotes.R);
  copy.resultConflict=count===2;
 }
 return copy;
}
async function activeSeason(){
 try{
  const response=await fetch(BASE+'/rest/v1/cmim_rank?id=eq.1&select=data',{headers:adminHeaders});
  if(!response.ok)return null;
  const rows=await response.json();
  const season=(rows[0]?.data?.seasons||[]).find((s:any)=>s.status==='active');
  return season?{id:String(season.id).slice(0,120),name:String(season.name).slice(0,120)}:null;
 }catch{return null}
}
async function dbGet(id:string) {
 const r=await fetch(`${TABLE}?id=eq.${encodeURIComponent(id)}&select=id,blue_token_hash,red_token_hash,state,revision`,{headers:adminHeaders,cache:'no-store'});
 if(!r.ok) throw Error('Banco indisponível.');
 const rows=await r.json();return rows[0]||null;
}
let cachedChampions:any=null;
let championsCachedAt=0;
async function catalog() {
 if(cachedChampions && Date.now()-championsCachedAt<600000)return cachedChampions;
 const v=await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
 if(!v.ok) throw Error('Catálogo da Riot indisponível.');
 const [version]=await v.json();
 const c=await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion.json`);
 if(!c.ok) throw Error('Campeões indisponíveis.');
 const {data}=await c.json();
 cachedChampions = {version, champions:Object.values(data).map((x:any)=>({id:x.id,name:x.name,tags:x.tags})).sort((a:any,b:any)=>a.name.localeCompare(b.name,'pt-BR'))}; championsCachedAt=Date.now(); return cachedChampions;
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
 if(!BASE||!SERVER_KEY) return fail('Banco da arena não configurado.',503);
 const path=new URL(req.url).pathname.split('/').filter(Boolean);
 const at=path.indexOf('cmim-draft-api');const route=path.slice(at+1);
 if(at<0) return fail('Rota não encontrada.',404);
 if(req.headers.get('content-length') && Number(req.headers.get('content-length'))>2_100_000) return fail('Arquivo muito grande.',413);
 try {
  if(req.method==='GET' && route[0]==='health') return response({ok:true,app:'CMIM Draft Arena',backend:'Supabase'});
  if(req.method==='GET' && route[0]==='champions') return response(await catalog());
  // Relatorios sobrevivem a limpeza das salas apos 24h. ID da sala e um UUID nao sequencial.
  if(req.method==='GET' && route.length===2 && route[0]==='reports' && UUID.test(route[1])){
   const query=REPORTS+'?room_id=eq.'+encodeURIComponent(route[1])+'&select=room_id,game,season_id,season_name,winner_side,winner_team,report_txt,confirmed_at&order=game.asc';
   const result=await fetch(query,{headers:adminHeaders,cache:'no-store'});
   if(!result.ok)throw Error('Nao foi possivel carregar os relatorios.');
   return response(await result.json());
  }
  if(req.method==='POST' && route.length===1 && route[0]==='rooms') {
   const config=await req.json();
   const id=uuid(), B=uuid(), R=uuid(), state=initial({...config,season:await activeSeason()});
   const row={id,blue_token_hash:await hash(B),red_token_hash:await hash(R),state,revision:0};
   const r=await fetch(TABLE,{method:'POST',headers:{...adminHeaders,'Prefer':'return=minimal'},body:JSON.stringify(row)});
   if(!r.ok) throw Error('Falha ao criar sala.');
   return response({id,B,R,state,revision:0});
  }
  if(route.length===2 && route[0]==='rooms' && UUID.test(route[1])) {
   const id=route[1], row=await dbGet(id);
   if(!row) return fail('Sala não encontrada.',404);
   const token=req.headers.get('x-cmim-captain')||'';
   const tokenHash=token ? await hash(token) : '';
   const identity=tokenHash===row.blue_token_hash?'B':tokenHash===row.red_token_hash?'R':'viewer';
   const role=roleFor(row.state,identity);
   if(req.method==='GET') return response({state:safeState(row.state,role),revision:Number(row.revision),role});
   if(req.method==='POST') {
    if(role==='viewer') return fail('Link de espectador: somente leitura.',403);
    const body=await req.json();
    if(!Number.isSafeInteger(body?.revision)||body.revision!==Number(row.revision)) return fail('O draft mudou. Atualize e tente novamente.',409);
    let champions:string[]=[];
    if(['confirm','change_commit'].includes(body.action?.type)) champions=(await catalog()).champions.map((c:any)=>c.id);
    let next;
    try {next=apply(row.state,body.action,role,champions,Date.now());}
    catch(e){return fail((e as Error).message,400)}
    const target=`${TABLE}?id=eq.${encodeURIComponent(id)}&revision=eq.${row.revision}&select=revision`;
    const update=await fetch(target,{method:'PATCH',headers:{...adminHeaders,'Prefer':'return=representation'},body:JSON.stringify({state:next,revision:Number(row.revision)+1,updated_at:new Date().toISOString()})});
    if(!update.ok) throw Error('Falha ao salvar o draft.');
    const updated=await update.json();
    if(!updated.length) return fail('O draft mudou. Atualize e tente novamente.',409);
    return response({state:safeState(next,role),revision:Number(updated[0].revision),role});
   }
  }
  return fail('Rota não encontrada.',404);
 } catch(e) {
  console.error('CMIM Draft API:',e);
  return fail('Falha de comunicação com o servidor. Tente novamente.',500);
 }
});
