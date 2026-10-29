/* Auth de jogadores CMIM. Sessões armazenadas no browser; Supabase gerencia senhas e confirmação. */
(()=>{'use strict';
 const BASE='https://klpvidxhzofbwstvvxib.supabase.co',KEY='sb_publishable_B5WMdyJBIdYhauVepUIOZw_hnvXs4Xn';
 const STORAGE='cmim_player_session',LANES=['TOP','JG','MID','ADC','SUP'];
 let session=null,loginInFlight=null;try{session=JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{}
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 function save(data){session=data||null;try{if(data)localStorage.setItem(STORAGE,JSON.stringify(data));else localStorage.removeItem(STORAGE)}catch{}document.dispatchEvent(new CustomEvent('cmim-auth-changed',{detail:{loggedIn:!!session}}));updateBadge()}
 async function call(path,{method='GET',body,secure=false,headers={}}={}){
  if(secure)await current();
  const res=await fetch(BASE+path,{method,cache:'no-store',headers:{apikey:KEY,...(secure?{Authorization:'Bearer '+session.access_token}:{}),...(body instanceof Blob?{}:{'Content-Type':'application/json'}),...headers},body:body instanceof Blob?body:body!==undefined?JSON.stringify(body):undefined});
  const text=await res.text();let payload={};try{payload=JSON.parse(text)}catch{payload={message:text.slice(0,120)}}
  if(!res.ok)throw Error(payload.msg||payload.error_description||payload.message||payload.error||payload.details||'Erro do Supabase ('+res.status+')');
  return payload;
 }
 async function current(){
  if(!session?.access_token)return null;
  if((session.expires_at||0)>Date.now()/1000+90)return session;
  if(loginInFlight)return loginInFlight;
  loginInFlight=(async()=>{try{const fresh=await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});save(fresh);return fresh}catch{save(null);return null}finally{loginInFlight=null}})();
  return loginInFlight;
 }
 async function user(){
  if(!await current())return null;
  try{return await call('/auth/v1/user',{secure:true})}catch{save(null);return null}
 }
 async function signIn(email,password){
  const data=await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  save(data);return data;
 }
 async function signUp(values){
  const nickTag=String(values.riot_id||'').trim().match(/^(.{2,32})#([A-Za-z0-9]{3,6})$/);
  if(!nickTag)throw Error('Use um nick com # e tag de 3 a 6 caracteres. Ex.: Gaia#BR1.');
  if(!LANES.includes(values.lane)||!LANES.includes(values.secondary_lane)||values.lane===values.secondary_lane)
   throw Error('Escolha duas lanes diferentes.');
  if(String(values.password||'').length<8)throw Error('A senha precisa de pelo menos 8 caracteres.');
  if(String(values.real_name||'').trim().length<2)throw Error('Informe seu nome.');
  const out=await call('/auth/v1/signup',{method:'POST',body:{
   email:String(values.email).trim().toLowerCase(),password:values.password,
   data:{nick:nickTag[1].trim(),tag:nickTag[2].toUpperCase(),real_name:String(values.real_name).trim().slice(0,90),
     lane:values.lane,secondary_lane:values.secondary_lane}
  }});
  if(out.access_token)save(out);
  return out;
 }
 async function logout(){
  const token=(await current())?.access_token;
  try{if(token)await call('/auth/v1/logout',{method:'POST',secure:true})}catch{}
  save(null);try{sessionStorage.removeItem('cmim_session')}catch{}
 }
 function profileLink(){return './perfil.html'}
 async function uploadAvatar(file){
  const who=await user();if(!who)throw Error('Entre na sua conta antes de enviar sua foto.');
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Escolha JPG, PNG ou WebP de até 2 MB.');
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
  const path=who.id+'/avatar.'+ext;
  const res=await fetch(BASE+'/storage/v1/object/cmim-avatars/'+path,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+(await current()).access_token,
   'Content-Type':file.type,'x-upsert':'true'},body:file});
  const info=await res.json().catch(()=>({}));if(!res.ok)throw Error(info.message||info.error||'Falha no envio da imagem.');
  const url=BASE+'/storage/v1/object/public/cmim-avatars/'+path+'?v='+Date.now();
  await call('/rest/v1/cmim_profiles?id=eq.'+who.id,{method:'PATCH',secure:true,headers:{Prefer:'return=minimal'},body:{avatar_url:url,updated_at:new Date().toISOString()}});
  return url;
 }
 function badgeMarkup(){return '<div class="cmim-auth-bar" id="cmim-auth-badge"><a href="./conta.html" title="Conta CMIM">◌ Entrar / Cadastrar</a></div>'}
 function updateBadge(){const el=document.getElementById('cmim-auth-badge');if(!el)return;
  if(session?.access_token){const name=session.user?.user_metadata?.nick||'Meu perfil';el.innerHTML='<a href="./perfil.html">◉ '+esc(name)+' · Perfil</a>';}
  else el.innerHTML='<a href="./conta.html">◌ Entrar / Cadastrar</a>';
 }
 function mountBadge(){if(document.getElementById('cmim-auth-badge')||document.body?.dataset?.noAuthBadge==='1')return;
  document.body.insertAdjacentHTML('beforeend',badgeMarkup());updateBadge();
  if(session?.access_token)current().then(updateBadge);
 }
 window.CMIMAuth={BASE,KEY,LANES,call,current,user,signIn,signUp,logout,uploadAvatar,esc,session:()=>session,save};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountBadge);else mountBadge();
})();
