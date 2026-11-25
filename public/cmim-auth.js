/* Auth de jogadores CMIM. Sessões armazenadas no browser; Supabase gerencia senhas e confirmação. */
(()=>{'use strict';
 const BASE='https://klpvidxhzofbwstvvxib.supabase.co',KEY='sb_publishable_B5WMdyJBIdYhauVepUIOZw_hnvXs4Xn';
 const STORAGE='cmim_player_session',LANES=['TOP','JG','MID','ADC','SUP'];
 // Confirmations must return to the published CMIM site, never to Supabase's localhost default.
 const EMAIL_CONFIRM_REDIRECT='https://carlos11gaia11.github.io/CMIM/conta.html?confirmed=1';
 let session=null,loginInFlight=null,verifyInFlight=null,verifiedUser=null,verifiedAt=0,authStatus='checking',generation=0;
 function readStored(){try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{return null}}
 session=readStored();
 if(!session){try{session=JSON.parse(sessionStorage.getItem('cmim_session')||'null');if(session?.access_token)localStorage.setItem(STORAGE,JSON.stringify(session))}catch{}}
 try{sessionStorage.removeItem('cmim_session')}catch{}
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 function notify(){document.body?.setAttribute('data-auth-state',authStatus);document.dispatchEvent(new CustomEvent('cmim-auth-changed',{detail:{loggedIn:authStatus==='authenticated',status:authStatus}}));updateBadge()}
 function save(data,{preserve=false}={}){generation++;session=data||null;if(!preserve||!data||!verifiedUser||data.user?.id!==verifiedUser.id){verifiedUser=null;verifiedAt=0;authStatus=data?'checking':'guest';}try{if(data)localStorage.setItem(STORAGE,JSON.stringify(data));else localStorage.removeItem(STORAGE);sessionStorage.removeItem('cmim_session')}catch{}notify()}
 async function call(path,{method='GET',body,secure=false,headers={}}={}){
  const active=secure?await current():null;
  if(secure&&!active?.access_token)throw Error('Sessão indisponível. Entre novamente ou tente reconectar.');
  const res=await fetch(BASE+path,{method,cache:'no-store',headers:{apikey:KEY,...(secure?{Authorization:'Bearer '+active.access_token}:{}),...(body instanceof Blob?{}:{'Content-Type':'application/json'}),...headers},body:body instanceof Blob?body:body!==undefined?JSON.stringify(body):undefined});
  const raw=await res.text();let payload={};try{payload=JSON.parse(raw)}catch{payload={message:raw.slice(0,120)}}
  if(!res.ok){const error=Error(payload.msg||payload.error_description||payload.message||payload.error||payload.details||'Erro do Supabase ('+res.status+')');error.status=res.status;throw error}
  return payload;
 }
 async function current(){
  if(!session?.access_token)return null;
  if((session.expires_at||0)>Date.now()/1000+90)return session;
  if(loginInFlight)return loginInFlight;
  const original=session,epoch=generation;
  const renew=async()=>{
   if(epoch!==generation)return session;
   const latest=readStored();
   if(latest?.access_token&&latest.refresh_token!==original.refresh_token){save(latest,{preserve:true});return (latest.expires_at||0)>Date.now()/1000+90?latest:null}
   try{
    const fresh=await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:original.refresh_token}});
    if(epoch===generation)save(fresh,{preserve:true});return session;
   }catch(e){
    if(epoch===generation){
     const latest=readStored();
     if(latest?.refresh_token&&latest.refresh_token!==original.refresh_token){save(latest,{preserve:true});return (latest.expires_at||0)>Date.now()/1000+90?latest:null}
     if([400,401,403].includes(e.status))save(null);else{authStatus='offline';notify()}
    }
    return null;
   }
  };
  loginInFlight=(navigator.locks?.request?navigator.locks.request('cmim-auth-refresh',renew):renew()).finally(()=>{loginInFlight=null});
  return loginInFlight;
 }
 async function user({force=false}={}){
  if(!force&&authStatus==='authenticated'&&verifiedUser&&Date.now()-verifiedAt<30000&&(session?.expires_at||0)>Date.now()/1000+90)return verifiedUser;
  if(verifyInFlight?.epoch===generation)return verifyInFlight.promise;
  const slot={epoch:generation};
  slot.promise=(async()=>{
   const active=await current();
   if(!active){if(!session){authStatus='guest';notify()}return null}
   const epoch=generation;slot.epoch=epoch;
   try{
    const who=await call('/auth/v1/user',{secure:true});
    if(epoch!==generation)return null;
    if(!who?.id){save(null);return null}
    verifiedUser=who;verifiedAt=Date.now();authStatus='authenticated';notify();return who;
   }catch(e){
    if(epoch===generation){if([401,403].includes(e.status))save(null);else{authStatus='offline';notify()}}
    return null;
   }
  })().finally(()=>{if(verifyInFlight===slot)verifyInFlight=null});
  verifyInFlight=slot;return slot.promise;
 }
 async function signIn(email,password){
  const data=await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  save(data);if(!await user({force:true}))throw Error(authStatus==='offline'?'Login recebido, mas não foi possível verificar a sessão. Tente reconectar.':'Não foi possível validar o login.');
  return data;
 }
 function normalizePhone(value){
 let digits=String(value||'').replace(/[^0-9]/g,'');
 if(digits.startsWith('55')&&(digits.length===12||digits.length===13))digits=digits.slice(2);
 if(!/^[1-9][0-9][0-9]{8,9}$/.test(digits))throw Error('Informe telefone com DDD e 10 ou 11 dígitos.');
 return '+55'+digits;
}
async function signUp(values){
  const nickTag=String(values.riot_id||'').trim().match(/^([^#]{2,32})#([A-Za-z0-9](?:[A-Za-z0-9 ]{1,4})[A-Za-z0-9])$/u);
  if(!nickTag)throw Error('Use um nick com # e tag de 3 a 6 caracteres. No CMIM, espaços internos são aceitos. Ex.: Gaia#BR1 ou Gaia#L 9.');
  if(!LANES.includes(values.lane)||!LANES.includes(values.secondary_lane)||values.lane===values.secondary_lane)
   throw Error('Escolha duas lanes diferentes.');
  if(String(values.password||'').length<8)throw Error('A senha precisa de pelo menos 8 caracteres.');
  if(String(values.real_name||'').trim().length<2)throw Error('Informe seu nome.');
  const out=await call('/auth/v1/signup?redirect_to='+encodeURIComponent(EMAIL_CONFIRM_REDIRECT),{method:'POST',body:{
   email:String(values.email).trim().toLowerCase(),password:values.password,
   data:{nick:nickTag[1].trim(),tag:nickTag[2].toUpperCase(),real_name:String(values.real_name).trim().slice(0,90),
     lane:values.lane,secondary_lane:values.secondary_lane,current_elo:values.current_elo,phone_e164:normalizePhone(values.phone)}
  }});
  if(out.access_token)save(out);
  return out;
 }
 async function logout(){
  const token=session?.access_token;save(null);
  try{if(token)await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token}})}catch{}
 }
 function profileLink(){return './perfil.html'}
 async function squareImage(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Escolha JPG, PNG ou WebP de até 10 MB.');
  const url=URL.createObjectURL(file);
  try{
   const img=new Image();img.src=url;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
   const ctx=canvas.getContext('2d'),side=Math.min(img.naturalWidth,img.naturalHeight);
   ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,512,512);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.9));
   if(!blob)throw Error('Não foi possível processar a imagem.');
   return new File([blob],'image.webp',{type:'image/webp'});
  }finally{URL.revokeObjectURL(url)}
 }
 async function uploadTeamLogo(file){
  const who=await user();if(!who)throw Error('Entre na sua conta.');
  const image=await squareImage(file),path=who.id+'/'+crypto.randomUUID()+'.webp';
  const res=await fetch(BASE+'/storage/v1/object/cmim-team-logos/'+path,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+(await current()).access_token,'Content-Type':image.type},body:image});
  const info=await res.json().catch(()=>({}));if(!res.ok)throw Error(info.message||info.error||'Falha ao enviar logo.');
  return BASE+'/storage/v1/object/public/cmim-team-logos/'+path;
 }
 async function uploadAvatar(file){
  const who=await user();if(!who)throw Error('Entre na sua conta antes de enviar sua foto.');
  file=await squareImage(file);
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
 const PROTECTED_PAGES=new Set(['draft.html','ranking.html','selecao.html','relatorios.html','pontuacao.html','perfil.html']);
 const RETURN_PAGES=new Set([...PROTECTED_PAGES,'ligas.html','campeonatos.html','equipes.html','fila.html','agenda.html','admin.html','admin-fila.html','meu-time.html','campeonato.html','admin-campeonatos.html','admin-central.html','notificacoes.html']);
 function safeReturn(raw){
  if(!raw||typeof raw!=='string'||raw.length>1500)return null;
  try{
   const target=new URL(raw,location.href);
   const root=location.pathname.replace(/[^/]*$/,'');
   const page=target.pathname.split('/').pop();
   if(target.origin!==location.origin||!target.pathname.startsWith(root)||!RETURN_PAGES.has(page))return null;
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
 // A tela permanece legível mesmo quando o usuário não está autenticado.
 // O bloqueio visual não substitui as permissões do banco (RLS).
 function showLoginGate(checking=false){
  if(!document.body)return;
  document.documentElement.classList.remove('cmim-auth-pending');
  document.body.classList.add('cmim-auth-locked');
  document.body.classList.toggle('cmim-login-checking',checking);
  let wall=document.getElementById('cmim-login-wall');
  if(!wall){
    wall=document.createElement('section');
    wall.id='cmim-login-wall';wall.className='cmim-login-wall';
    wall.setAttribute('role','dialog');wall.setAttribute('aria-modal','true');
    wall.setAttribute('aria-labelledby','cmim-login-wall-title');
    wall.innerHTML='<div class="cmim-login-wall-panel">'+
      '<img src="./assets/branding/cmim-main.webp" alt="Emblema oficial CMIM" class="cmim-login-wall-logo">'+
      '<div class="cmim-login-wall-eyebrow">ÁREA RESERVADA A JOGADORES</div>'+
      '<h2 id="cmim-login-wall-title">ENTRE NA SUA <span style="color:#ffe16a">CONTA CMIM.</span></h2>'+
      '<p id="cmim-login-wall-description">Para utilizar esta ferramenta, entre com a sua conta ou cadastre-se. Você poderá retornar a esta página após a autenticação.</p>'+
      '<div class="cmim-login-wall-actions"><button type="button" id="cmim-login-wall-cta">ENTRAR / CRIAR CONTA →</button><a href="./">VOLTAR AO PORTAL</a></div>'+
      '<small class="cmim-login-wall-hint">Seu cadastro é gratuito. O sistema mantém seus dados protegidos.</small></div>';
    document.body.append(wall);
    wall.querySelector('#cmim-login-wall-cta').addEventListener('click',()=>gotoLogin());
  }
  wall.querySelector('#cmim-login-wall-description').textContent=checking?
    'Verificando sua sessão com segurança…':'Você precisa estar logado para acessar esta área. Faça login ou crie sua conta para continuar de onde parou.';
  wall.querySelector('#cmim-login-wall-cta').disabled=checking;
 }
 function hideLoginGate(){
  document.documentElement.classList.remove('cmim-auth-pending');
  document.body?.classList.remove('cmim-auth-locked','cmim-login-checking');
  document.getElementById('cmim-login-wall')?.remove();
 }
 async function requireLogin(){
  if(document.body?.dataset?.cmimProtected!=='1'){hideLoginGate();return true;}
  showLoginGate(true);
  try{
   const verified=await user();
   if(!verified?.id){showLoginGate(false);if(authStatus==='offline'){document.getElementById('cmim-login-wall-description').textContent='Não foi possível verificar a sessão. Sua sessão foi preservada; recarregue para tentar novamente.';}return false;}
   hideLoginGate();
   document.dispatchEvent(new Event('cmim-auth-ready'));
   return true;
  }catch{
   showLoginGate(false);return false;
  }
 }

 function badgeMarkup(){return '<div class="cmim-auth-bar" id="cmim-auth-badge"><a href="./conta.html" title="Conta CMIM">◌ Entrar / Cadastrar</a></div>'}
 let teamCheck=null,teamCheckId=null,hasTeam=false;
 async function refreshMyTeam(force=false){
  const link=document.getElementById('cmim-my-team-link');if(!link)return;
  const id=authStatus==='authenticated'?verifiedUser?.id:null;
  if(!id){link.hidden=true;teamCheckId=null;hasTeam=false;return}
  if(!force&&teamCheckId===id){link.hidden=!hasTeam;return}
  if(teamCheck===id&&!force)return;teamCheck=id;
  try{const rows=await call('/rest/v1/cmim_squad_members?user_id=eq.'+encodeURIComponent(id)+'&select=team_id&limit=1',{secure:true});
   if(verifiedUser?.id===id&&authStatus==='authenticated'){teamCheckId=id;hasTeam=Array.isArray(rows)&&rows.length>0;link.hidden=!hasTeam;document.querySelectorAll('.cmim-team-entry').forEach(x=>x.textContent=hasTeam?'Meus convites':'Criar time / Convites')}
  }catch{if(teamCheckId!==id)link.hidden=true}finally{if(teamCheck===id)teamCheck=null}
 }
 let inviteInfo={id:null,count:0,signature:'',status:'idle'},inviteRequest=null;
 function renderInviteIndicator(){
  const link=document.getElementById('cmim-invite-link'),counter=document.getElementById('cmim-invite-count');
  if(!link||!counter)return;
  link.hidden=authStatus!=='authenticated';
  const count=inviteInfo.id===verifiedUser?.id?inviteInfo.count:0;
  counter.hidden=!count;counter.textContent=count>99?'99+':String(count);
  link.setAttribute('aria-label',count?count+' convite(s) de equipe pendente(s)':'Convites de equipe');
  link.title=count?'Você tem '+count+' convite(s) de equipe':inviteInfo.status==='error'?'Não foi possível consultar os convites. Clique para verificar.':'Convites de equipe';
 }
 async function refreshInvites(force=false){
  const id=authStatus==='authenticated'?verifiedUser?.id:null;
  if(!id){inviteInfo={id:null,count:0,signature:'',status:'idle'};renderInviteIndicator();return inviteInfo}
  if(inviteRequest?.id===id)return inviteRequest.promise;
  if(!force&&inviteInfo.id===id&&inviteInfo.status==='ready')return inviteInfo;
  const req={id};
  req.promise=(async()=>{
   try{
    const rows=await call('/rest/v1/cmim_squad_invites?recipient_id=eq.'+encodeURIComponent(id)+'&status=eq.pending&select=id&limit=1000',{secure:true});
    if(!Array.isArray(rows))throw Error('Convites indisponíveis');
    if(verifiedUser?.id!==id||authStatus!=='authenticated')return inviteInfo;
    const signature=rows.map(r=>r.id).sort().join(','),changed=inviteInfo.id!==id||signature!==inviteInfo.signature||inviteInfo.status!=='ready';
    inviteInfo={id,count:rows.length,signature,status:'ready'};
    renderInviteIndicator();
    if(changed)document.dispatchEvent(new CustomEvent('cmim-invites-changed',{detail:{count:rows.length}}));
   }catch{if(verifiedUser?.id===id&&authStatus==='authenticated'){inviteInfo={id,count:inviteInfo.id===id?inviteInfo.count:0,signature:inviteInfo.id===id?inviteInfo.signature:'',status:'error'};renderInviteIndicator()}}
   finally{if(inviteRequest===req)inviteRequest=null}
   return inviteInfo;
  })();
  inviteRequest=req;return req.promise;
 }
 function updateBadge(){
  const authenticated=authStatus==='authenticated';
  void refreshMyTeam();
  renderInviteIndicator();
  if(document.getElementById('cmim-invite-link'))void refreshInvites();
  document.querySelectorAll('.cmim-admin-link').forEach(el=>el.hidden=!(authenticated&&verifiedUser?.app_metadata?.cmim_admin===true));
  const name=verifiedUser?.user_metadata?.nick||'Meu perfil';
  // On the homepage login belongs in the prominent header CTA, not in the bottom corner.
  const header=document.getElementById('portal-auth-button');
  if(header){
   header.href=authenticated?'./perfil.html':'./conta.html';
   header.textContent=authenticated?name+' · Meu perfil':authStatus==='checking'?'Verificando…':authStatus==='offline'?'Reconectar':'Entrar';
   header.setAttribute('aria-label',authenticated?'Abrir meu perfil CMIM':'Entrar no CMIM ou criar conta');
  }
  const account=document.getElementById('cmim-account-menu');if(account)account.hidden=!authenticated;
  const el=document.getElementById('cmim-auth-badge');
  if(!el)return;
  if(authenticated)el.innerHTML='<a href="./perfil.html">◉ '+esc(name)+' · Perfil</a>';
  else el.innerHTML='<a href="./conta.html">'+(authStatus==='checking'?'Verificando…':authStatus==='offline'?'Reconectar':'Entrar / Cadastrar')+'</a>';
 }
 function mountBadge(){if(document.querySelector('.cmim-unified-nav')||document.getElementById('cmim-auth-badge')||document.body?.dataset?.noAuthBadge==='1')return;
  document.body.insertAdjacentHTML('beforeend',badgeMarkup());updateBadge();
  if(session?.access_token)current().then(updateBadge);
 }
 function mountNavigation(){
  if(document.querySelector('.cmim-unified-nav')||document.body?.classList.contains('admin-page')||(document.getElementById('root')&&location.pathname.endsWith('selecao.html')))return;
  const here=location.pathname.split('/').pop()||'index.html';
  const old=document.querySelector('body > header')||(here==='comp-maker.html'?document.querySelector('header.topbar'):null);if(!old)return;
  const nav=document.createElement('header');nav.className='cmim-unified-nav';nav.dataset.cmimUnified='1';
  const primary=[['Início','./','index.html'],['In-House','./inhouse.html','inhouse.html'],['Campeonatos','./ligas.html','ligas.html'],['Equipes','./equipes.html','equipes.html'],['Calendário','./agenda.html','agenda.html']];
  const more=[['Entrar em sala pronta','./draft.html?jogar=1'],['Ranking','./ranking.html'],['Relatórios','./relatorios.html'],['Pontuação','./pontuacao.html'],['Draft','./draft.html'],['Seleção de campeões','./selecao.html'],['Regulamento','./regulamento.html'],['Comp Maker','./comp-maker.html'],['Aulas','./aulas.html'],['CMIM News','./#news'],['Jogadores','./jogadores.html'],['Histórico','./historico.html'],['Comunidade','./#redes']];
  nav.innerHTML='<div class="cmim-nav-inner"><a class="cmim-nav-brand" href="./"><img src="./assets/branding/cmim-main.webp?v=20261125-logo" alt="" width="48" height="48"><span>CMIM<small>COMPETITIVE CIRCUIT</small></span></a><button type="button" class="cmim-nav-toggle" aria-expanded="false" aria-controls="cmim-nav-links" aria-label="Abrir menu">☰</button><nav id="cmim-nav-links" aria-label="Menu principal">'+primary.map(([name,href,page])=>'<a href="'+href+'"'+((here===page||(page==='ligas.html'&&['liga.html','campeonato.html'].includes(here))||(page==='equipes.html'&&['equipe.html','jogadores.html'].includes(here))||(page==='agenda.html'&&here==='partida.html'))?' aria-current="page"':'')+'>'+name+'</a>').join('')+'<a id="cmim-my-team-link" href="./meu-time.html" hidden'+(here==='meu-time.html'?' aria-current="page"':'')+'>Meu Time</a><details class="cmim-nav-more"><summary>Mais <span aria-hidden="true">⌄</span></summary><div>'+[['IN-HOUSE',[0,1,2,3,6]],['FERRAMENTAS',[4,5,7]],['CIRCUITO',[10,11]],['COMUNIDADE',[8,9,12]]].map(([label,items])=>'<div class="cmim-menu-group"><span>'+label+'</span>'+items.map(i=>{const [name,href]=more[i];return '<a href="'+href+'">'+name+'</a>'}).join('')+'</div>').join('')+'<a class="cmim-team-entry" href="./meu-time.html">Criar time / Convites</a><a class="cmim-admin-link" href="./admin-central.html" hidden>Central administrativa</a><a class="cmim-admin-link" href="./admin.html" hidden>Jogadores e resultados</a><a class="cmim-admin-link" href="./admin-campeonatos.html" hidden>Gestão de campeonatos</a><a class="cmim-admin-link" id="adminLink" href="./admin-fila.html" hidden>Gestão de filas</a></div></details><a class="cmim-nav-play" href="./fila.html">Jogar</a><a class="cmim-nav-account" id="portal-auth-button" href="./conta.html">Verificando…</a><details class="cmim-account-menu" id="cmim-account-menu" hidden><summary aria-label="Opções da conta">⌄</summary><div><a href="./perfil.html">Meu perfil</a><a href="./meu-time.html">Meu Time e convites</a><a href="./notificacoes.html">Central de notificações</a><a href="./meu-time.html#minhas-inscricoes">Minhas inscrições</a><a href="./meu-time.html#reagendamentos">Minhas partidas</a><button type="button" id="cmim-menu-logout">Sair da conta</button></div></details></nav><a class="cmim-invite-link" id="cmim-invite-link" href="./meu-time.html#convites" hidden aria-label="Convites de equipe"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span id="cmim-invite-count" hidden>0</span></a></div>';
  if(['ranking.html','comp-maker.html','admin-fila.html'].includes(here)){old.before(nav);old.classList.add('cmim-local-header');}
  else{
   const localLinks=[...old.querySelectorAll('nav a[href^="#"]')];
   if(['ligas.html','regulamento.html'].includes(here)&&localLinks.length){const local=document.createElement('nav');local.className='cmim-local-links';local.setAttribute('aria-label','Nesta página');localLinks.forEach(a=>local.append(a.cloneNode(true)));old.replaceWith(nav,local)}else old.replaceWith(nav);
  }
  nav.querySelector('#cmim-menu-logout')?.addEventListener('click',async()=>{await logout();location.assign('./conta.html')});
  const toggle=nav.querySelector('.cmim-nav-toggle');toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open)};
  nav.addEventListener('keydown',e=>{if(e.key==='Escape'){nav.querySelectorAll('details').forEach(d=>d.open=false);nav.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');toggle.focus()}});
  document.addEventListener('click',e=>{if(!nav.contains(e.target)){nav.querySelectorAll('details').forEach(d=>d.open=false);nav.classList.remove('is-open');toggle.setAttribute('aria-expanded','false')}});
  document.getElementById('cmim-auth-badge')?.remove();
  document.getElementById('cmim-mobile-dock')?.remove();
  updateBadge();
 }
 function mountMobileDock(){mountNavigation()}
 window.CMIMAuth={BASE,KEY,EMAIL_CONFIRM_REDIRECT,LANES,call,current,user,signIn,signUp,normalizePhone,logout,uploadAvatar,uploadTeamLogo,squareImage,esc,session:()=>session,authState:()=>({status:authStatus,user:verifiedUser}),save,requireLogin,gotoLogin,requestedDestination,refreshInvites,inviteState:()=>({...inviteInfo})};
 function initialize(){
  const css=document.createElement('link');css.rel='stylesheet';css.href='./cmim-unified.css?v=20261125-pro3';document.head.append(css);mountNavigation();
  document.documentElement.classList.remove('cmim-auth-pending');
  if(document.body?.dataset?.cmimProtected==='1'){
   mountMobileDock();
   void requireLogin().then(ok=>{if(ok){mountBadge();updateBadge()}});
  }else{mountBadge();mountMobileDock();updateBadge()}
  void user().then(updateBadge);
  document.addEventListener('cmim-team-changed',()=>void refreshMyTeam(true));
  document.addEventListener('cmim-invite-answered',()=>void refreshInvites(true));
  window.addEventListener('focus',()=>void refreshInvites(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshInvites(true)});
  setInterval(()=>{if(!document.hidden&&authStatus==='authenticated')void refreshInvites(true)},30000);
  window.addEventListener('storage',e=>{if(e.key!==STORAGE)return;const before=verifiedUser?.id||session?.user?.id;const next=readStored();if(!next||before!==next.user?.id){location.reload();return}generation++;session=next;verifiedAt=0;authStatus='checking';notify();void user({force:true})});
  window.addEventListener('online',()=>{if(authStatus==='offline'){if(document.body?.dataset?.cmimProtected==='1')void requireLogin();else void user({force:true})}});
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
