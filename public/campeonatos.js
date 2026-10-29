/* Campeonatos do CMIM: competições, times, convites, inscrições e rodadas ADM. */
document.addEventListener('DOMContentLoaded',async()=>{
'use strict';
const a=window.CMIMAuth,$=id=>document.getElementById(id),esc=a.esc;
const txt=x=>String(x??'');
const state={me:null,admin:false,comps:[],entries:[],squads:[],members:[],profiles:[],matches:[],invites:[],selected:null};
const safeErr=e=>txt(e?.message||e);
const status=(message,bad=false)=>{const node=$('champ-status');node.textContent=message;node.className='cmim-status'+(bad?' error':'');};
const label=s=>({copa:'Copa / Mata-mata',liga:'Liga / Pontos corridos',suico:'Suíço',draft:'Rascunho',open:'Inscrições abertas',closed:'Inscrições encerradas',live:'Em andamento',finished:'Finalizado',pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',scheduled:'Agendado'}[s]||s);
const team=id=>state.squads.find(x=>x.id===id);
const competition=id=>state.comps.find(x=>x.id===id);
const formatDate=x=>x?new Date(x).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
const readable=id=>esc(team(id)?.name||'A definir');
const own=()=>state.squads.filter(t=>t.owner_id===state.me?.id);
const membersFor=id=>state.members.filter(x=>x.team_id===id);
async function read(){
 const [comps,squads,members,profiles,matches,entries]=await Promise.all([
 a.call('/rest/v1/cmim_competitions?select=*&order=created_at.desc&limit=100'),
 a.call('/rest/v1/cmim_squads?select=id,name,short_name,owner_id,captain_lane&limit=500'),
 a.call('/rest/v1/cmim_squad_members?select=team_id,user_id,lane&limit=2000'),
 a.call('/rest/v1/cmim_profiles?select=id,nick,tag,lane,secondary_lane,avatar_url,rank_player_id,rank_verified_at&limit=2500'),
 a.call('/rest/v1/cmim_competition_matches?select=*&order=round_number.asc,match_number.asc&limit=3000'),
 a.call('/rest/v1/cmim_competition_entries?select=id,competition_id,team_id,status,created_at&limit=2000')
 ]);
 Object.assign(state,{comps,squads,members,profiles,matches,entries});
 if(state.me){
  try{state.invites=await a.call('/rest/v1/cmim_squad_invites?recipient_id=eq.'+state.me.id+'&status=eq.pending&select=id,team_id,lane,sender_id')}catch{state.invites=[]}
 }
 render();
}
function render(){
 $('create-squad').hidden=!state.me;
 if(!state.me)$('my-teams').innerHTML='<div class="cmim-empty">Entre em sua <a href="./conta.html">conta CMIM</a> para criar um time e se inscrever.</div>';
 else $('my-teams').innerHTML=own().length?own().map(t=>{
  const members=membersFor(t.id);
  const canInvite=members.length<5;
  return '<article class="cmim-cup" style="margin-bottom:10px"><h3>'+esc(t.name)+'</h3><small>'+members.length+'/5 jogadores · '+esc(t.short_name||'')+'</small>'+
  '<div style="font-size:12px;margin:10px 0">'+members.map(m=>{
   const pl=state.profiles.find(p=>p.id===m.user_id);
   return '<span class="cmim-badge">'+esc(pl?pl.nick+'#'+pl.tag:'Jogador')+' · '+esc(m.lane)+'</span>'
  }).join('')+'</div>'+
  (canInvite?'<form data-invite-team="'+t.id+'" class="cmim-form-row"><label class="cmim-field">CONVIDAR JOGADOR<select name="recipient" required><option value="">Escolher jogador</option>'+
  state.profiles.filter(p=>!members.some(m=>m.user_id===p.id)).map(p=>'<option value="'+p.id+'">'+esc(p.nick+'#'+p.tag)+'</option>').join('')+'</select></label>'+
  '<label class="cmim-field">POSIÇÃO<select name="lane">'+['TOP','JG','MID','ADC','SUP'].map(l=>'<option>'+l+'</option>').join('')+'</select></label><button class="cmim-button ghost">Enviar convite</button></form>':'<p class="cmim-badge">✓ TIME COMPLETO</p>')+
  '</article>';
 }).join(''):'<p class="cmim-muted">Você ainda não lidera um time. Crie seu primeiro elenco abaixo.</p>';
 document.querySelectorAll('[data-invite-team]').forEach(form=>form.onsubmit=async e=>{
  e.preventDefault();const f=new FormData(form),button=form.querySelector('button');button.disabled=true;
  try{await a.call('/rest/v1/rpc/cmim_invite_player',{method:'POST',secure:true,body:{p_team:form.dataset.inviteTeam,p_recipient:f.get('recipient'),p_lane:f.get('lane')}});status('✓ Convite enviado! O jogador verá o convite após entrar.')}
  catch(err){status('Erro no convite: '+safeErr(err),true)}finally{button.disabled=false}
 });
 $('my-invites').innerHTML=state.me?(state.invites.length?state.invites.map(i=>'<div class="cmim-cup" style="margin:8px 0"><b>'+readable(i.team_id)+'</b><p>Convite para '+esc(i.lane)+'</p>'+
   '<button class="cmim-button" data-invite-id="'+i.id+'" data-accept="true">Aceitar</button> <button class="cmim-button ghost" data-invite-id="'+i.id+'" data-accept="false">Recusar</button></div>').join(''):'<p class="cmim-muted">Nenhum convite pendente.</p>'):'<div class="cmim-empty">Entre para consultar seus convites.</div>';
 document.querySelectorAll('[data-invite-id]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;try{await a.call('/rest/v1/rpc/cmim_answer_invite',{method:'POST',secure:true,body:{p_invite:b.dataset.inviteId,p_accept:b.dataset.accept==='true'}});status('Convite respondido.');await read()}catch(e){status(safeErr(e),true)}finally{b.disabled=false}
 });
 $('competition-list').innerHTML=state.comps.length?state.comps.map(c=>{
  const count=state.entries.filter(e=>e.competition_id===c.id&&e.status!=='rejected').length;
  const buttons=c.status==='open'&&state.me?'<button class="cmim-button" data-register="'+c.id+'">INSCREVER MEU TIME →</button>':'';
  return '<article class="cmim-cup"><span class="cmim-kicker">'+esc(label(c.structure))+' · MD'+Number(c.series_games||3)+'</span><h3>'+esc(c.title)+'</h3><p class="cmim-muted">'+esc(c.description||'Confira o regulamento do evento.')+'</p>'+
  '<div><span class="cmim-badge">'+esc(label(c.status))+'</span><span class="cmim-badge">'+count+'/'+c.max_teams+' times</span><span class="cmim-badge">'+formatDate(c.starts_at)+'</span></div>'+
  '<div class="cmim-actions"><button class="cmim-button ghost" data-select-comp="'+c.id+'">VER CONFRONTOS</button>'+buttons+'</div></article>'
 }).join(''):'<div class="cmim-empty">Nenhum campeonato público cadastrado ainda.</div>';
 document.querySelectorAll('[data-select-comp]').forEach(b=>b.onclick=()=>{
  $('selected-competition').value=b.dataset.selectComp;state.selected=b.dataset.selectComp;renderOverview();$('competition-overview').scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 document.querySelectorAll('[data-register]').forEach(b=>b.onclick=()=>register(b.dataset.register));
 $('selected-competition').innerHTML='<option value="">Escolha um campeonato</option>'+state.comps.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('');
 if(state.selected&&competition(state.selected))$('selected-competition').value=state.selected;
 renderOverview();
 if(state.admin){$('competition-admin').hidden=false;
  const selector=$('admin-competition-select'),selected=selector.value;
  selector.innerHTML=state.comps.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('');
  if(state.comps.some(c=>c.id===selected))selector.value=selected;
  renderAdminManage();
 }
}
async function register(compId){
 if(!state.me){location.href='./conta.html';return}
 const comp=competition(compId),eligible=own().filter(t=>membersFor(t.id).length===5&&
  !state.entries.some(e=>e.competition_id===compId&&e.team_id===t.id&&e.status!=='rejected'));
 if(!eligible.length){status('Para se inscrever, crie um time com cinco jogadores (convites aceitos).',true);return}
 const choice=eligible.length===1?eligible[0].id:prompt('Qual time deseja inscrever? Informe a sigla:\n'+eligible.map(t=>t.short_name+' — '+t.name).join('\n'));
 const chosen=eligible.length===1?eligible[0]:eligible.find(t=>t.id===choice||t.short_name.toLowerCase()===String(choice||'').toLowerCase());
 if(!chosen)return;
 try{await a.call('/rest/v1/rpc/cmim_register_competition',{method:'POST',secure:true,body:{p_competition:comp.id,p_team:chosen.id}});
  status('✓ '+chosen.name+' inscrito! Aguarde a análise do organizador.');await read()}
 catch(e){status('Inscrição não concluída: '+safeErr(e),true)}
}
function standings(compId){
 const games=state.matches.filter(m=>m.competition_id===compId&&m.status==='approved');
 const ids=state.entries.filter(e=>e.competition_id===compId&&e.status==='approved').map(e=>e.team_id);
 const scores=ids.map(id=>({id,team:team(id)?.name||'Time',wins:0,losses:0,byes:0,played:0,mapsWon:0,mapsLost:0,points:0,buchholz:0}));
 for(const g of games){
  const aa=scores.find(x=>x.id===g.team_a_id),bb=scores.find(x=>x.id===g.team_b_id);
  if(!bb){if(aa&&g.winner_id===aa.id){aa.byes++;aa.points+=3}continue;}
  if(aa){aa.played++;aa.mapsWon+=g.score_a;aa.mapsLost+=g.score_b;if(g.winner_id===aa.id){aa.wins++;aa.points+=3}else aa.losses++}
  if(bb){bb.played++;bb.mapsWon+=g.score_b;bb.mapsLost+=g.score_a;if(g.winner_id===bb.id){bb.wins++;bb.points+=3}else bb.losses++}
 }
 for(const g of games.filter(g=>g.team_b_id)){
  const aa=scores.find(x=>x.id===g.team_a_id),bb=scores.find(x=>x.id===g.team_b_id);
  if(aa&&bb){aa.buchholz+=bb.points;bb.buchholz+=aa.points}
 }
 return scores.sort((x,y)=>y.points-x.points||y.buchholz-x.buchholz||
  ((y.mapsWon-y.mapsLost)-(x.mapsWon-x.mapsLost))||y.wins-x.wins||x.team.localeCompare(y.team));
}
function renderOverview(){
 const target=$('competition-overview'),comp=competition($('selected-competition').value);
 if(!comp){target.innerHTML='';return}
 const list=state.matches.filter(m=>m.competition_id===comp.id),rank=standings(comp.id);
 let html='<p class="cmim-muted">'+esc(comp.description||'')+'</p>'+
  '<div><span class="cmim-badge">'+esc(label(comp.structure))+'</span><span class="cmim-badge">MD'+comp.series_games+'</span><span class="cmim-badge">'+esc(label(comp.status))+'</span></div>';
 if(rank.length)html+='<h3 style="color:#ffe58c">TABELA DE CLASSIFICAÇÃO</h3><div class="cmim-table-wrap"><table class="cmim-table"><thead><tr><th>Pos.</th><th>Time</th><th>V</th><th>D</th><th>Mapas</th><th>Pontos</th><th>Buchholz</th><th>Folgas</th></tr></thead><tbody>'+rank.map((t,i)=>'<tr><td>'+(i+1)+'º</td><td>'+esc(t.team)+'</td><td>'+t.wins+'</td><td>'+t.losses+'</td><td>'+t.mapsWon+'/'+t.mapsLost+'</td><td>'+t.points+'</td><td>'+t.buchholz+'</td><td>'+t.byes+'</td></tr>').join('')+'</tbody></table></div>';
 if(list.length)html+='<h3 style="color:#ffe58c">CONFRONTOS E RODADAS</h3>'+
 [...new Set(list.map(m=>m.round_number))].sort((a,b)=>a-b).map(round=>
  '<h4 style="color:#d4e5c8">RODADA '+round+'</h4><div class="cmim-competition-grid">'+list.filter(m=>m.round_number===round).map(m=>
  '<div class="cmim-match"><span class="cmim-kicker">'+esc(m.team_b_id?label(m.status):'FOLGA · AVANÇA AUTOMATICAMENTE')+'</span><div class="cmim-match-score">'+readable(m.team_a_id)+' <strong>'+(m.team_b_id?m.score_a+' × '+m.score_b:'—')+'</strong> '+(m.team_b_id?readable(m.team_b_id):'FOLGA')+'</div>'+
  (m.room_id?'<a class="cmim-match-link" href="./selecao.html?room='+encodeURIComponent(m.room_id)+'">▶ Assistir seleção</a>':'')+'</div>').join('')+'</div>').join('');
 else html+='<div class="cmim-empty" style="margin-top:18px">Nenhuma rodada gerada ainda. O ADM pode abrir a competição e criar os confrontos.</div>';
 target.innerHTML=html;
}
async function refresh(){try{await read();status('Dados de campeonatos atualizados.')}catch(e){status('Erro ao atualizar: '+safeErr(e),true)}}
$('selected-competition').onchange=e=>{state.selected=e.target.value;renderOverview()};
$('create-squad').onsubmit=async e=>{
 e.preventDefault();if(!state.me){location.href='./conta.html';return}
 const btn=e.currentTarget.querySelector('button'),f=new FormData(e.currentTarget);btn.disabled=true;
 try{await a.call('/rest/v1/cmim_squads',{method:'POST',secure:true,headers:{Prefer:'return=representation'},body:{
  name:f.get('name'),short_name:String(f.get('short_name')).toUpperCase(),captain_lane:f.get('captain_lane'),owner_id:state.me.id
 }});e.currentTarget.reset();await read();status('✓ Time criado. Convide jogadores pelo formulário acima.')}
 catch(err){status('Não foi possível criar o time: '+safeErr(err),true)}finally{btn.disabled=false}
};
function renderAdminManage(){
 if(!state.admin)return;
 const comp=competition($('admin-competition-select').value),box=$('admin-competition-body');
 if(!comp){box.innerHTML='<div class="cmim-empty">Cadastre um campeonato antes de administrar.</div>';return}
 const entries=state.entries.filter(e=>e.competition_id===comp.id);
 const games=state.matches.filter(m=>m.competition_id===comp.id),currentRound=Math.max(0,...games.map(g=>g.round_number));
 box.innerHTML='<div class="cmim-actions">'+['draft','open','closed','live','finished'].map(s=>'<button data-comp-status="'+s+'" class="cmim-button '+(comp.status===s?'':'ghost')+'">'+esc(label(s))+'</button>').join('')+'</div>'+
 '<h3 style="color:#ffe08d">INSCRIÇÕES · '+entries.length+'</h3>'+
 (entries.length?entries.map(e=>'<div class="cmim-match">'+readable(e.team_id)+' · '+esc(label(e.status))+
 '<div class="cmim-actions">'+(e.status==='pending'?'<button class="cmim-button" data-entry="'+e.id+'" data-entry-status="approved">✓ Aprovar time</button><button class="cmim-button ghost" data-entry="'+e.id+'" data-entry-status="rejected">Rejeitar</button>':'')+'</div></div>').join(''):'<p class="cmim-muted">Sem inscrições.</p>')+
 '<div class="cmim-actions" style="margin-top:21px"><button id="generate-round" class="cmim-button">⚔ GERAR '+(comp.structure==='liga'?'TABELA DA LIGA':'PRÓXIMA RODADA')+'</button><span class="cmim-muted">Rodada atual: '+currentRound+'</span></div>'+
 '<h3 style="color:#ffe08d">CONFRONTOS</h3>'+
 (games.length?games.map(g=>'<form class="cmim-match" data-match-edit="'+g.id+'"><b>Rodada '+g.round_number+' · Jogo '+g.match_number+'</b>'+
 '<p>'+readable(g.team_a_id)+' × '+(g.team_b_id?readable(g.team_b_id):'FOLGA')+'</p>'+
 '<div class="cmim-form-row"><label class="cmim-field">PLACAR A<input name="score_a" type="number" min="0" max="5" value="'+g.score_a+'"></label><label class="cmim-field">PLACAR B<input name="score_b" type="number" min="0" max="5" value="'+g.score_b+'"></label>'+
 '<label class="cmim-field">STATUS<select name="status">'+['scheduled','live','pending','approved'].map(x=>'<option value="'+x+'" '+(g.status===x?'selected':'')+'>'+esc(label(x))+'</option>').join('')+'</select></label>'+
 '</div>'+
 '<div class="cmim-actions"><button class="cmim-button ghost">SALVAR RESULTADO</button>'+
 (g.team_b_id&&g.status!=='approved'?(!g.room_id?
  '<button type="button" class="cmim-button" data-launch-match="'+g.id+'">🎮 CRIAR SELEÇÃO MD'+comp.series_games+'</button>':
  '<button type="button" class="cmim-button" data-sync-match="'+g.id+'">✓ SINCRONIZAR JOGO HOMOLOGADO</button><a class="cmim-button ghost" href="./admin.html?tab=matches">APROVAR NO ADM ↗</a>'):
  (g.team_b_id?'':'<span class="cmim-badge">FOLGA AUTOMÁTICA</span>'))+
 '</div></form>').join(''):'<p class="cmim-muted">Confrontos ainda não criados.</p>');
 box.querySelectorAll('[data-comp-status]').forEach(b=>b.onclick=async()=>{
  if(!confirm('Alterar situação de '+comp.title+' para '+label(b.dataset.compStatus)+'?'))return;
  try{await a.call('/rest/v1/cmim_competitions?id=eq.'+comp.id,{method:'PATCH',secure:true,body:{status:b.dataset.compStatus}});await read()}catch(e){status(safeErr(e),true)}
 });
 box.querySelectorAll('[data-entry]').forEach(b=>b.onclick=async()=>{
  try{await a.call('/rest/v1/cmim_competition_entries?id=eq.'+b.dataset.entry,{method:'PATCH',secure:true,body:{status:b.dataset.entryStatus}});await read()}catch(e){status(safeErr(e),true)}
 });
 $('generate-round').onclick=()=>generateRound(comp);
 box.querySelectorAll('[data-launch-match]').forEach(b=>b.onclick=()=>launchTournamentMatch(b.dataset.launchMatch,comp));
 box.querySelectorAll('[data-sync-match]').forEach(b=>b.onclick=()=>syncTournamentMatch(b.dataset.syncMatch));
 box.querySelectorAll('[data-match-edit]').forEach(form=>form.onsubmit=async e=>{
  e.preventDefault();const match=games.find(m=>m.id===form.dataset.matchEdit);
  const f=new FormData(form),score_a=Number(f.get('score_a')),score_b=Number(f.get('score_b')),statusValue=f.get('status');
  const needed=(Number(comp.series_games)+1)/2;
  if(statusValue==='approved'&&match.room_id)return status('Esta sala vinculada só pode ser homologada pelo botão SINCRONIZAR.',true);
  if(statusValue==='approved'&&!(Math.max(score_a,score_b)===needed&&Math.min(score_a,score_b)<needed))
   return status('Para aprovar MD'+comp.series_games+', um time precisa de '+needed+' vitória(s).',true);
  const room_id=match.room_id||null;
  const winner_id=statusValue==='approved'?(score_a>score_b?match.team_a_id:match.team_b_id):null;
  const reason=statusValue==='approved'?prompt('Resultado manual: informe como foi confirmado (mínimo 8 caracteres):'):'';
  if(statusValue==='approved'&&(reason===null||reason.trim().length<8))
   return status('Registre a justificativa para homologar o confronto sem sala.',true);
  try{await a.call('/rest/v1/cmim_competition_matches?id=eq.'+match.id,{
   method:'PATCH',secure:true,body:{score_a,score_b,status:statusValue,winner_id,room_id,manual_result_reason:reason||null,approved_by:statusValue==='approved'?state.me.id:null,approved_at:statusValue==='approved'?new Date().toISOString():null,updated_at:new Date().toISOString()}});
   status('✓ Resultado registrado pelo organizador.');await read()}
  catch(err){status('Não foi possível salvar o confronto: '+safeErr(err),true)}
 });
}
async function launchTournamentMatch(matchId,comp){
 if(!state.admin)return status('Esta função é exclusiva do ADM.',true);
 const match=state.matches.find(x=>x.id===matchId);
 if(!match||match.status==='approved'||match.room_id||!match.team_b_id)return status('Confronto indisponível.',true);
 const lanes=['TOP','JG','MID','ADC','SUP'];
 function lineup(teamId){
  const squad=team(teamId),members=membersFor(teamId);
  if(!squad||members.length!==5)throw Error('A equipe '+(squad?.name||'?')+' precisa de cinco membros.');
  const lineup=lanes.map(l=>members.find(m=>m.lane===l));
  if(lineup.some(x=>!x)||new Set(lineup.map(x=>x.user_id)).size!==5)
   throw Error('A equipe '+squad.name+' precisa de um jogador diferente em cada lane.');
  const profiles=lineup.map(x=>state.profiles.find(p=>p.id===x.user_id));
  if(profiles.some(x=>!x))throw Error('Uma conta não foi encontrada no elenco.');
  const pending=profiles.filter(p=>!p.rank_player_id||!p.rank_verified_at);
  if(pending.length)throw Error('Vincule ao Ranking as contas: '+pending.map(p=>p.nick+'#'+p.tag).join(', ')+'.');
  const captain=state.profiles.find(p=>p.id===squad.owner_id)?.nick||profiles[0].nick;
  return {name:squad.name,logo:'',captain,
   players:profiles.map(p=>p.nick),profileIds:profiles.map(p=>p.id)};
 }
 try{
  const teams=[lineup(match.team_a_id),lineup(match.team_b_id)];
  const payload={teams,games:Number(comp.series_games),mode:'Normal',duration:30,first:'B',pilot:true,
   source:'competition',createdAt:Date.now()};
  sessionStorage.setItem('cmim:play-handoff',JSON.stringify(payload));
  sessionStorage.setItem('cmim:competition-match-pending',match.id);
  status('Abrindo seleção oficial do campeonato…');
  location.href='./selecao.html?play=1';
 }catch(error){status('Não foi possível criar a seleção: '+safeErr(error),true)}
}
async function syncTournamentMatch(matchId){
 if(!state.admin)return;
 try{
  const result=await a.call('/rest/v1/rpc/cmim_competition_sync_match',{
   secure:true,method:'POST',body:{p_match:matchId}});
  await read();status('✓ Confronto homologado e classificação atualizada: '+result.score);
 }catch(error){status('O jogo deve estar aprovado no ADM: '+safeErr(error),true)}
}
async function generateRound(comp){
 if(!state.admin)return status('Acesso exclusivo do administrador.',true);
 if(!confirm('Gerar confrontos de '+comp.title+'? O servidor impedirá rodadas duplicadas, revanche indevida e folgas repetidas.'))return;
 const button=$('generate-round');if(button)button.disabled=true;
 try{
  const result=await a.call('/rest/v1/rpc/cmim_competition_generate_round',{
   method:'POST',secure:true,body:{p_competition:comp.id}});
  await read();status('✓ '+result.matchesCreated+' confronto(s) gerados na rodada '+result.round+'.'+(result.byeTeam?' Uma folga foi atribuída.':''));
 }catch(error){status('Erro no emparelhamento: '+safeErr(error),true)}
 finally{if(button)button.disabled=false}
}
$('admin-competition-select').onchange=renderAdminManage;
document.querySelectorAll('[data-admin-screen]').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('[data-admin-screen]').forEach(x=>x.classList.toggle('active',x===b));
 $('admin-comp-create').hidden=b.dataset.adminScreen!=='create';
 $('admin-comp-manage').hidden=b.dataset.adminScreen!=='manage';renderAdminManage();
});
$('admin-comp-create').onsubmit=async e=>{
 e.preventDefault();if(!state.admin)return;
 const btn=e.currentTarget.querySelector('button'),f=new FormData(e.currentTarget);
 btn.disabled=true;
 try{
  await a.call('/rest/v1/cmim_competitions',{method:'POST',secure:true,body:{
   title:txt(f.get('title')).trim(),description:txt(f.get('description')).trim(),structure:f.get('structure'),
   series_games:Number(f.get('series_games')),format:'MD'+f.get('series_games'),starts_at:new Date(f.get('starts_at')).toISOString(),
   max_teams:Number(f.get('max_teams')),status:f.get('status')
  }});
  e.currentTarget.reset();status('✓ Campeonato criado.');await read();
 }catch(err){status('Erro ao cadastrar: '+safeErr(err),true)}finally{btn.disabled=false}
};
try{
 state.me=await a.user();
 state.admin=state.me?.app_metadata?.cmim_admin===true;
 const date=new Date();date.setDate(date.getDate()+7);$('admin-comp-create').querySelector('[name=starts_at]').value=date.toISOString().slice(0,16);
 await read();
}catch(e){status('Falha ao consultar campeonatos: '+safeErr(e),true)}
});
