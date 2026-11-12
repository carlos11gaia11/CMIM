/* Campeonatos do CMIM: competições, times, convites, inscrições e rodadas ADM. */
document.addEventListener('DOMContentLoaded',async()=>{
'use strict';
const a=window.CMIMAuth,$=id=>document.getElementById(id),esc=a.esc;
const txt=x=>String(x??'');
const initialLeague=new URLSearchParams(location.search).get('liga');
const initialCompetition=new URLSearchParams(location.search).get('campeonato');
const state={me:null,admin:false,comps:[],entries:[],squads:[],members:[],profiles:[],matches:[],invites:[],selected:/^[a-f0-9-]{36}$/i.test(initialCompetition||'')?initialCompetition:null,league:['open','academy','major'].includes(initialLeague)?initialLeague:'all'};
const safeErr=e=>txt(e?.message||e);
const status=(message,bad=false)=>{
 const node=$('champ-status');node.textContent=message;node.className='cmim-status'+(bad?' error':'');
 let toast=$('cmim-competition-toast');
 if(!toast){toast=document.createElement('div');toast.id='cmim-competition-toast';
  toast.className='cmim-toast';toast.setAttribute('role','status');
  toast.setAttribute('aria-live','polite');document.body.append(toast);}
 toast.textContent=message;toast.className='cmim-toast'+(bad?' error':'');toast.hidden=false;
 clearTimeout(status.timer);status.timer=setTimeout(()=>toast.hidden=true,bad?9000:4500);
};
const leagueLabel=x=>({open:'CMIM OPEN',academy:'CMIM ACADEMY',major:'CMIM MAJOR'}[x]||'CIRCUITO GERAL');
const label=s=>({copa:'Copa / Mata-mata',liga:'Liga / Pontos corridos',suico:'Suíço',draft:'Rascunho',open:'Inscrições abertas',closed:'Inscrições encerradas',live:'Em andamento',finished:'Finalizado',pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',scheduled:'Agendado'}[s]||s);
const team=id=>state.squads.find(x=>x.id===id);
const competition=id=>state.comps.find(x=>x.id===id);
const formatDate=x=>x?new Date(x).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
const readable=id=>esc(team(id)?.name||'A definir');
const safeTeamId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id||''));
const teamLink=id=>safeTeamId(id)&&team(id)?'<a href="./equipe.html?id='+encodeURIComponent(id)+'">'+readable(id)+'</a>':readable(id);
const dateTime=x=>{if(!x)return 'Horário a definir';const d=new Date(x);return Number.isNaN(+d)?'Horário a definir':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' (Brasília)'};
const timeInput=iso=>{if(!iso)return '';const d=new Date(iso);if(Number.isNaN(+d))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,hourCycle:'h23'}).formatToParts(d);const get=x=>parts.find(p=>p.type===x)?.value||'';return get('year')+'-'+get('month')+'-'+get('day')+'T'+get('hour')+':'+get('minute')};
const toISO=local=>{if(!local)return null;const date=new Date(local+':00-03:00');if(Number.isNaN(+date))throw Error('Data ou horário inválido.');return date.toISOString()};
const own=()=>state.squads.filter(t=>t.owner_id===state.me?.id);
const membersFor=id=>state.members.filter(x=>x.team_id===id);
async function read(){
 const requests=[
 '/rest/v1/cmim_competitions?select=*&order=created_at.desc&limit=100',
 '/rest/v1/cmim_squads?select=id,name,short_name,owner_id,captain_lane&limit=500',
 '/rest/v1/cmim_squad_members?select=team_id,user_id,lane&limit=2000',
 '/rest/v1/cmim_profiles?select=id,nick,tag,lane,secondary_lane,avatar_url,rank_player_id,rank_verified_at&limit=2500',
 '/rest/v1/cmim_competition_matches?select=*&order=round_number.asc,match_number.asc&limit=3000',
 '/rest/v1/cmim_competition_entries?select=id,competition_id,team_id,status,created_at&limit=2000'
 ];
 // As áreas públicas continuam carregando se uma tabela restrita falhar.
 const responses=await Promise.allSettled(requests.map(url=>a.call(url)));
 const [comps,squads,members,profiles,matches,entries]=responses.map(x=>x.status==='fulfilled'&&Array.isArray(x.value)?x.value:[]);
 Object.assign(state,{comps,squads,members,profiles,matches,entries});
 state.loaded={comps:responses[0].status==='fulfilled',squads:responses[1].status==='fulfilled',members:responses[2].status==='fulfilled',matches:responses[4].status==='fulfilled',entries:responses[5].status==='fulfilled'};
 if(responses.some(x=>x.status==='rejected')&&state.me){
  $('champ-status').textContent='Algumas informações estão temporariamente indisponíveis. Atualize a página para tentar novamente.';
 }
 if(state.me){
  try{state.invites=await a.call('/rest/v1/cmim_squad_invites?recipient_id=eq.'+state.me.id+'&status=eq.pending&select=id,team_id,lane,sender_id')}catch{state.invites=[]}
 }
 render();
}

