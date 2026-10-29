/* Auth de jogadores CMIM. Sessões armazenadas no browser; Supabase gerencia senhas e confirmação. */
(()=>{'use strict';
 const BASE='https://klpvidxhzofbwstvvxib.supabase.co',KEY='sb_publishable_B5WMdyJBIdYhauVepUIOZw_hnvXs4Xn';
 const STORAGE='cmim_player_session',LANES=['TOP','JG','MID','ADC','SUP'];
 // Confirmations must return to the published CMIM site, never to Supabase's localhost default.
 const EMAIL_CONFIRM_REDIRECT='https://carlos11gaia11.github.io/CMIM/conta.html?confirmed=1';
 let session=null,loginInFlight=null;try{const adm=JSON.parse(sessionStorage.getItem('cmim_session')||'null'),player=JSON.parse(localStorage.getItem(STORAGE)||'null');session=adm?.user?.app_metadata?.cmim_admin===true?adm:(player||adm)}catch{}
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
 function normalizePhone(value){
 let digits=String(value||'').replace(/[^0-9]/g,'');
 if(digits.startsWith('55')&&(digits.length===12||digits.length===13))digits=digits.slice(2);
 if(!/^[1-9][0-9][0-9]{8,9}$/.test(digits))throw Error('Informe telefone com DDD e 10 ou 11 dígitos.');
 return '+55'+digits;
}
async function signUp(values){
  const nickTag=String(values.riot_id||'').trim().match(/^(.{2,32})#([A-Za-z0-9]{3,6})$/);
  if(!nickTag)throw Error('Use um nick com # e tag de 3 a 6 caracteres. Ex.: Gaia#BR1.');
  if(!LANES.includes(values.lane)||!LANES.includes(values.secondary_lane)||values.lane===values.secondary_lane)
   throw Error('Escolha duas lanes diferentes.');
  if(String(values.password||'').length<8)throw Error('A senha precisa de pelo menos 8 caracteres.');
  if(String(values.real_name||'').trim().length<2)throw Error('Informe seu nome.');
  const out=await call('/auth/v1/signup?redirect_to='+encodeURIComponent(EMAIL_CONFIRM_REDIRECT),{method:'POST',body:{
   email:String(values.email).trim().toLowerCase(),password:values.password,
   data:{nick:nickTag[1].trim(),tag:nickTag[2].toUpperCase(),real_name:String(values.real_name).trim().slice(0,90),
     lane:values.lane,secondary_lane:values.secondary_lane,phone_e164:normalizePhone(values.phone)}
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
 
 // Page access is enforced using Supabase Auth, not merely the presence of a stored token.
 // Pages intentionally marked data-cmim-protected=1 are gated even when opened by direct URL.
 const PROTECTED_PAGES=new Set(['draft.html','ranking.html','selecao.html','inhouse.html','relatorios.html','campeonatos.html','perfil.html']);
 function safeReturn(raw){
  if(!raw||typeof raw!=='string'||raw.length>1500)return null;
  try{
   const target=new URL(raw,location.href);
   const root=location.pathname.replace(/[^/]*$/,'');
   const page=target.pathname.split('/').pop();
   if(target.origin!==location.origin||!target.pathname.startsWith(root)||!PROTECTED_PAGES.has(page))return null;
   return target.href;
  }catch{return null}
 }
 function requestedDestination(){
  try{
   const saved=sessionStorage.getItem('cmim:login-return');
   const valid=safeReturn(saved);
   sessionStorage.removeItem('cmim:login-return');
   return valid||new URL('./perfil.html',location.href).href;
  }catch{return new URL('./perfil.html',location.href).href}
 }
 function gotoLogin(){
  const currentPage=location.pathname.split('/').pop();
  if(currentPage==='conta.html')return;
  const requested=location.pathname+location.search+location.hash;
  try{sessionStorage.setItem('cmim:login-return',requested)}catch{}
  location.replace(new URL('./conta.html?required=1',location.href).href);
 }
 async function requireLogin(){
  // Only a valid Supabase Auth user unlocks the page. Expired and forged sessions fail.
  if(document.body?.dataset?.cmimProtected!=='1')return true;
  try{
   const verified=await user();
   if(!verified?.id){gotoLogin();return false}
   document.documentElement.classList.remove('cmim-auth-pending');
   document.dispatchEvent(new Event('cmim-auth-ready'));
   return true;
  }catch{gotoLogin();return false}
 }

 function badgeMarkup(){return '<div class="cmim-auth-bar" id="cmim-auth-badge"><a href="./conta.html" title="Conta CMIM">◌ Entrar / Cadastrar</a></div>'}
 function updateBadge(){
  const authenticated=!!session?.access_token;
  const name=session?.user?.user_metadata?.nick||'Meu perfil';
  // On the homepage login belongs in the prominent header CTA, not in the bottom corner.
  const header=document.getElementById('portal-auth-button');
  if(header){
   header.href=authenticated?'./perfil.html':'./conta.html';
   header.textContent=authenticated?'◉ '+name+' · MEU PERFIL ↗':'◉ ENTRAR / CRIAR CONTA ↗';
   header.setAttribute('aria-label',authenticated?'Abrir meu perfil CMIM':'Entrar no CMIM ou criar conta');
  }
  const el=document.getElementById('cmim-auth-badge');
  if(!el)return;
  if(authenticated)el.innerHTML='<a href="./perfil.html">◉ '+esc(name)+' · Perfil</a>';
  else el.innerHTML='<a href="./conta.html">◌ Entrar / Cadastrar</a>';
 }
 function mountBadge(){if(document.getElementById('cmim-auth-badge')||document.body?.dataset?.noAuthBadge==='1')return;
  document.body.insertAdjacentHTML('beforeend',badgeMarkup());updateBadge();
  if(session?.access_token)current().then(updateBadge);
 }
 function mountMobileDock(){
  if(!document.body||document.getElementById('cmim-mobile-dock'))return;
  const links=[
   ['⌂','Portal','./'],
   ['▶','Jogar','./draft.html?jogar=1'],
   ['♛','Torneios','./campeonatos.html'],
   ['◉','Perfil','./perfil.html'],
   ['▥','Ranking','./ranking.html']
  ];
  const here=location.pathname.split('/').pop()||'index.html';
  const nav=document.createElement('nav');nav.id='cmim-mobile-dock';nav.className='cmim-mobile-dock';
  nav.setAttribute('aria-label','Acesso rápido às seções CMIM');
  nav.innerHTML=links.map(([icon,label,href])=>{
    const path=href.replace('./','').split('?')[0]||'index.html';
    const active=here===path;
    return '<a href="'+href+'"'+(active?' aria-current="page"':'')+'>'+
      '<span aria-hidden="true">'+icon+'</span><small>'+label+'</small></a>';
  }).join('');
  document.body.append(nav);
 }
 window.CMIMAuth={BASE,KEY,EMAIL_CONFIRM_REDIRECT,LANES,call,current,user,signIn,signUp,normalizePhone,logout,uploadAvatar,esc,session:()=>session,save,requireLogin,gotoLogin,requestedDestination};
 function initialize(){
  if(document.body?.dataset?.cmimProtected==='1'){
   void requireLogin().then(ok=>{if(ok){mountBadge();mountMobileDock();updateBadge()}});
  }else{mountBadge();mountMobileDock();updateBadge()}
  if(document.getElementById('portal-auth-button')&&session?.access_token)
   current().then(updateBadge).catch(()=>updateBadge());
  // Public portal: clicking a protected tool while logged out takes the visitor to login.
  if(document.body?.dataset?.cmimProtected!=='1'){
   document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    if(link.target&&link.target!=='_self')return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin||!PROTECTED_PAGES.has(url.pathname.split('/').pop()))return;
    if(!session?.access_token){event.preventDefault();location.assign(url.href);}
   });
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
