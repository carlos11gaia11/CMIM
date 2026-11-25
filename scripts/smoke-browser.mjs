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
 const circuit=await browser.newContext({viewport:{width:1440,height:900}});
 const teams=Array.from({length:17},(_,i)=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i+1).padStart(12,'0'),name:'Equipe '+String(i+1).padStart(2,'0'),short_name:'T'+i,owner_id:player.id,logo_url:'https://example.org/logo.png'}));
 const scheduled=[{id:'event-1',title:'Treino de teste',type:'Treino',status:'scheduled',starts_at:'2026-12-01T02:00:00Z'},{id:'event-2',title:'Partida a definir',type:'MD3',status:'scheduled',starts_at:null,match_id:'match-1'}];
 await circuit.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:4173')return route.continue();if(!u.hostname.endsWith('.supabase.co'))return route.abort();
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};let data=[];
 if(u.pathname.endsWith('/cmim_squads'))data=teams;
 if(u.pathname.endsWith('/cmim_portal_events'))data=scheduled;
 if(u.pathname.endsWith('/cmim_profiles'))data=[{id:player.id,nick:'TitularTeste',tag:'BR1',avatar_url:'https://example.org/player.png'},{id:'reserve',nick:'ReservaTeste',tag:'BR1',avatar_url:'https://example.org/player.png'}];
 if(u.pathname.endsWith('/cmim_squad_members'))data=[{team_id:teams[0].id,user_id:player.id,lane:'MID',starter:true},{team_id:teams[0].id,user_id:'reserve',lane:'MID',starter:false}];
 return route.fulfill({status:200,headers,body:JSON.stringify(data)});
 });
 const cp=await circuit.newPage();cp.on('pageerror',e=>errors.push(cp.url()+': '+e.message));
 await open(cp,'equipes.html');await cp.locator('.team-tile').first().waitFor();assert.equal(await cp.locator('.team-tile').count(),16);assert.equal(await cp.locator('.team-tile p,.team-tile .team-score,.team-tile .team-meta').count(),0);assert.equal(await cp.locator('#team-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);
 await cp.locator('#team-next').click();assert.equal(await cp.locator('.team-tile').count(),1);await cp.locator('#team-prev').click();await cp.locator('.team-tile').first().click();await cp.locator('.cmim-roster-group').first().waitFor();assert.equal(await cp.locator('.cmim-roster-group').count(),2);assert.match(await cp.locator('.cmim-roster-group').first().textContent(),/TitularTeste/);assert.match(await cp.locator('.cmim-roster-group').last().textContent(),/ReservaTeste/);
 await open(cp,'agenda.html');await cp.locator('[data-day]').first().waitFor();assert.match(await cp.locator('#calendar-undated').textContent(),/Partida a definir/);
 const currentMonth=await cp.locator('#calendar-month').textContent();await cp.locator('#calendar-next').click();assert.notEqual(await cp.locator('#calendar-month').textContent(),currentMonth);await cp.locator('#calendar-prev').click();assert.equal(await cp.locator('#calendar-month').textContent(),currentMonth);
 for(let i=0;i<24&&!(await cp.locator('[data-day="2026-11-30"]').count());i++){const year=await cp.locator('[data-day]').first().getAttribute('data-day');await cp.locator(year>'2026-11-30'?'#calendar-prev':'#calendar-next').click();}
 await cp.locator('[data-day="2026-11-30"]').click();assert.match(await cp.locator('#agenda-events').textContent(),/Treino de teste/);await cp.locator('#calendar-all').click();assert.match(await cp.locator('#calendar-list-title').textContent(),/mês/);
 console.log('PASS calendar month/day and Brasília timezone, 4x4 team catalog and roster groups');await circuit.close();
 const captainContext=await browser.newContext({viewport:{width:1440,height:900}});
 await captainContext.addInitScript(({session})=>{localStorage.setItem('cmim_player_session',JSON.stringify(session))},{session:session(player)});
 let formationChanged=false;
 await captainContext.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin==='http://127.0.0.1:4173')return route.continue();if(!u.hostname.endsWith('.supabase.co'))return route.abort();
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'*','content-type':'application/json'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});let data=[];
  if(u.pathname==='/auth/v1/user')data=player;
  else if(u.pathname.endsWith('/cmim_squads'))data=[{id:teams[0].id,name:'Equipe Teste',short_name:'TST',owner_id:player.id,logo_url:'https://example.org/logo.png'}];
  else if(u.pathname.endsWith('/cmim_profiles'))data=[{id:player.id,nick:'Capitão',tag:'BR1',avatar_url:'https://example.org/player.png'},{id:'reserve',nick:'Reserva',tag:'BR1',avatar_url:'https://example.org/reserve.png'},{id:'available',nick:'Disponível',tag:'BR1'}];
  else if(u.pathname.endsWith('/cmim_squad_members'))data=[{team_id:teams[0].id,user_id:player.id,lane:'MID',starter:!formationChanged},{team_id:teams[0].id,user_id:'reserve',lane:'MID',starter:formationChanged}];
  else if(u.pathname.endsWith('/rpc/cmim_set_starter')){assert.equal(req.postDataJSON().p_player,'reserve');formationChanged=true;data=true;}
  return route.fulfill({status:200,headers,body:JSON.stringify(data)});
 });
 const tp=await captainContext.newPage();tp.on('pageerror',e=>errors.push(tp.url()+': '+e.message));await open(tp,'meu-time.html','authenticated');await tp.locator('.mt-dashboard').waitFor();assert.equal(await tp.locator('.mt-roster').first().locator('.mt-player').count(),5);assert.equal(await tp.locator('.mt-vacant').count(),4);assert.equal(await tp.locator('.mt-roster').last().locator('.mt-player').count(),1);assert.equal(await tp.locator('[data-invite-team]').isVisible(),true);assert.equal(await tp.locator('[data-logo-team]').isVisible(),false);
 await tp.locator('.mt-tool').last().locator('summary').click();assert.equal(await tp.locator('[data-logo-team]').isVisible(),true);
 tp.on('dialog',d=>d.accept());await tp.locator('[data-starter-player="reserve"]').click();await tp.waitForFunction(()=>document.querySelector('.mt-roster').textContent.includes('Reserva'));
 await tp.setViewportSize({width:390,height:844});assert.equal(await tp.locator('.mt-player-grid').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);assert.ok(await tp.locator('.mt-dashboard').evaluate(el=>el.scrollWidth<=el.clientWidth+2));
 console.log('PASS captain dashboard: five lanes, reserves, role change, collapsible logo and mobile layout');await captainContext.close();
 const tournamentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gameId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',entryId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const event={id:tournamentId,title:'CMIM Open Teste',status:'open',league_tier:'open',structure:'liga_mata_mata',series_games:1,max_teams:16,registration_fee_cents:7500,starts_at:'2027-01-08T22:00:00Z',closes_at:'2027-01-03T23:59:00Z',description:'Regulamento de teste'};
 const fixtureTeams=teams.slice(0,2),fixtureMembers=[{team_id:fixtureTeams[0].id,user_id:player.id,lane:'MID',starter:true}];
 const fixtureGame={id:gameId,competition_id:tournamentId,round_number:1,match_number:1,team_a_id:fixtureTeams[0].id,team_b_id:fixtureTeams[1].id,status:'scheduled',scheduled_at:'2027-01-08T22:00:00Z'};
 const fixtureEntries=[{id:entryId,competition_id:tournamentId,team_id:fixtureTeams[0].id,status:'pending'},{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',competition_id:tournamentId,team_id:fixtureTeams[1].id,status:'approved'}];
 async function circuitContext(who){const ctx=await browser.newContext();if(who)await ctx.addInitScript(({session})=>{localStorage.setItem('cmim_player_session',JSON.stringify(session))},{session:session(who)});
 await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin==='http://127.0.0.1:4173')return route.continue();if(!u.hostname.endsWith('.supabase.co'))return route.abort();const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'*','content-type':'application/json'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});let data=[];
 if(u.pathname==='/auth/v1/user')data=who||{};
 else if(u.pathname.endsWith('/cmim_competitions'))data=[event];
 else if(u.pathname.endsWith('/cmim_squads'))data=fixtureTeams;
 else if(u.pathname.endsWith('/cmim_squad_members'))data=fixtureMembers;
 else if(u.pathname.endsWith('/cmim_profiles'))data=[{id:player.id,nick:'Jogador Teste',tag:'BR1',lane:'MID'}];
 else if(u.pathname.endsWith('/cmim_competition_matches'))data=[fixtureGame];
 else if(u.pathname.endsWith('/cmim_competition_entries'))data=who?fixtureEntries:fixtureEntries.filter(e=>e.status==='approved');
 else if(u.pathname.endsWith('/cmim_entry_reviews'))data=who?[{entry_id:entryId,payment_status:'pending',review_state:'corrections',staff_note:'Atualize a foto'}]:[];
 return route.fulfill({status:200,headers,body:JSON.stringify(data)});});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(p.url()+': '+e.message));return{ctx,p}}
 const guestCircuit=await circuitContext(null),gp=guestCircuit.p;
 await open(gp,'campeonato.html?id='+tournamentId);await gp.locator('#cv-champ-tabs').waitFor();assert.match(await gp.locator('#cv-champ-hero').textContent(),/CMIM Open Teste/);
 await gp.locator('#cv-champ-tabs a[href="#equipes"]').click();await gp.locator('.cv-team').waitFor();assert.equal(await gp.locator('.cv-team').count(),1);
 await gp.locator('#cv-champ-tabs a[href="#classificacao"]').click();await gp.locator('#cv-champ-content table').first().waitFor();
 await gp.locator('#cv-champ-tabs a[href="#playoffs"]').click();await gp.waitForFunction(()=>document.querySelector('#cv-champ-content').textContent.includes('Quartas'));
 await gp.locator('#cv-champ-tabs a[href="#partidas"]').click();await gp.locator('.cv-game').click();await gp.locator('.cv-versus').waitFor();assert.match(await gp.locator('.cv-versus').textContent(),/VS/);
 await open(gp,'jogadores.html');await gp.locator('.cv-player').waitFor();assert.match(await gp.locator('.cv-player').textContent(),/Jogador Teste/);
 await gp.locator('#cv-search').fill('não existe');assert.equal(await gp.locator('.cv-player').count(),0);
 await open(gp,'historico.html');await gp.locator('#cv-year').waitFor();
 await open(gp,'ligas.html');assert.equal(await gp.locator('#competition-admin').count(),0);await guestCircuit.ctx.close();
 const adminCircuit=await circuitContext(admin),ap=adminCircuit.p;await open(ap,'admin-campeonatos.html','authenticated');await ap.locator('[data-review-entry]').waitFor();assert.equal(await ap.locator('[data-entry-status="approved"]').count(),1);assert.equal(await ap.locator('[name="staff_note"]').inputValue(),'Atualize a foto');await adminCircuit.ctx.close();
 const playerCircuit=await circuitContext(player),pp=playerCircuit.p;await open(pp,'meu-time.html#minhas-inscricoes','authenticated');await pp.locator('#my-entries .cv-review-note').first().waitFor();assert.match(await pp.locator('#my-entries').textContent(),/Atualize a foto/);await open(pp,'admin-campeonatos.html','authenticated');await pp.waitForFunction(()=>document.querySelector('#cv-admin-denied').textContent.includes('exclusiva'));assert.equal(await pp.locator('#competition-admin').isVisible(),false);await playerCircuit.ctx.close();
 console.log('PASS circuit pages, official approved teams, matches, admin review and captain feedback');
 assert.deepEqual(errors,[],'Uncaught browser errors');console.log('All browser smoke checks passed.');
}finally{await browser.close()}