function renderPublicDashboard(){
 const write=(id,value)=>{const node=$(id);if(node)node.textContent=String(value)};
 const approved=state.entries.filter(e=>e.status==='approved');
 const confirmedTeams=new Set(approved.map(e=>e.team_id));
 write('cmim-pulse-events',state.loaded?.comps?state.comps.length:'—');
 write('cmim-pulse-open',state.loaded?.comps?state.comps.filter(c=>c.status==='open').length:'—');
 write('cmim-pulse-teams',state.loaded?.entries?confirmedTeams.size:'—');
 const teamsEl=$('cmim-teams-catalog');
 if(teamsEl){
  if(!state.loaded?.squads||!state.loaded?.entries){
    teamsEl.innerHTML='<div class="cmim-empty">As equipes oficiais estão temporariamente indisponíveis.</div>';
  }else{
    const visibleTeams=state.squads.filter(t=>confirmedTeams.has(t.id));
    teamsEl.innerHTML=visibleTeams.length?visibleTeams.map(t=>{
      const compsFor=approved.filter(e=>e.team_id===t.id).map(e=>competition(e.competition_id)).filter(Boolean);
      const leagues=[...new Set(compsFor.map(c=>leagueLabel(c.league_tier)))];
      return '<article class="cmim-official-team-card"><span class="cmim-team-monogram">'+esc((t.short_name||t.name||'CM').slice(0,4))+'</span><div><small>TIME HOMOLOGADO</small><h3><a href="./equipe.html?id='+encodeURIComponent(t.id)+'">'+esc(t.name)+'</a></h3><p>'+leagues.map(x=>esc(x)).join(' · ')+'</p><a class="cmim-team-view" href="./equipe.html?id='+encodeURIComponent(t.id)+'">ELENCO, RESULTADOS E ESTATÍSTICAS →</a></div></article>';
    }).join(''):'<div class="cmim-empty">Ainda não há equipes homologadas nas competições cadastradas.</div>';
  }
 }
 const schedule=$('cmim-upcoming-matches');
 if(schedule){
  if(!state.loaded?.matches){
    schedule.innerHTML='<div class="cmim-empty">Agenda temporariamente indisponível. Tente atualizar mais tarde.</div>';
  }else{
    const games=state.matches.filter(m=>['scheduled','live','pending'].includes(m.status)&&m.team_a_id&&m.team_b_id)
      .sort((a,b)=>Number(a.round_number)-Number(b.round_number)||Number(a.match_number)-Number(b.match_number)).slice(0,6);
    schedule.innerHTML=games.length?games.map(m=>{
      const comp=competition(m.competition_id);
      return '<article class="cmim-official-match-card"><span>'+esc(leagueLabel(comp?.league_tier))+' · RODADA '+Number(m.round_number)+'</span>'+
      '<h3>'+teamLink(m.team_a_id)+' <b>×</b> '+teamLink(m.team_b_id)+'</h3>'+
      '<p>'+esc(comp?.title||'Competição CMIM')+' · '+esc(label(m.status))+' · '+esc(dateTime(m.scheduled_at))+'</p>'+
      '<button class="cmim-button ghost" data-goto-event="'+esc(m.competition_id)+'" type="button">VER CHAVEAMENTO →</button></article>';
    }).join(''):'<div class="cmim-empty">Nenhum confronto agendado foi publicado no circuito até o momento.</div>';
    schedule.querySelectorAll('[data-goto-event]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.gotoEvent;state.selected=id;state.league='all';render();
      document.getElementById('chaveamentos')?.scrollIntoView({behavior:'smooth'});
    }));
  }
 }
}

