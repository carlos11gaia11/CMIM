/* Administração CMIM: contas, nick, lane e cargos. */
document.addEventListener('DOMContentLoaded',()=>{
'use strict';
const BASE='https://klpvidxhzofbwstvvxib.supabase.co',KEY='sb_publishable_B5WMdyJBIdYhauVepUIOZw_hnvXs4Xn', $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const state={profiles:[],private:[],defs:[],roles:[],rank:[],ready:false};
const status=(s,bad=false)=>{if(!$('manage-user-status'))return;$('manage-user-status').textContent=s;$('manage-user-status').style.color=bad?'#ffaba6':'#bdebb7'};
const getSession=()=>{try{return JSON.parse(sessionStorage.getItem('cmim_session')||'null')}catch{return null}};
async function req(path,options={}){
 const session=getSession();if(!session?.access_token)throw Error('Entre com sua conta ADM para gerenciar usuários.');
 const r=await fetch(BASE+path,{method:options.method||'GET',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',...(options.body?{Prefer:'return=minimal'}:{})},
  body:options.body?JSON.stringify(options.body):undefined});
 const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}
 if(!r.ok)throw Error(data.message||data.error||data.details||r.status+' Supabase');
 return data;
}
async function fetchData(){
 if($('admin-management-view')?.hidden)return;
 status('Buscando contas e cargos autorizados...');
 try{
  const who=await req('/auth/v1/user');if(who.app_metadata?.cmim_admin!==true)throw Error('Esta conta não tem autorização para gerenciar usuários.');
  const [profiles,priv,defs,roles,rankRows]=await Promise.all([
   req('/rest/v1/cmim_profiles?select=id,nick,tag,lane,secondary_lane,avatar_url,rank_player_id,rank_verified_at,current_elo,initial_tier,tier&order=nick.asc&limit=1500'),
   req('/rest/v1/cmim_player_private?select=id,real_name,phone_e164&limit=1500'),
   req('/rest/v1/cmim_role_definitions?select=slug,label,description,permissions&order=label.asc&limit=100'),
   req('/rest/v1/cmim_user_roles?select=user_id,role_slug,assigned_at&limit=3000'),
   req('/rest/v1/cmim_rank?id=eq.1&select=data')
  ]);
  Object.assign(state,{profiles,private:priv,defs,roles,rank:rankRows?.[0]?.data?.players||[],ready:true});render();status(profiles.length+' usuários cadastrados, '+defs.length+' cargos.');
 }catch(e){status('Erro ao carregar usuários: '+e.message,true)}
}
let selectedRegisteredId=null;
function displayRegistered(){
 const box=$('registered-players-list');if(!box)return;
 const search=String($('registered-players-search')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const tier=$('registered-filter-tier')?.value||'',lane=$('registered-filter-lane')?.value||'',
  elo=$('registered-filter-elo')?.value||'',rank=$('registered-filter-rank')?.value||'';
 const records=state.profiles.filter(p=>{
  const riot=(p.nick+'#'+p.tag).toLocaleLowerCase('pt-BR');
  if(search&&!riot.includes(search))return false;
  if(tier&&(tier==='NONE'?!!p.tier:p.tier!==tier))return false;
  if(lane&&(lane==='NONE'?!!p.lane:p.lane!==lane))return false;
  if(elo&&(elo==='NONE'?!!p.current_elo:p.current_elo!==elo))return false;
  if(rank==='linked'&&!p.rank_player_id)return false;
  if(rank==='unlinked'&&p.rank_player_id)return false;
  return true;
 });
 $('registered-players-count').textContent=state.profiles.length+' contas cadastradas · '+records.length+' exibidas';
 box.innerHTML=records.length?records.map(p=>
  '<button type="button" class="registered-player-row" data-registered-id="'+esc(p.id)+'">'+
  '<span class="registered-player-name">'+esc(p.nick+'#'+p.tag)+'</span>'+
  '<span class="registered-player-detail">'+esc(p.lane||'Sem lane')+(p.secondary_lane?' / '+esc(p.secondary_lane):'')+'</span>'+
  '<span class="registered-player-detail">Elo: '+esc(p.current_elo||'Não informado')+'</span>'+
  '<span class="registered-player-tier">Pré: '+esc(p.initial_tier||'—')+' · Atual: '+esc(p.tier||'—')+'</span>'+
  '<span class="registered-player-detail">'+(p.rank_player_id?'✓ Ranking vinculado':'◷ Sem vínculo')+'</span></button>'
 ).join(''):'<p class="cmim-muted">Nenhum usuário corresponde aos filtros.</p>';
 box.querySelectorAll('[data-registered-id]').forEach(b=>b.addEventListener('click',()=>openRegistered(b.dataset.registeredId)));
}
function openRegistered(id){
 const p=state.profiles.find(x=>x.id===id);if(!p)return;
 selectedRegisteredId=id;
 $('registered-tier-form').hidden=false;
 $('registered-tier-name').textContent='Editar jogador · '+p.nick+'#'+p.tag;
 $('registered-edit-name').value=state.private.find(x=>x.id===p.id)?.real_name||'';
 $('registered-edit-phone').value=state.private.find(x=>x.id===p.id)?.phone_e164||'';
 $('registered-edit-nick').value=p.nick||'';
 $('registered-edit-tag').value=p.tag||'';
 $('registered-edit-lane').value=p.lane||'MID';
 $('registered-edit-secondary').value=p.secondary_lane||((p.lane==='SUP')?'MID':'SUP');
 if($('registered-edit-secondary').value===$('registered-edit-lane').value)$('registered-edit-secondary').value=$('registered-edit-lane').value==='TOP'?'JG':'TOP';
 $('registered-edit-elo').value=p.current_elo||'OURO';
 $('registered-tier-initial').value=p.initial_tier||'Não definido';
 $('registered-tier-current').value=p.tier||p.initial_tier||'D';
 $('registered-edit-avatar').value=p.avatar_url||'';
 $('registered-edit-bio').value=p.bio||'';
 $('registered-edit-rank').innerHTML='<option value="">Sem vínculo ao Ranking</option>'+state.rank.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.nick||r.name||r.id)+'</option>').join('');
 $('registered-edit-rank').value=p.rank_player_id||'';
 $('registered-tier-feedback').textContent='';
 $('registered-tier-form').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function render(){
 const current=$('manage-user-select').value,users=state.profiles;
 displayRegistered();
 const options='<option value="">Selecione um usuário...</option>'+users.map(p=>'<option value="'+p.id+'">'+(p.rank_verified_at?'✓ ':'◷ ')+esc(p.nick+'#'+p.tag)+'</option>').join('');
 $('manage-user-select').innerHTML=options;$('manage-role-user').innerHTML=options;
 if(users.some(x=>x.id===current))$('manage-user-select').value=current;
 $('manage-user-rank').innerHTML='<option value="">Sem vínculo ao Ranking</option>'+state.rank
  .map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nick)+'</option>').join('');
 const currentRole=$('manage-role-select').value;
 $('manage-role-select').innerHTML='<option value="">Selecione o cargo...</option>'+state.defs.map(r=>'<option value="'+esc(r.slug)+'">'+esc(r.label)+'</option>').join('');
 if(state.defs.some(x=>x.slug===currentRole))$('manage-role-select').value=currentRole;
 showUser();renderAssigned();
}
function showUser(){
 const u=state.profiles.find(p=>p.id===$('manage-user-select').value);
 if(!u)return;
 $('manage-user-name').value=state.private.find(p=>p.id===u.id)?.real_name||'';
 $('manage-user-phone').value=state.private.find(p=>p.id===u.id)?.phone_e164||'';
 $('manage-user-nick').value=u.nick;$('manage-user-tag').value=u.tag;
 $('manage-user-lane').value=u.lane||'MID';
 $('manage-user-secondary').value=u.secondary_lane||'SUP';
 $('manage-user-rank').value=u.rank_player_id||'';
 const verified=$('manage-rank-verification');
 if(verified)verified.textContent=u.rank_verified_at?'✓ Vínculo verificado pelo ADM em '+new Date(u.rank_verified_at).toLocaleDateString('pt-BR'):'◷ Sem vínculo verificado ao Ranking.';
}
function renderAssigned(){
 const selected=$('manage-role-user').value;
 const list=state.roles.filter(r=>r.user_id===selected);
 $('manage-role-list').innerHTML=list.length?list.map(r=>'<span class="cmim-badge" style="display:inline-block;margin:4px">'+esc(state.defs.find(d=>d.slug===r.role_slug)?.label||r.role_slug)+'</span>').join(''):'<span style="color:#b7cdb5">Nenhum cargo extra atribuído.</span>';
}
$('registered-players-search')?.addEventListener('input',displayRegistered);
['registered-filter-tier','registered-filter-lane','registered-filter-elo','registered-filter-rank'].forEach(id=>$(id)?.addEventListener('change',displayRegistered));
$('registered-players-refresh')?.addEventListener('click',fetchData);
$('registered-tier-form')?.addEventListener('submit',async event=>{
 event.preventDefault();
 const current=state.profiles.find(p=>p.id===selectedRegisteredId);
 if(!current)return status('Escolha um usuário cadastrado.',true);
 const tier=$('registered-tier-current').value,lane=$('registered-edit-lane').value,secondary=$('registered-edit-secondary').value;
 if(lane===secondary){$('registered-tier-feedback').textContent='As lanes primária e secundária precisam ser diferentes.';return}
 const phoneInput=$('registered-edit-phone').value.trim();
 let phone=null;
 if(phoneInput){
  let digits=phoneInput.replace(/\D/g,'');
  if(digits.startsWith('55')&&(digits.length===12||digits.length===13))digits=digits.slice(2);
  if(!/^[1-9][0-9][0-9]{8,9}$/.test(digits)){$('registered-tier-feedback').textContent='Telefone inválido: informe DDD e 10 ou 11 dígitos.';return}
  phone='+55'+digits;
 }
 const btn=event.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
 $('registered-tier-feedback').textContent='Salvando cadastro...';
 try{
  await req('/rest/v1/rpc/cmim_admin_update_player',{method:'POST',body:{
   p_user:current.id,p_nick:$('registered-edit-nick').value.trim(),p_tag:$('registered-edit-tag').value.trim().toUpperCase(),
   p_lane:lane,p_secondary_lane:secondary,p_current_elo:$('registered-edit-elo').value,p_tier:tier,
   p_bio:$('registered-edit-bio').value.trim(),p_avatar_url:$('registered-edit-avatar').value.trim()||null,
   p_real_name:$('registered-edit-name').value.trim(),p_phone_e164:phone
  }});
  const newRank=$('registered-edit-rank').value||null;
  if((current.rank_player_id||null)!==newRank){
   await req('/rest/v1/rpc/cmim_admin_profile_set',{method:'POST',body:{p_user:current.id,p_rank_player_id:newRank,p_tier:tier}});
  }
  await fetchData();
  $('registered-tier-form').hidden=false;
  openRegistered(current.id);
  $('registered-tier-feedback').textContent='✓ Alterações salvas. Pré-tier original preservado.';
  status('Cadastro de '+$('registered-edit-nick').value.trim()+' atualizado com sucesso.');
 }catch(error){
  $('registered-tier-feedback').textContent='Não foi possível salvar: '+error.message;
  status('Falha ao atualizar jogador: '+error.message,true);
 }finally{btn.disabled=false}
});
document.querySelector('[data-admin-tab="players"]')?.addEventListener('click',fetchData);
$('manage-user-select')?.addEventListener('change',showUser);
$('manage-role-user')?.addEventListener('change',renderAssigned);
$('users-refresh')?.addEventListener('click',fetchData);
$('manage-user-form')?.addEventListener('submit',async e=>{
 e.preventDefault();const id=$('manage-user-select').value,form=e.currentTarget,btn=form.querySelector('button[type=submit]');
 if(!id||!state.profiles.some(p=>p.id===id))return status('Selecione um usuário válido.',true);
 const lane=$('manage-user-lane').value,secondary_lane=$('manage-user-secondary').value;
 if(lane===secondary_lane)return status('As duas lanes precisam ser diferentes.',true);
 btn.disabled=true;
 try{
  await req('/rest/v1/cmim_profiles?id=eq.'+id,{method:'PATCH',body:{nick:$('manage-user-nick').value.trim(),tag:$('manage-user-tag').value.trim().toUpperCase(),
   lane,secondary_lane,updated_at:new Date().toISOString()}});
  await req('/rest/v1/cmim_player_private?id=eq.'+id,{method:'PATCH',body:{real_name:$('manage-user-name').value.trim(),
   phone_e164:(()=>{
     let digits=$('manage-user-phone').value.replace(/[^0-9]/g,'');
     if(!digits)return null;
     if(digits.startsWith('55')&&(digits.length===12||digits.length===13))digits=digits.slice(2);
     if(!/^[1-9][0-9][0-9]{8,9}$/.test(digits))throw Error('Telefone: informe DDD e 10 ou 11 dígitos.');
     return '+55'+digits;
   })(),
   updated_at:new Date().toISOString()}});
  const currentRank=state.profiles.find(p=>p.id===id);
  if((currentRank?.rank_player_id||'')!==$('manage-user-rank').value){
   await req('/rest/v1/rpc/cmim_admin_profile_set',{method:'POST',body:{
     p_user:id,p_rank_player_id:$('manage-user-rank').value||null,p_tier:currentRank?.tier||null
   }});
  }
  status('✓ Usuário atualizado com sucesso.');await fetchData();$('manage-user-select').value=id;showUser();
 }catch(err){status('Falha: '+err.message,true)}finally{btn.disabled=false}
});
$('manage-role-create')?.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,fd=new FormData(form),btn=form.querySelector('button');btn.disabled=true;
 const permissions=[...new Set(String(fd.get('permissions')||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^[a-z_-]{2,25}$/.test(x)))].slice(0,20);
 try{
  await req('/rest/v1/cmim_role_definitions',{method:'POST',body:{slug:fd.get('slug'),label:fd.get('label'),description:fd.get('description')||'',permissions}});
  form.reset();await fetchData();status('✓ Cargo criado. Você já pode atribuí-lo aos usuários.');
 }catch(err){status('Erro ao criar cargo: '+err.message,true)}finally{btn.disabled=false}
});
$('manage-user-role')?.addEventListener('submit',async e=>{
 e.preventDefault();const uid=$('manage-role-user').value,role=$('manage-role-select').value,btn=e.currentTarget.querySelector('button[type=submit]');
 if(!uid||!role)return status('Selecione um jogador e um cargo.',true);
 btn.disabled=true;
 try{
  const me=await req('/auth/v1/user');
  await req('/rest/v1/cmim_user_roles',{method:'POST',body:{user_id:uid,role_slug:role,granted_by:me.id}});
  await fetchData();$('manage-role-user').value=uid;renderAssigned();status('✓ Cargo atribuído.');
 }catch(e){status('Não foi possível atribuir: '+e.message,true)}finally{btn.disabled=false}
});
$('manage-role-remove')?.addEventListener('click',async()=>{
 const uid=$('manage-role-user').value,role=$('manage-role-select').value;
 if(!uid||!role)return status('Escolha usuário e cargo para remover.',true);
 if(!confirm('Remover '+role+' deste usuário?'))return;
 try{await req('/rest/v1/cmim_user_roles?user_id=eq.'+uid+'&role_slug=eq.'+encodeURIComponent(role),{method:'DELETE'});
  await fetchData();$('manage-role-user').value=uid;renderAssigned();status('Cargo removido.')}
 catch(e){status('Erro ao remover: '+e.message,true)}
});
document.querySelector('[data-admin-tab="users"]')?.addEventListener('click',fetchData);
const adminView=$('admin-management-view');
if(adminView){new MutationObserver(()=>{if(!adminView.hidden&&document.querySelector('[data-admin-tab="users"]')?.classList.contains('current'))fetchData()}).observe(adminView,{attributes:true,attributeFilter:['hidden']})}
if(new URLSearchParams(location.search).get('tab')==='users')setTimeout(fetchData,900);
});
