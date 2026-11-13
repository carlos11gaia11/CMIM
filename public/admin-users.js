/* Administração CMIM: contas, nick, lane e cargos. */
document.addEventListener('DOMContentLoaded',()=>{
'use strict';
const BASE='https://klpvidxhzofbwstvvxib.supabase.co',KEY='sb_publishable_B5WMdyJBIdYhauVepUIOZw_hnvXs4Xn', $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const state={profiles:[],private:[],defs:[],roles:[],rank:[],ready:false};
const rankCollator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true,ignorePunctuation:true});
const rankText=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const rankLabel=r=>String(r.nick||r.name||r.id||'Jogador sem nick');
// Carrega todos os jogadores do histórico, mesmo os fora da temporada atual.
function fillRankSelector(kind,selectedValue='',profileId=null){
 const select=$(kind==='registered'?'registered-edit-rank':'manage-user-rank');
 const search=$(kind==='registered'?'registered-rank-search':'manage-rank-search');
 const counter=$(kind==='registered'?'registered-rank-count':'manage-rank-count');
 if(!select)return;
 const sorted=[...state.rank].sort((a,b)=>rankCollator.compare(rankLabel(a),rankLabel(b))||rankCollator.compare(String(a.id),String(b.id)));
 const query=rankText(search?.value);
 const matches=sorted.filter(p=>!query||rankText(rankLabel(p)).includes(query));
 const selected=String(selectedValue||'');
 const pinned=selected&&!matches.some(p=>p.id===selected)?sorted.find(p=>p.id===selected):null;
 const shown=pinned?[pinned,...matches]:matches;
 const linked=new Map(state.profiles.filter(p=>p.rank_player_id).map(p=>[p.rank_player_id,p]));
 select.innerHTML='<option value="">Sem vínculo ao Ranking</option>'+shown.map(p=>{
   const owner=linked.get(p.id),mine=owner?.id===profileId;
   const label=rankLabel(p)+(owner?(mine?' · vínculo atual':' · já vinculado a '+owner.nick+'#'+owner.tag):'');
   return '<option value="'+esc(p.id)+'"'+(owner&&!mine?' disabled':'')+'>'+esc(label)+'</option>';
 }).join('');
 select.value=selected;
 if(select.value!==selected)select.value='';
 if(counter){
   const linkedCount=sorted.filter(p=>linked.has(p.id)).length;
   counter.textContent=matches.length+' de '+sorted.length+' jogadores do ranking exibidos · '+linkedCount+' vinculados';
   if(pinned)counter.textContent+=' · vínculo atual mantido fora da busca';
 }
}
const status=(s,bad=false)=>{const node=$('manage-user-status');if(node){node.textContent=s;node.style.color=bad?'#ffaba6':'#bdebb7'}};
function notice(message,bad=false){
 let node=$('cmim-user-save-toast');
 if(!node){node=document.createElement('div');node.id='cmim-user-save-toast';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.appendChild(node);}
 Object.assign(node.style,{position:'fixed',right:'24px',bottom:'24px',zIndex:'99999',maxWidth:'min(440px,calc(100vw - 32px))',padding:'16px 20px',borderRadius:'12px',border:'1px solid '+(bad?'#e47c75':'#71b885'),background:bad?'#401d23':'#173c2a',color:'#fff',boxShadow:'0 12px 32px #0008',fontWeight:'700',transition:'opacity .25s,transform .25s',opacity:'1',transform:'translateY(0)'});
 node.textContent=(bad?'✕ ':'✓ ')+message;
 clearTimeout(notice.timer);notice.timer=setTimeout(()=>{node.style.opacity='0';node.style.transform='translateY(12px)';},5600);
}
function explainInvalid(event,feedbackId){
 const input=event.target;
 const label=input.closest('label')?.firstChild?.textContent?.trim()||'Campo obrigatório';
 const message='Verifique "'+label+'": '+(input.validationMessage||'valor não aceito')+'.';
 const feedback=$(feedbackId);if(feedback){feedback.textContent=message;feedback.style.color='#ffaba6';}
 notice(message,true);
}
function saving(button,on){if(!button)return;if(on){button.dataset.originalLabel=button.textContent;button.disabled=true;button.textContent='◌ SALVANDO...';button.setAttribute('aria-busy','true')}else{button.disabled=false;button.textContent=button.dataset.originalLabel||'SALVAR ALTERAÇÕES';button.removeAttribute('aria-busy')}};
const getSession=()=>{try{return JSON.parse(sessionStorage.getItem('cmim_session')||'null')}catch{return null}};
async function req(path,options={}){
 const session=getSession();if(!session?.access_token)throw Error('Entre com sua conta ADM para gerenciar usuários.');
 const r=await fetch(BASE+path,{method:options.method||'GET',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',...(options.body?{Prefer:'return=minimal'}:{})},
  body:options.body?JSON.stringify(options.body):undefined});
 const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}
 if(!r.ok)throw Error(data.message||data.error||data.details||r.status+' Supabase');
 return data;
}
async function fetchData({throwOnError=false}={}){
 if($('admin-management-view')?.hidden)return;
 status('Buscando contas e cargos autorizados...');
 try{
  const who=await req('/auth/v1/user');if(who.app_metadata?.cmim_admin!==true)throw Error('Esta conta não tem autorização para gerenciar usuários.');
  const [profiles,priv,defs,roles,rankRows]=await Promise.all([
   req('/rest/v1/cmim_profiles?select=id,nick,tag,lane,secondary_lane,avatar_url,bio,rank_player_id,rank_verified_at,current_elo,initial_tier,tier&order=nick.asc&limit=1500'),
   req('/rest/v1/cmim_player_private?select=id,real_name,phone_e164&limit=1500'),
   req('/rest/v1/cmim_role_definitions?select=slug,label,description,permissions&order=label.asc&limit=100'),
   req('/rest/v1/cmim_user_roles?select=user_id,role_slug,assigned_at&limit=3000'),
   req('/rest/v1/cmim_rank?id=eq.1&select=data')
  ]);
  const allRankPlayers=rankRows?.[0]?.data?.players;
  if(!Array.isArray(allRankPlayers))throw Error('Não foi possível carregar a lista completa de jogadores do Ranking oficial.');
  Object.assign(state,{profiles,private:priv,defs,roles,rank:allRankPlayers,ready:true});render();if(selectedRegisteredId&&profiles.some(p=>p.id===selectedRegisteredId))openRegistered(selectedRegisteredId);status(profiles.length+' usuários cadastrados, '+defs.length+' cargos.');
 }catch(e){status('Erro ao carregar usuários: '+e.message,true);if(throwOnError)throw e}
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
 $('registered-edit-elo').value=p.current_elo||'';
 $('registered-tier-initial').value=p.initial_tier||'Não definido';
 $('registered-tier-current').value=p.tier||'';
 $('registered-edit-avatar').value=p.avatar_url||'';
 $('registered-edit-bio').value=p.bio||'';
 $('registered-rank-search').value='';
 fillRankSelector('registered',p.rank_player_id||'',p.id);
 $('registered-tier-feedback').textContent='Dados atuais carregados do cadastro. Edite e clique em salvar.';
 $('registered-tier-form').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function render(){
 const current=$('manage-user-select').value,users=state.profiles;
 displayRegistered();
 const options='<option value="">Selecione um usuário...</option>'+users.map(p=>'<option value="'+p.id+'">'+(p.rank_verified_at?'✓ ':'◷ ')+esc(p.nick+'#'+p.tag)+'</option>').join('');
 $('manage-user-select').innerHTML=options;$('manage-role-user').innerHTML=options;
 if(users.some(x=>x.id===current))$('manage-user-select').value=current;
 fillRankSelector('manage','',null);
 const currentRole=$('manage-role-select').value;
 $('manage-role-select').innerHTML='<option value="">Selecione o cargo...</option>'+state.defs.map(r=>'<option value="'+esc(r.slug)+'">'+esc(r.label)+'</option>').join('');
 if(state.defs.some(x=>x.slug===currentRole))$('manage-role-select').value=currentRole;
 showUser();renderAssigned();
}
function showUser(){
 const u=state.profiles.find(p=>p.id===$('manage-user-select').value);
 if(!u){const v=$('manage-rank-verification');if(v)v.textContent='Selecione um usuário para carregar os dados atuais.';return;}
 $('manage-user-name').value=state.private.find(p=>p.id===u.id)?.real_name||'';
 $('manage-user-phone').value=state.private.find(p=>p.id===u.id)?.phone_e164||'';
 $('manage-user-nick').value=u.nick;$('manage-user-tag').value=u.tag;
 $('manage-user-lane').value=u.lane||'MID';
 $('manage-user-secondary').value=u.secondary_lane||((u.lane==='SUP')?'MID':'SUP');
 $('manage-rank-search').value='';
 fillRankSelector('manage',u.rank_player_id||'',u.id);
 const verified=$('manage-rank-verification');
 if(verified)verified.textContent=u.rank_verified_at?'✓ Vínculo verificado pelo ADM em '+new Date(u.rank_verified_at).toLocaleDateString('pt-BR'):'◷ Sem vínculo verificado ao Ranking.';
}
function renderAssigned(){
 const selected=$('manage-role-user').value;
 const list=state.roles.filter(r=>r.user_id===selected);
 $('manage-role-list').innerHTML=list.length?list.map(r=>'<span class="cmim-badge" style="display:inline-block;margin:4px">'+esc(state.defs.find(d=>d.slug===r.role_slug)?.label||r.role_slug)+'</span>').join(''):'<span style="color:#b7cdb5">Nenhum cargo extra atribuído.</span>';
}
$('registered-tier-form')?.addEventListener('invalid',event=>explainInvalid(event,'registered-tier-feedback'),true);
$('manage-user-form')?.addEventListener('invalid',event=>explainInvalid(event,'manage-user-status'),true);
$('registered-players-search')?.addEventListener('input',displayRegistered);
['registered-filter-tier','registered-filter-lane','registered-filter-elo','registered-filter-rank'].forEach(id=>$(id)?.addEventListener('change',displayRegistered));
$('registered-players-refresh')?.addEventListener('click',fetchData);
$('registered-riot-sync')?.addEventListener('click', async event => {
 const button = event.currentTarget;
 const feedback = $('registered-riot-sync-status');
 if (!confirm('Consultar a API oficial da Riot e atualizar o elo e o tier atual dos perfis encontrados? O pré-tier será mantido e jogadores sem Solo/Duo não serão alterados.')) return;
 const session = getSession();
 if (!session?.access_token) { status('Entre com a conta ADM primeiro.',true); return; }
 saving(button,true);
 if (feedback) feedback.textContent='Consultando Riot IDs e elos Solo/Duo...';
 try {
  const response=await fetch(BASE+'/functions/v1/cmim-riot-tiers',{
   method:'POST', cache:'no-store',
   headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
   body:JSON.stringify({apply:true})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||data.message||'Riot/Supabase: HTTP '+response.status);
  await fetchData({throwOnError:true});
  const missing=Array.isArray(data.notFound)?data.notFound:[];
  const unranked=Array.isArray(data.noSolo)?data.noSolo:[];
  if(feedback) feedback.textContent='Riot: '+(data.rankedSolo||0)+' com Solo/Duo encontrado(s), '+(data.changed||0)+' tier(s) atualizado(s). '
   +missing.length+' Riot ID(s) não localizados, '+unranked.length+' sem Solo/Duo no BR1.'
   +(missing.length?' IDs não encontrados: '+missing.join(', ')+'.':'');
  notice('Sincronização Riot concluída. '+(data.changed||0)+' perfil(is) atualizado(s).');
 }catch(error){
  if(feedback)feedback.textContent='Sincronização não concluída: '+error.message;
  notice('Falha na sincronização Riot: '+error.message,true);
 }finally{saving(button,false)}
});
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
 const btn=event.currentTarget.querySelector('button[type="submit"]');saving(btn,true);
 const expected={nick:$('registered-edit-nick').value.trim(),tag:$('registered-edit-tag').value.trim().toUpperCase(),
  lane,secondary_lane:secondary,current_elo:$('registered-edit-elo').value||null,tier:tier||null,
  rank_player_id:$('registered-edit-rank').value||null};
 $('registered-tier-feedback').style.color='#c5f5c4';
 $('registered-tier-feedback').textContent='Salvando cadastro...';
 try{
  await req('/rest/v1/rpc/cmim_admin_update_player',{method:'POST',body:{
   p_user:current.id,p_nick:$('registered-edit-nick').value.trim(),p_tag:$('registered-edit-tag').value.trim().toUpperCase(),
   p_lane:lane,p_secondary_lane:secondary,p_current_elo:$('registered-edit-elo').value,p_tier:tier||null,
   p_bio:$('registered-edit-bio').value.trim(),p_avatar_url:$('registered-edit-avatar').value.trim()||null,
   p_real_name:$('registered-edit-name').value.trim(),p_phone_e164:phone
  }});
  const newRank=$('registered-edit-rank').value||null;
  if((current.rank_player_id||null)!==newRank){
   await req('/rest/v1/rpc/cmim_admin_profile_set',{method:'POST',body:{p_user:current.id,p_rank_player_id:newRank,p_tier:tier||null}});
  }
  await fetchData({throwOnError:true});
  const saved=state.profiles.find(p=>p.id===current.id);
  if(!saved||Object.entries(expected).some(([key,value])=>(saved[key]??null)!==value))
   throw Error('O servidor não confirmou todos os dados alterados. Atualize o cadastro e confira o resultado.');
  $('registered-tier-form').hidden=false;
  openRegistered(current.id);
  $('registered-tier-feedback').textContent='✓ Alterações salvas com sucesso. Pré-tier original preservado.';
  notice('Cadastro atualizado e confirmado pelo servidor.');
  status('Cadastro de '+$('registered-edit-nick').value.trim()+' atualizado com sucesso.');
 }catch(error){
  $('registered-tier-feedback').style.color='#ffaba6';
  $('registered-tier-feedback').textContent='Não foi possível confirmar o salvamento: '+error.message;
  status('Falha ao atualizar jogador: '+error.message,true);notice('Não foi possível salvar: '+error.message,true);
 }finally{saving(btn,false)}
});
document.querySelector('[data-admin-tab="players"]')?.addEventListener('click',fetchData);
$('registered-rank-search')?.addEventListener('input',()=>{
  const p=state.profiles.find(x=>x.id===selectedRegisteredId);
  fillRankSelector('registered',$('registered-edit-rank').value,p?.id||null);
});
$('manage-rank-search')?.addEventListener('input',()=>{
  const p=state.profiles.find(x=>x.id===$('manage-user-select').value);
  fillRankSelector('manage',$('manage-user-rank').value,p?.id||null);
});
for(const id of ['registered-rank-search','manage-rank-search']){
 $(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault()});
}
$('manage-user-select')?.addEventListener('change',showUser);
$('manage-role-user')?.addEventListener('change',renderAssigned);
$('users-refresh')?.addEventListener('click',fetchData);
$('manage-user-form')?.addEventListener('submit',async e=>{
 e.preventDefault();const id=$('manage-user-select').value,form=e.currentTarget,btn=form.querySelector('button[type=submit]');
 if(!id||!state.profiles.some(p=>p.id===id))return status('Selecione um usuário válido.',true);
 const lane=$('manage-user-lane').value,secondary_lane=$('manage-user-secondary').value;
 if(lane===secondary_lane)return status('As duas lanes precisam ser diferentes.',true);
 saving(btn,true);
 try{
  const currentRank=state.profiles.find(p=>p.id===id);
  const expected={nick:$('manage-user-nick').value.trim(),tag:$('manage-user-tag').value.trim().toUpperCase(),
   lane,secondary_lane,rank_player_id:$('manage-user-rank').value||null};
  const phoneE164=(()=>{
    let digits=$('manage-user-phone').value.replace(/[^0-9]/g,'');
    if(!digits)return null;
    if(digits.startsWith('55')&&(digits.length===12||digits.length===13))digits=digits.slice(2);
    if(!/^[1-9][0-9][0-9]{8,9}$/.test(digits))throw Error('Telefone: informe DDD e 10 ou 11 dígitos.');
    return '+55'+digits;
  })();
  await req('/rest/v1/rpc/cmim_admin_update_player',{method:'POST',body:{
   p_user:id,p_nick:$('manage-user-nick').value.trim(),p_tag:$('manage-user-tag').value.trim().toUpperCase(),
   p_lane:lane,p_secondary_lane:secondary_lane,p_current_elo:currentRank?.current_elo||null,p_tier:currentRank?.tier||null,
   p_bio:currentRank?.bio||'',p_avatar_url:currentRank?.avatar_url||null,
   p_real_name:$('manage-user-name').value.trim(),p_phone_e164:phoneE164
  }});
  if((currentRank?.rank_player_id||'')!==$('manage-user-rank').value){
   await req('/rest/v1/rpc/cmim_admin_profile_set',{method:'POST',body:{
     p_user:id,p_rank_player_id:$('manage-user-rank').value||null,p_tier:currentRank?.tier||null
   }});
  }
  await fetchData({throwOnError:true});
  const saved=state.profiles.find(p=>p.id===id);
  if(!saved||Object.entries(expected).some(([key,value])=>(saved[key]??null)!==value))
    throw Error('O servidor não confirmou todos os dados alterados. Reabra o cadastro para conferir.');
  $('manage-user-select').value=id;showUser();
  status('✓ Usuário atualizado com sucesso.');notice('Usuário atualizado e confirmado pelo servidor.');
 }catch(err){status('Falha: '+err.message,true);notice('Falha ao salvar usuário: '+err.message,true)}finally{saving(btn,false)}
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