function render(){
 renderPublicDashboard();
 const access=$('leagues-access-banner');if(access)access.hidden=!!state.me;
 $('create-squad').hidden=!state.me;
 if(!state.me)$('my-teams').innerHTML='<div class="cmim-empty">Entre em sua <a href="./conta.html">conta CMIM</a> para criar um time e se inscrever.</div>';
 else $('my-teams').innerHTML=own().length?own().map(t=>{
  const members=membersFor(t.id);
  const canInvite=members.length<5;
  return '<article class="cmim-cup" style="margin-bottom:10px"><h3>'+esc(t.name)+'</h3><small>'+members.length+'/5 jogadores · '+esc(t.short_name||'')+'</small>'+
  '<a class="cmim-team-inline-link" href="./equipe.html?id='+encodeURIComponent(t.id)+'">VER PERFIL DA EQUIPE →</a>'+
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
 const visibleComps=state.comps.filter(c=>state.league==='all'||c.league_tier===state.league);
 document.querySelectorAll('[data-filter-league]').forEach(button=>{
  const active=button.dataset.filterLeague===state.league;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-pressed',String(active));
 });
 $('competition-list').innerHTML=visibleComps.length?visibleComps.map(c=>{
  const count=state.entries.filter(e=>e.competition_id===c.id&&e.status!=='rejected').length;
  const buttons=c.status==='open'&&state.me?'<button class="cmim-button" data-register="'+c.id+'">INSCREVER MEU TIME →</button>':'';
  return '<article class="cmim-cup"><span class="cmim-kicker">'+esc(label(c.structure))+' · MD'+Number(c.series_games||3)+'</span><h3>'+esc(c.title)+'</h3><p class="cmim-muted">'+esc(c.description||'Confira o regulamento do evento.')+'</p>'+
  '<div><span class="cmim-badge">'+esc(leagueLabel(c.league_tier))+'</span><span class="cmim-badge">'+esc(label(c.status))+'</span><span class="cmim-badge">'+count+'/'+c.max_teams+' times</span><span class="cmim-badge">'+formatDate(c.starts_at)+'</span></div>'+
  '<div class="cmim-actions"><button class="cmim-button ghost" data-select-comp="'+c.id+'">VER CONFRONTOS</button>'+buttons+'</div>'+(c.league_tier&&['open','academy','major'].includes(c.league_tier)?'<a class="cmim-league-event-link" href="./liga.html?liga='+encodeURIComponent(c.league_tier)+'">PÁGINA DA LIGA →</a>':'')+'</article>'
 }).join(''):'<div class="cmim-empty">Ainda não existem eventos publicados nesta categoria. Acompanhe os anúncios oficiais do CMIM.</div>';
 document.querySelectorAll('[data-select-comp]').forEach(b=>b.onclick=()=>{
  $('selected-competition').value=b.dataset.selectComp;state.selected=b.dataset.selectComp;renderOverview();$('competition-overview').scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 document.querySelectorAll('[data-register]').forEach(b=>b.onclick=()=>register(b.dataset.register));
 if(state.selected&&!visibleComps.some(c=>c.id===state.selected))state.selected=null;
 $('selected-competition').innerHTML='<option value="">Escolha um campeonato</option>'+visibleComps.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('');
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
 if(!state.me){a.gotoLogin();return}
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
 if(list.length){
  const rounds=[...new Set(list.map(m=>m.round_number))].sort((a,b)=>a-b);
  html+='<h3 class="cmim-bracket-title">CHAVEAMENTO POR RODADAS</h3>'+
   '<p class="cmim-muted">Os confrontos abaixo refletem os registros oficiais de cada rodada.</p>'+
   '<div class="cmim-bracket" role="region" aria-label="Confrontos por rodada">'+rounds.map(round=>
    '<section class="cmim-bracket-round" aria-label="Rodada '+round+'"><h4><span>RODADA</span> '+round+'</h4>'+
    list.filter(m=>m.round_number===round).map(m=>
      '<article class="cmim-bracket-match"><span class="cmim-bracket-status">'+esc(m.team_b_id?label(m.status)+' · '+dateTime(m.scheduled_at):'FOLGA')+'</span>'+
      '<div class="cmim-bracket-team"><b>'+teamLink(m.team_a_id)+'</b><strong>'+(m.status==='approved'?Number(m.score_a):'—')+'</strong></div>'+
      '<div class="cmim-bracket-team"><b>'+(m.team_b_id?teamLink(m.team_b_id):'FOLGA · AVANÇA')+'</b><strong>'+(m.team_b_id&&m.status==='approved'?Number(m.score_b):'—')+'</strong></div>'+
      (m.room_id?'<a class="cmim-match-link" href="./selecao.html?room='+encodeURIComponent(m.room_id)+'">▶ Assistir seleção</a>':'')+
      '</article>').join('')+'</section>').join('')+'</div>';
 }
 else html+='<div class="cmim-empty" style="margin-top:18px">Nenhuma rodada gerada ainda. O ADM pode abrir a competição e criar os confrontos.</div>';
 target.innerHTML=html;
}
async function refresh(){try{await read();status('Dados de campeonatos atualizados.')}catch(e){status('Erro ao atualizar: '+safeErr(e),true)}}
document.querySelectorAll('[data-filter-league]').forEach(button=>button.addEventListener('click',()=>{
 state.league=button.dataset.filterLeague||'all';state.selected=null;
 const url=new URL(location.href);
 if(state.league==='all')url.searchParams.delete('liga');else url.searchParams.set('liga',state.league);
 history.replaceState({},'',url.pathname+url.search+url.hash);
 render();
}));
const loginLink=$('league-login-link');
if(loginLink)loginLink.addEventListener('click',e=>{e.preventDefault();a.gotoLogin()});
$('selected-competition').onchange=e=>{state.selected=e.target.value;renderOverview()};
$('create-squad').onsubmit=async e=>{
 e.preventDefault();if(!state.me){a.gotoLogin();return}
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
  '<div class="cmim-form-row" style="margin-top:12px"><label class="cmim-field">DATA/HORA PARA A PRÓXIMA RODADA (OPCIONAL)<input id="next-round-start" type="datetime-local" value="'+(currentRound===0?timeInput(comp.starts_at):'')+'"></label></div>'+
  '<p class="cmim-muted">Partidas geradas entram na agenda. A data informada vale para a rodada, mas pode ser ajustada por jogo.</p>'+
  (currentRound?'<div class="cmim-form-row"><label class="cmim-field">REAGENDAR RODADA<select id="bulk-round-number">'+[...new Set(games.map(g=>g.round_number))].sort((a,b)=>a-b).map(round=>'<option value="'+round+'">Rodada '+round+'</option>').join('')+'</select></label><label class="cmim-field">NOVO DIA E HORÁRIO<input id="bulk-round-start" type="datetime-local"></label><button type="button" id="bulk-round-save" class="cmim-button ghost">SALVAR HORÁRIO DA RODADA</button></div>':'')+
 '<h3 style="color:#ffe08d">CONFRONTOS</h3>'+
 (games.length?games.map(g=>'<form class="cmim-match" data-match-edit="'+g.id+'"><b>Rodada '+g.round_number+' · Jogo '+g.match_number+'</b>'+
 '<p>'+readable(g.team_a_id)+' × '+(g.team_b_id?readable(g.team_b_id):'FOLGA')+'</p>'+
  (g.team_b_id?'<div class="cmim-form-row"><label class="cmim-field">DATA E HORA (BRASÍLIA)<input type="datetime-local" name="scheduled_at" value="'+timeInput(g.scheduled_at)+'"></label><button type="button" class="cmim-button ghost" data-save-schedule="'+g.id+'">SALVAR DIA/HORA</button></div>':'')+
 '<div class="cmim-form-row"><label class="cmim-field">PLACAR A<input name="score_a" type="number" min="0" max="5" value="'+g.score_a+'"></label><label class="cmim-field">PLACAR B<input name="score_b" type="number" min="0" max="5" value="'+g.score_b+'"></label>'+
 '<label class="cmim-field">STATUS<select name="status">'+['scheduled','live','pending','approved'].map(x=>'<option value="'+x+'" '+(g.status===x?'selected':'')+'>'+esc(label(x))+'</option>').join('')+'</select></label>'+
 '</div>'+
 '<div class="cmim-actions">'+(g.status==='approved'?'<span class="cmim-badge">✓ RESULTADO HOMOLOGADO (BLOQUEADO)</span>':'<button class="cmim-button ghost">SALVAR RESULTADO</button>')+
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
 $('bulk-round-save')?.addEventListener('click',async event=>{
  const round=Number($('bulk-round-number')?.value),value=$('bulk-round-start')?.value;
  if(!round||!value)return status('Informe a rodada, dia e horário.',true);
  if(!confirm('Reagendar todos os confrontos da rodada '+round+' para '+value+' (Brasília)?'))return;
  const button=event.currentTarget;button.disabled=true;
  try{
   await a.call('/rest/v1/cmim_competition_matches?competition_id=eq.'+comp.id+'&round_number=eq.'+round+'&team_b_id=not.is.null',{
    method:'PATCH',secure:true,body:{scheduled_at:toISO(value),updated_at:new Date().toISOString()}
   });await read();status('✓ Rodada reagendada; a agenda foi sincronizada.');
  }catch(e){status('Não foi possível reagendar: '+safeErr(e),true)}finally{button.disabled=false}
 });
 box.querySelectorAll('[data-save-schedule]').forEach(button=>button.onclick=async()=>{
  const match=games.find(g=>g.id===button.dataset.saveSchedule);if(!match)return;
  const form=button.closest('[data-match-edit]'),value=form.querySelector('[name=scheduled_at]')?.value;
  button.disabled=true;
  try{await a.call('/rest/v1/cmim_competition_matches?id=eq.'+match.id,{
    method:'PATCH',secure:true,body:{scheduled_at:toISO(value),updated_at:new Date().toISOString()}
   });await read();status('✓ Dia/horário salvo e agenda sincronizada.')}
  catch(e){status('Falha ao agendar: '+safeErr(e),true)}
  finally{button.disabled=false}
 });
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
  const rankRows=await a.call('/rest/v1/cmim_rank?id=eq.1&select=data');
  const season=rankRows?.[0]?.data?.seasons?.find(x=>x.status==='active');
  if(!season)throw Error('O Ranking não possui uma temporada ativa. Abra uma temporada antes da seleção oficial.');
  const allowed=new Set(season.roster||[]);
  const linked=state.profiles.filter(p=>teams.some(t=>t.profileIds.includes(p.id)));
  const outside=linked.filter(p=>!allowed.has(p.rank_player_id));
  if(outside.length)throw Error('Estes jogadores não estão inscritos na temporada ativa: '+
   outside.map(p=>p.nick+'#'+p.tag).join(', ')+'. Inclua-os pelo ADM antes de jogar.');
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
  const requestedStart=$('next-round-start')?.value||'';
  const requestedISO=toISO(requestedStart);
  const result=await a.call('/rest/v1/rpc/cmim_competition_generate_round',{
   method:'POST',secure:true,body:{p_competition:comp.id}});
  if(requestedISO){
   try{
    await a.call('/rest/v1/cmim_competition_matches?competition_id=eq.'+comp.id+'&round_number=eq.'+Number(result.round)+'&team_b_id=not.is.null',{
      method:'PATCH',secure:true,body:{scheduled_at:requestedISO,updated_at:new Date().toISOString()}
    });
   }catch(scheduleError){await read();throw Error('Confrontos criados, mas sem o horário solicitado: '+safeErr(scheduleError))}
  }
  await read();status('✓ '+result.matchesCreated+' confronto(s) gerados na rodada '+result.round+'. Partidas adicionadas à agenda.'+(result.byeTeam?' Uma folga foi atribuída.':''));
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
   title:txt(f.get('title')).trim(),description:txt(f.get('description')).trim(),structure:f.get('structure'),league_tier:txt(f.get('league_tier')).toLowerCase(),
   series_games:Number(f.get('series_games')),format:'MD'+f.get('series_games'),starts_at:toISO(f.get('starts_at')),
   max_teams:Number(f.get('max_teams')),swiss_rounds:Number(f.get('swiss_rounds')||5),status:f.get('status')
  }});
  e.currentTarget.reset();status('✓ Campeonato criado.');await read();
 }catch(err){status('Erro ao cadastrar: '+safeErr(err),true)}finally{btn.disabled=false}
};
try{
 state.me=await a.user();
 state.admin=state.me?.app_metadata?.cmim_admin===true;
 const date=new Date();date.setDate(date.getDate()+7);$('admin-comp-create').querySelector('[name=starts_at]').value=date.toISOString().slice(0,16);
 await read();
 }catch(e){
  if(!state.me){render();$('champ-status').textContent='Você pode conhecer as ligas sem login. Para utilizar equipes e inscrições, entre na sua conta.';}
  else status('Falha ao consultar campeonatos: '+safeErr(e),true);
 }
});
