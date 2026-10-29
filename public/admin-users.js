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
   req('/rest/v1/cmim_profiles?select=id,nick,tag,lane,secondary_lane,avatar_url,rank_player_id,tier&order=nick.asc&limit=1500'),
   req('/rest/v1/cmim_player_private?select=id,real_name&limit=1500'),
   req('/rest/v1/cmim_role_definitions?select=slug,label,description,permissions&order=label.asc&limit=100'),
   req('/rest/v1/cmim_user_roles?select=user_id,role_slug,assigned_at&limit=3000'),
   req('/rest/v1/cmim_rank?id=eq.1&select=data')
  ]);
  Object.assign(state,{profiles,private:priv,defs,roles,rank:rankRows?.[0]?.data?.players||[],ready:true});render();status(profiles.length+' usuários cadastrados, '+defs.length+' cargos.');
 }catch(e){status('Erro ao carregar usuários: '+e.message,true)}
}
function render(){
 const current=$('manage-user-select').value,users=state.profiles;
 const options='<option value="">Selecione um usuário...</option>'+users.map(p=>'<option value="'+p.id+'">'+esc(p.nick+'#'+p.tag)+'</option>').join('');
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
 $('manage-user-nick').value=u.nick;$('manage-user-tag').value=u.tag;
 $('manage-user-lane').value=u.lane||'MID';
 $('manage-user-secondary').value=u.secondary_lane||'SUP';
 $('manage-user-rank').value=u.rank_player_id||'';
}
function renderAssigned(){
 const selected=$('manage-role-user').value;
 const list=state.roles.filter(r=>r.user_id===selected);
 $('manage-role-list').innerHTML=list.length?list.map(r=>'<span class="cmim-badge" style="display:inline-block;margin:4px">'+esc(state.defs.find(d=>d.slug===r.role_slug)?.label||r.role_slug)+'</span>').join(''):'<span style="color:#b7cdb5">Nenhum cargo extra atribuído.</span>';
}
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
  await req('/rest/v1/cmim_player_private?id=eq.'+id,{method:'PATCH',body:{real_name:$('manage-user-name').value.trim(),updated_at:new Date().toISOString()}});
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
