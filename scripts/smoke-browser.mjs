import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base='http://127.0.0.1:4173/CMIM/';
const player={id:'11111111-1111-4111-8111-111111111111',user_metadata:{nick:'Teste CMIM'},app_metadata:{cmim_admin:false}};
const admin={...player,app_metadata:{cmim_admin:true}};
const session=user=>({access_token:'mock-access',refresh_token:'mock-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--no-sandbox']});
const errors=[];
async function contextFor(user=null){
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin==='http://127.0.0.1:4173')return route.continue();
  if(!u.hostname.endsWith('.supabase.co'))return route.abort();
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'*','content-type':'application/json'};
  let data=[],status=200;
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(u.pathname==='/auth/v1/user'){data=user||{message:'No session'};status=user?200:401}
  else if(u.pathname.startsWith('/auth/v1/token'))data=session(user||player);
  else if(u.pathname.includes('/rest/v1/cmim_rank'))data=[{data:{players:[],seasons:[],events:[]},version:1}];
  else if(u.pathname==='/auth/v1/logout')data={};
  return route.fulfill({status,headers,body:JSON.stringify(data)});
 });
 if(user)await context.addInitScript(({user,session})=>{if(!sessionStorage.getItem('smoke-seeded')){localStorage.setItem('cmim_player_session',JSON.stringify(session));sessionStorage.setItem('smoke-seeded','1')}},{user,session:session(user)});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(page.url()+': '+e.message));
 return {context,page};
}
async function open(page,path='',status='guest'){
 await page.goto(base+path,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(s=>document.body.dataset.authState===s,status,{timeout:15000});
}
try{
 const {context,page}=await contextFor();
 for(const path of ['', 'ligas.html','equipes.html','meu-time.html','agenda.html','fila.html','regulamento.html','regulamento-open.html','aulas.html','comp-maker.html','ranking.html','inhouse.html','draft.html','relatorios.html','pontuacao.html']){
  await open(page,path);await page.locator('.cmim-unified-nav').waitFor({state:'attached'});
  assert.equal(await page.locator('.cmim-unified-nav').count(),1,path+' duplicate header');
  assert.equal(await page.locator('#portal-auth-button').textContent(),'Entrar',path+' guest label');
  const logo=page.locator('.cmim-nav-brand img');await logo.evaluate(img=>img.decode());assert.equal(await logo.evaluate(img=>img.naturalWidth),256,path+' logo');
  if(path==='ranking.html')assert.equal(await page.locator('#authButton').count(),1);
  if(path==='comp-maker.html')assert.equal(await page.locator('#slotsBlue').count(),1);
  if(['ranking.html','meu-time.html','draft.html','relatorios.html','pontuacao.html'].includes(path))assert.equal(await page.locator('#cmim-login-wall').isVisible(),true,path+' login gate');
  console.log('PASS guest/navigation',path||'home');
 }
 await open(page);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('#cmim-nav-links').isVisible(),false);
 await page.locator('.cmim-nav-toggle').click();assert.equal(await page.locator('#cmim-nav-links').isVisible(),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#cmim-nav-links').isVisible(),false);
 console.log('PASS mobile open/close');await context.close();
 const signed=await contextFor(player);
 await open(signed.page,'','authenticated');
 assert.match(await signed.page.locator('#portal-auth-button').textContent(),/Teste CMIM/);
 assert.equal(await signed.page.locator('.cmim-admin-link').first().isVisible(),false);
 await open(signed.page,'ligas.html','authenticated');
 assert.match(await signed.page.locator('#portal-auth-button').getAttribute('href'),/perfil\.html/);
 await signed.page.evaluate(()=>window.CMIMAuth.logout());
 assert.equal(await signed.page.locator('#portal-auth-button').textContent(),'Entrar');
 console.log('PASS player session and logout');await signed.context.close();
 const privileged=await contextFor(admin);await open(privileged.page,'','authenticated');
 await privileged.page.locator('.cmim-nav-more summary').click();
 assert.equal(await privileged.page.locator('.cmim-admin-link').first().isVisible(),true);
 console.log('PASS admin role in navigation');await privileged.context.close();
 const recovery=await browser.newContext();let requestRedirect=null,changed=null,verified=false;const requests=[];
 await recovery.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin==='http://127.0.0.1:4173')return route.continue();if(!u.hostname.endsWith('.supabase.co'))return route.abort();
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'*','content-type':'application/json'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  let data=[],status=200;const authorization=req.headers().authorization;
  if(u.pathname==='/auth/v1/recover'){requestRedirect=u.searchParams.get('redirect_to');requests.push(req.postDataJSON());data={};}
  else if(u.pathname==='/auth/v1/user'){if(authorization!=='Bearer recovery-only'){status=401;data={message:'invalid token'}}else if(req.method()==='PUT'){changed=req.postDataJSON();data={id:'recovery-account',email:'test@example.com'}}else{verified=true;data={id:'recovery-account',email:'test@example.com'}}}
  else if(u.pathname==='/auth/v1/logout')data={};
  return route.fulfill({status,headers,body:JSON.stringify(data)});
 });
 const rp=await recovery.newPage();rp.on('pageerror',e=>errors.push(rp.url()+': '+e.message));
 await rp.goto(base+'conta.html');await rp.locator('#reset-password').click();await rp.locator('#request-reset-form [name=email]').fill('test@example.com');await rp.locator('#request-reset-form button[type=submit],#request-reset-form button.cmim-button').first().click();await rp.waitForFunction(()=>document.querySelector('#request-reset-status').textContent.includes('Se houver'));
 assert.equal(requestRedirect,'https://carlos11gaia11.github.io/CMIM/conta.html?confirmed=1');assert.equal(requests[0].email,'test@example.com');
 await rp.goto(base+'conta.html?confirmed=1#access_token=recovery-only&refresh_token=mock&type=recovery&expires_in=3600');await rp.locator('#new-password-form').waitFor();assert.equal(verified,true);assert.equal(new URL(rp.url()).hash,'');assert.equal(await rp.evaluate(()=>localStorage.getItem('cmim_player_session')),null);
 await rp.locator('#new-password-form [name=password]').fill('TestPassword123!');await rp.locator('#new-password-form [name=confirm]').fill('Different123!');await rp.locator('#new-password-form button').click();assert.match(await rp.locator('#new-password-status').textContent(),/não coincidem/);assert.equal(changed,null);
 await rp.locator('#new-password-form [name=confirm]').fill('TestPassword123!');await rp.locator('#new-password-form button').click();await rp.locator('#return-login').waitFor();assert.equal(changed.password,'TestPassword123!');assert.match(await rp.locator('#new-password-status').textContent(),/Senha alterada com sucesso/);
 await rp.goto(base+'conta.html#type=recovery&error=access_denied&error_description=expired');await rp.waitForFunction(()=>document.querySelector('#new-password-status').textContent.includes('expirado'));assert.equal(await rp.locator('#new-password-form').isVisible(),false);
 console.log('PASS password recovery redirect, token validation, mismatch, update and expired link');await recovery.close();
 const invited=await browser.newContext({viewport:{width:1440,height:900}});const inviteId='22222222-2222-4222-8222-222222222222',teamId='33333333-3333-4333-8333-333333333333';let pending=true,joined=false,brokenStats=false,submitted=false;
 await invited.addInitScript(({user,session})=>{if(!sessionStorage.getItem('smoke-seeded')){localStorage.setItem('cmim_player_session',JSON.stringify(session));sessionStorage.setItem('smoke-seeded','1')}},{user:player,session:session(player)});
 await invited.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin==='http://127.0.0.1:4173')return route.continue();if(!u.hostname.endsWith('.supabase.co'))return route.abort();
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'*','content-type':'application/json'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});let data=[],status=200;
  if(u.pathname==='/auth/v1/user')data=player;
  else if(u.pathname==='/rest/v1/cmim_profiles')data=[{id:player.id,nick:'Teste',tag:'BR1',lane:'MID',secondary_lane:'TOP',avatar_url:base+'assets/branding/cmim-main.webp'}];
  else if(u.pathname==='/rest/v1/cmim_player_private')data=[{real_name:'Teste CMIM',phone_e164:null}];
  else if(u.pathname==='/rest/v1/cmim_squads')data=[{id:teamId,name:'Equipe Teste',short_name:'TST',owner_id:'other',captain_lane:'TOP'}];
  else if(u.pathname==='/rest/v1/cmim_squad_members')data=joined?[{team_id:teamId,user_id:player.id,lane:'MID',starter:true}]:[];
  else if(u.pathname==='/rest/v1/cmim_squad_invites')data=pending?[{id:inviteId,team_id:teamId,lane:'MID',sender_id:'other'}]:[];
  else if(u.pathname==='/rest/v1/rpc/cmim_answer_invite'){assert.equal(req.postDataJSON().p_invite,inviteId);assert.equal(req.postDataJSON().p_accept,true);submitted=true;pending=false;joined=true;data='accepted';}
  else if(u.pathname==='/rest/v1/cmim_rank'){if(brokenStats){status=503;data={message:'unavailable'}}else data=[{data:{players:[],seasons:[],events:[]},version:1}];}
  return route.fulfill({status,headers,body:JSON.stringify(data)});
 });
 const ip=await invited.newPage();ip.on('pageerror',e=>errors.push(ip.url()+': '+e.message));
 await open(ip,'perfil.html','authenticated');await ip.locator('#profile-content').waitFor();assert.equal(await ip.locator('#player-handle').textContent(),'Teste#BR1');assert.equal(await ip.locator('#account-signout').count(),1);
 await ip.locator('#cmim-invite-count').waitFor();assert.equal(await ip.locator('#cmim-invite-count').textContent(),'1');
 brokenStats=true;await open(ip,'perfil.html','authenticated');await ip.locator('#profile-content').waitFor();await ip.locator('#profile-retry').waitFor();assert.match(await ip.locator('#profile-stats-source').textContent(),/indisponíveis/);
 await ip.setViewportSize({width:390,height:844});assert.equal(await ip.locator('#cmim-invite-link').isVisible(),true);assert.equal(await ip.locator('#cmim-my-team-link').isVisible(),false);
 await ip.locator('#cmim-invite-link').click();await ip.locator('#my-invites [data-accept="true"]').waitFor();assert.match(await ip.locator('#my-invites').textContent(),/Equipe Teste/);
 await ip.locator('#my-invites [data-accept="true"]').click();await ip.waitForFunction(()=>document.querySelector('#my-invites').textContent.includes('Nenhum convite pendente'));assert.equal(submitted,true);
 await ip.waitForFunction(()=>document.querySelector('#cmim-invite-count').hidden);await ip.waitForFunction(()=>!document.querySelector('#cmim-my-team-link').hidden);
 console.log('PASS profile loading, partial statistics failure, mobile invite notification and acceptance');await invited.close();
 assert.deepEqual(errors,[],'Uncaught browser errors');console.log('All browser smoke checks passed.');
}finally{await browser.close()}
