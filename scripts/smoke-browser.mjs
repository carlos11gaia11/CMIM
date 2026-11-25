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
 assert.deepEqual(errors,[],'Uncaught browser errors');console.log('All browser smoke checks passed.');
}finally{await browser.close()}
