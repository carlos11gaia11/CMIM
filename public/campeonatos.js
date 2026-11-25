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
const money=c=>c?.registration_fee_cents==null?'A divulgar':c.registration_fee_cents===0?'Gratuita':(c.registration_fee_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const reviewFor=id=>(state.reviews||[]).find(r=>r.entry_id===id);
const paymentLabel=x=>({confirmed:'Pagamento confirmado',waived:'Isenção registrada',pending:'Pagamento pendente'}[x]||'Pagamento não verificado');
const entryLabel=s=>({pending:'Aguardando aprovação do ADM',approved:'Aprovado',rejected:'Inscrição recusada'}[s]||s);
const label=s=>({copa:'Copa / Mata-mata',liga:'Liga / Pontos corridos',suico:'Suíço',liga_mata_mata:'Liga + Mata-Mata',draft:'Rascunho',open:'Inscrições abertas',closed:'Inscrições encerradas',live:'Em andamento',finished:'Finalizado',pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',scheduled:'Agendado'}[s]||s);
const hybrid=c=>c?.structure==='liga_mata_mata';
const bestOf=(c,m)=>hybrid(c)?(Number(m.round_number)<=3?1:Number(m.round_number)<=5?3:5):Number(c.series_games);
const seriesLabel=c=>hybrid(c)?'Grupos MD1 · Quartas e semis MD3 · Final MD5':'MD'+Number(c.series_games||3);
const roundLabel=(c,r)=>hybrid(c)?(r<=3?'Grupos · Rodada '+r:({4:'Quartas de final',5:'Semifinais',6:'Final'}[r]||'Rodada '+r)):'Rodada '+r;
const groupLabel=m=>String.fromCharCode(65+Math.floor((Number(m.match_number)-1)/2));
const competitionLogo=c=>/^https:\/\//i.test(c?.cover_url||'')?c.cover_url:'./assets/branding/cmim-'+(['open','major','academy'].includes(c?.league_tier)?c.league_tier:'main')+'.webp';
const compLogoTag=c=>'<img src="'+esc(competitionLogo(c))+'" alt="Logo do campeonato" style="width:78px;height:78px;object-fit:contain;border-radius:10px;float:right;margin:0 0 12px 12px">';
const team=id=>state.squads.find(x=>x.id===id);
const competition=id=>state.comps.find(x=>x.id===id);
const formatDate=x=>x?new Date(x).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
const readable=id=>esc(team(id)?.name||'A definir');
const safeTeamId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id||''));
const teamLink=id=>safeTeamId(id)&&team(id)?'<a href="./equipe.html?id='+encodeURIComponent(id)+'">'+readable(id)+'</a>':readable(id);
const dateTime=x=>{if(!x)return 'Horário a definir';const d=new Date(x);return Number.isNaN(+d)?'Horário a definir':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' (Brasília)'};
const timeInput=iso=>{if(!iso)return '';const d=new Date(iso);if(Number.isNaN(+d))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,hourCycle:'h23'}).formatToParts(d);const get=x=>parts.find(p=>p.type===x)?.value||'';return get('year')+'-'+get('month')+'-'+get('day')+'T'+get('hour')+':'+get('minute')};
const toISO=local=>{if(!local)return null;const date=new Date(local+':00-03:00');if(Number.isNaN(+date))throw Error('Data ou horário inválido.');return date.toISOString()};
const own=()=>state.me?state.squads.filter(t=>t.owner_id===state.me.id):[];
const myTeams=()=>state.me?state.squads.filter(t=>t.owner_id===state.me.id||state.members.some(m=>m.team_id===t.id&&m.user_id===state.me.id)):[];
const myPage=!!$('my-teams'),mode=document.body.dataset.circuitMode||'hub';
const championshipId=new URLSearchParams(location.search).get('id');
const eventHref=id=>'./campeonato.html?id='+encodeURIComponent(id);
const matchHref=id=>'./partida.html?id='+encodeURIComponent(id);
const membersFor=id=>state.members.filter(x=>x.team_id===id);
const startersFor=id=>membersFor(id).filter(x=>x.starter);
const myProfile=()=>state.profiles.find(p=>p.id===state.me?.id);
const imageTag=(url,alt)=>/^https:\/\//i.test(url||'')?'<img src="'+esc(url)+'" alt="'+esc(alt)+'" style="width:48px;height:48px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:8px" loading="lazy">':'';
async function read(){
 const requests=[
 '/rest/v1/cmim_competitions?select=*&order=created_at.desc&limit=100',
 '/rest/v1/cmim_squads?select=id,name,short_name,owner_id,captain_lane,logo_url&limit=500',
 '/rest/v1/cmim_squad_members?select=team_id,user_id,lane,starter&limit=2000',
 '/rest/v1/cmim_profiles?select=id,nick,tag,lane,secondary_lane,avatar_url,rank_player_id,rank_verified_at&limit=2500',
 '/rest/v1/cmim_competition_matches?select=*&order=round_number.asc,match_number.asc&limit=3000',
 '/rest/v1/cmim_competition_entries?select=id,competition_id,team_id,status,created_at,group_tiebreak&limit=2000'
 ];
 // As áreas públicas continuam carregando se uma tabela restrita falhar.
 const responses=await Promise.allSettled(requests.map(url=>a.call(url,{secure:!!state.me})));
 const [comps,squads,members,profiles,matches,entries]=responses.map(x=>x.status==='fulfilled'&&Array.isArray(x.value)?x.value:[]);
 Object.assign(state,{comps,squads,members,profiles,matches,entries});
 state.hybridRanks={};
 await Promise.all(comps.filter(c=>hybrid(c)&&matches.some(m=>m.competition_id===c.id&&m.round_number===1)).map(async c=>{try{const rows=await a.call('/rest/v1/rpc/cmim_hybrid_standings',{method:'POST',secure:!!state.me,body:{p_competition:c.id}});if(Array.isArray(rows))state.hybridRanks[c.id]=rows;}catch{}}));
 state.loaded={comps:responses[0].status==='fulfilled',squads:responses[1].status==='fulfilled',members:responses[2].status==='fulfilled',matches:responses[4].status==='fulfilled',entries:responses[5].status==='fulfilled'};
 if(responses.some(x=>x.status==='rejected')&&state.me){
  $('champ-status').textContent='Algumas informações estão temporariamente indisponíveis. Atualize a página para tentar novamente.';
 }
 if(state.me&&(myPage||state.admin)){
  try{state.invites=await a.call('/rest/v1/cmim_squad_invites?recipient_id=eq.'+state.me.id+'&status=eq.pending&select=id,team_id,lane,sender_id,created_at&order=created_at.desc',{secure:true});state.inviteError=false}catch{state.invites=[];state.inviteError=true}
  try{state.reschedules=await a.call('/rest/v1/cmim_reschedule_requests?select=*&order=created_at.desc&limit=500',{secure:true});state.rescheduleError=false}catch{state.reschedules=[];state.rescheduleError=true}
 }
 if(state.me&&(myPage||mode==='admin'||mode==='championship')){try{state.reviews=await a.call('/rest/v1/cmim_entry_reviews?select=entry_id,payment_status,review_state,staff_note,updated_at&limit=2000',{secure:true});state.reviewError=false}catch{state.reviews=[];state.reviewError=true}}
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
      return '<article class="cmim-official-match-card"><span>'+esc(leagueLabel(comp?.league_tier))+' · '+esc(roundLabel(comp,Number(m.round_number)))+(hybrid(comp)&&m.round_number<=3?' · Grupo '+groupLabel(m):'')+'</span>'+
      '<h3>'+teamLink(m.team_a_id)+' <b>×</b> '+teamLink(m.team_b_id)+'</h3>'+
      '<p>'+esc(comp?.title||'Competição CMIM')+' · '+esc(label(m.status))+' · '+esc(dateTime(m.scheduled_at))+'</p>'+
      '<a class="cmim-button ghost" href="'+matchHref(m.id)+'">VER PARTIDA →</a></article>';
    }).join(''):'<div class="cmim-empty">Nenhum confronto agendado foi publicado no circuito até o momento.</div>';
    schedule.querySelectorAll('[data-goto-event]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.gotoEvent;state.selected=id;state.league='all';render();
      document.getElementById('chaveamentos')?.scrollIntoView({behavior:'smooth'});
    }));
  }
 }
}

function render(){
 if(mode==='championship'){renderChampionship();return}
 if(mode==='admin'){renderCircuitAdmin();return}
 document.querySelectorAll('.cmim-circuit-admin').forEach(el=>el.hidden=!state.admin);
 renderPublicDashboard();
 const access=$('leagues-access-banner');if(access)access.hidden=!!state.me;
 if(myPage){
 $('create-squad').hidden=!state.me||myTeams().length>0||!state.loaded?.squads||!state.loaded?.members;
 if(!state.me)$('my-teams').innerHTML='<div class="cmim-empty">Entre em sua <a href="./conta.html">conta CMIM</a> para criar um time e se inscrever.</div>';
 else $('my-teams').innerHTML=myTeams().length?myTeams().map(t=>{
  const members=membersFor(t.id);
  const captain=t.owner_id===state.me.id,locked=state.entries.some(e=>e.team_id===t.id&&e.status==='approved'&&(()=>{const c=competition(e.competition_id);return c?.lock_roster_at_close&&c.closes_at&&Date.parse(c.closes_at)<=Date.now()&&['open','closed','live'].includes(c.status)})()),canInvite=captain&&members.length<10&&!locked;
  const lanes=['TOP','JG','MID','ADC','SUP'],laneNames={TOP:'Topo',JG:'Selva',MID:'Meio',ADC:'Atirador',SUP:'Suporte'};
  const starters=members.filter(m=>m.starter),reserves=members.filter(m=>!m.starter).sort((a,b)=>lanes.indexOf(a.lane)-lanes.indexOf(b.lane));
  const logo=/^https:\/\//i.test(t.logo_url||'')?t.logo_url:'./assets/branding/cmim-main.webp';
  const ready=starters.length===5&&!!t.logo_url&&members.every(m=>state.profiles.find(p=>p.id===m.user_id)?.avatar_url);
  const playerCard=(m,lane)=>{if(!m)return '<article class="mt-player mt-vacant"><span class="mt-role">'+esc(laneNames[lane]||lane)+'</span><span class="mt-avatar mt-avatar-empty" aria-hidden="true">+</span><strong>Vaga aberta</strong><small>Sem titular</small></article>';
   const pl=state.profiles.find(p=>p.id===m.user_id),nick=pl?.nick||'Jogador',isCaptain=m.user_id===t.owner_id;
   const photo=/^https:\/\//i.test(pl?.avatar_url||'')?'<img class="mt-avatar" src="'+esc(pl.avatar_url)+'" alt="" loading="lazy">':'<span class="mt-avatar mt-avatar-fallback">'+esc(nick.slice(0,2).toUpperCase())+'</span>';
   return '<article class="mt-player"><span class="mt-role">'+esc(laneNames[m.lane]||m.lane)+'</span>'+photo+'<div class="mt-player-name"><strong>'+esc(nick)+'</strong><small>'+(pl?.tag?'#'+esc(pl.tag):'—')+'</small></div><span class="mt-player-status">'+(isCaptain?'CAPITÃO':m.starter?'TITULAR':'RESERVA')+'</span>'+(captain?'<button type="button" class="cmim-button ghost mt-small" data-starter-team="'+esc(t.id)+'" data-starter-player="'+esc(m.user_id)+'" data-starter-value="'+(!m.starter)+'">'+(m.starter?'Mover para reserva':'Definir titular')+'</button>':'')+'</article>'};
  const applicants=state.profiles.filter(p=>!state.members.some(m=>m.user_id===p.id)).sort((a,b)=>String(a.nick).localeCompare(String(b.nick),'pt-BR'));
  return '<article class="mt-dashboard"><div class="mt-team-hero"><img class="mt-team-logo" src="'+esc(logo)+'" alt="Logo da equipe"><div class="mt-team-identity"><div class="mt-overline">EQUIPE CMIM · '+esc(t.short_name||'')+'</div><h3>'+esc(t.name)+'</h3><div class="mt-subline"><span class="mt-role-badge">'+(captain?'Você é o capitão':'Você integra o elenco')+'</span><span class="mt-readiness '+(ready?'ready':'')+'"><i></i>'+(ready?'Elenco apto para solicitar inscrição':'Elenco em formação')+'</span></div></div><a class="mt-public-link" href="./equipe.html?id='+encodeURIComponent(t.id)+'">Perfil público <span aria-hidden="true">↗</span></a></div>'+
   '<div class="mt-metrics">'+[[members.length,10,'JOGADORES'],[starters.length,5,'TITULARES'],[reserves.length,5,'RESERVAS']].map(([n,max,label])=>'<div class="mt-metric"><span>'+label+'</span><strong>'+n+'<small>/'+max+'</small></strong><div class="mt-meter"><i style="width:'+Math.min(100,100*n/max)+'%"></i></div></div>').join('')+'</div>'+
   '<section class="mt-roster"><div class="mt-section-heading"><div><h4>Formação titular</h4><p>Uma vaga para cada posição.</p></div><span>'+starters.length+'/5</span></div><div class="mt-player-grid">'+lanes.map(l=>playerCard(starters.find(m=>m.lane===l),l)).join('')+'</div></section>'+
   '<section class="mt-roster"><div class="mt-section-heading"><div><h4>Banco de reservas</h4><p>Jogadores disponíveis para substituição.</p></div><span>'+reserves.length+'/5</span></div>'+(reserves.length?'<div class="mt-player-grid">'+reserves.map(m=>playerCard(m,m.lane)).join('')+'</div>':'<div class="mt-empty">Nenhum reserva no elenco.</div>')+'</section>'+
   (captain?'<section class="mt-management"><div class="mt-section-heading"><div><h4>Gestão da equipe</h4><p>Ferramentas exclusivas do capitão.</p></div></div><div class="mt-tools">'+(canInvite?'<details class="mt-tool" open><summary><span>＋ Convidar jogador</span><span class="mt-chevron">⌄</span></summary><form data-invite-team="'+esc(t.id)+'" class="mt-tool-form"><label class="cmim-field">JOGADOR<select name="recipient" required><option value="">Selecionar jogador</option>'+applicants.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nick+'#'+p.tag)+'</option>').join('')+'</select></label><label class="cmim-field">POSIÇÃO<select name="lane">'+lanes.map(l=>'<option value="'+l+'">'+laneNames[l]+'</option>').join('')+'</select></label><button type="submit" class="cmim-button">Enviar convite</button></form></details>':'<div class="mt-empty">'+(locked?'Elenco bloqueado pelo prazo de inscrição.':'Elenco completo — 10 jogadores.')+'</div>')+
   '<details class="mt-tool"><summary><span>Editar logo da equipe</span><span class="mt-chevron">⌄</span></summary><form data-logo-team="'+esc(t.id)+'" class="mt-tool-form"><label class="cmim-field">NOVA LOGO · 512 × 512<input name="logo" type="file" accept="image/jpeg,image/png,image/webp" required></label><button type="submit" class="cmim-button ghost">Salvar logo</button></form><p class="mt-tool-note">PNG, JPG ou WebP de até 10 MB.</p></details></div></section>':'<p class="mt-tool-note">A formação e os convites são administrados pelo capitão.</p>')+'</article>';
 }).join(''):'<p class="cmim-muted">Você ainda não integra um time. Crie seu elenco ou aceite um convite.</p>';
 const photoInput=$('squad-player-photo');if(photoInput){photoInput.required=!!state.me&&!myProfile()?.avatar_url;}
 document.querySelectorAll('[data-starter-team]').forEach(b=>b.onclick=async()=>{
  if(!confirm(b.dataset.starterValue==='true'?'Definir como titular? O titular atual da mesma lane passará para reserva.':'Mover jogador para a reserva?'))return;
  b.disabled=true;try{await a.call('/rest/v1/rpc/cmim_set_starter',{method:'POST',secure:true,body:{p_team:b.dataset.starterTeam,p_player:b.dataset.starterPlayer,p_starter:b.dataset.starterValue==='true'}});await read();status('Elenco atualizado.')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}
 });
 document.querySelectorAll('[data-logo-team]').forEach(form=>form.onsubmit=async e=>{
  e.preventDefault();const b=form.querySelector('button');b.disabled=true;
  try{const logo_url=await a.uploadTeamLogo(new FormData(form).get('logo'));await a.call('/rest/v1/cmim_squads?id=eq.'+form.dataset.logoTeam,{method:'PATCH',secure:true,body:{logo_url}});await read();status('Logo atualizada.')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}
 });
 document.querySelectorAll('[data-invite-team]').forEach(form=>form.onsubmit=async e=>{
  e.preventDefault();const f=new FormData(form),button=form.querySelector('button');button.disabled=true;
  try{const sent=await a.call('/rest/v1/rpc/cmim_invite_player',{method:'POST',secure:true,body:{p_team:form.dataset.inviteTeam,p_recipient:f.get('recipient'),p_lane:f.get('lane')}});if(typeof sent!=='string'||!sent)throw Error('Não foi possível confirmar o envio do convite.');form.reset();status('✓ Convite enviado! O jogador verá a notificação no sino e poderá aceitar em Meu Time.');$('invite-send-status').textContent='Convite enviado com sucesso.';await read()}
  catch(err){const msg='Erro no convite: '+safeErr(err);status(msg,true);$('invite-send-status').textContent=msg}finally{button.disabled=false}
 });
 renderInvites();
 const myEntries=$('my-entries');if(myEntries){const ids=new Set(myTeams().map(t=>t.id));const entries=state.entries.filter(e=>ids.has(e.team_id));myEntries.innerHTML=entries.length?entries.map(e=>'<article class="cmim-match"><b>'+esc(competition(e.competition_id)?.title||'Campeonato')+'</b><p>'+readable(e.team_id)+' · '+esc(entryLabel(e.status))+'</p>'+entryReviewText(e)+'<a href="./campeonato.html?id='+encodeURIComponent(e.competition_id)+'#classificacao">Ver classificação e jogos →</a></article>').join(''):'<p class="cmim-muted">Nenhuma inscrição registrada. Consulte os campeonatos disponíveis.</p>';} 
 document.dispatchEvent(new Event('cmim-team-changed'));
 }
 const rescheduleAdmin=$('league-reschedule-admin');if(rescheduleAdmin)rescheduleAdmin.hidden=!state.admin;
 if((myPage||state.admin)&&$('my-reschedules'))renderReschedules();
 if(!$('competition-list'))return;
 const visibleComps=state.comps.filter(c=>c.status!=='draft'&&(state.league==='all'||c.league_tier===state.league));
 document.querySelectorAll('[data-filter-league]').forEach(button=>{
  const active=button.dataset.filterLeague===state.league;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-pressed',String(active));
 });
 $('competition-list').innerHTML=visibleComps.length?visibleComps.map(c=>{
  const count=state.entries.filter(e=>e.competition_id===c.id&&e.status!=='rejected').length;
  const ownEntry=state.entries.find(e=>e.competition_id===c.id&&own().some(t=>t.id===e.team_id));const buttons=ownEntry?'<span class="cmim-badge">'+esc(entryLabel(ownEntry.status))+'</span><a class="cmim-button ghost" href="./meu-time.html#minhas-inscricoes">MINHAS INSCRIÇÕES</a>':c.status==='open'&&state.me?'<button class="cmim-button" data-register="'+c.id+'">SOLICITAR INSCRIÇÃO →</button>':'';
  return '<article class="cmim-cup">'+compLogoTag(c)+'<span class="cmim-kicker">'+esc(label(c.structure))+' · '+esc(seriesLabel(c))+'</span><h3>'+esc(c.title)+'</h3><p class="cmim-muted">'+esc(c.description||'Confira o regulamento do evento.')+'</p>'+
  '<div><span class="cmim-badge">'+esc(leagueLabel(c.league_tier))+'</span><span class="cmim-badge">'+esc(label(c.status))+'</span><span class="cmim-badge">'+count+'/'+c.max_teams+' times</span><span class="cmim-badge">'+formatDate(c.starts_at)+'</span></div>'+
  '<div class="cmim-actions"><a class="cmim-button ghost" href="'+eventHref(c.id)+'">ABRIR CAMPEONATO →</a>'+buttons+'</div>'+(c.league_tier&&['open','academy','major'].includes(c.league_tier)?'<a class="cmim-league-event-link" href="./liga.html?liga='+encodeURIComponent(c.league_tier)+'">PÁGINA DA LIGA →</a>':'')+'</article>'
 }).join(''):'<div class="cmim-empty">Ainda não existem eventos publicados nesta categoria. Acompanhe os anúncios oficiais do CMIM.</div>';
 document.querySelectorAll('[data-select-comp]').forEach(b=>b.onclick=()=>{
  $('selected-competition').value=b.dataset.selectComp;state.selected=b.dataset.selectComp;renderOverview();$('competition-overview').scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 document.querySelectorAll('[data-register]').forEach(b=>b.onclick=()=>register(b.dataset.register));
 if(state.selected&&!visibleComps.some(c=>c.id===state.selected))state.selected=null;
 $('selected-competition').innerHTML='<option value="">Escolha um campeonato</option>'+visibleComps.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('');
 if(!state.selected&&visibleComps.length)state.selected=visibleComps[0].id;
 if(state.selected&&competition(state.selected))$('selected-competition').value=state.selected;
 renderOverview();
 if(state.admin&&$('competition-admin')){$('competition-admin').hidden=false;
  const selector=$('admin-competition-select'),selected=selector.value;
  selector.innerHTML=state.comps.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('');
  if(state.comps.some(c=>c.id===selected))selector.value=selected;
  renderAdminManage();
 }
}
let inboxBusy=false;
function renderInvites(){
 const root=$('my-invites');if(!root)return;
 root.innerHTML=!state.me?'<p>Entre para consultar seus convites.</p>':state.inviteError?'<p>Não foi possível consultar os convites. Use Atualizar para tentar novamente.</p>':state.invites.length?state.invites.map(i=>'<div class="cmim-cup" style="margin:8px 0">'+imageTag(team(i.team_id)?.logo_url,'Logo')+'<b>'+readable(i.team_id)+'</b><p>Convite para '+esc(i.lane)+'</p><button type="button" class="cmim-button" data-invite-id="'+esc(i.id)+'" data-accept="true">Aceitar</button> <button type="button" class="cmim-button ghost" data-invite-id="'+esc(i.id)+'" data-accept="false">Recusar</button></div>').join(''):'<p class="cmim-muted">Nenhum convite pendente.</p>';
 const sendStatus=$('invite-inbox-status');
 root.querySelectorAll('[data-invite-id]').forEach(b=>b.onclick=async()=>{
  if(inboxBusy)return;inboxBusy=true;root.querySelectorAll('button').forEach(x=>x.disabled=true);
  try{
   if(b.dataset.accept==='true'&&!myProfile()?.avatar_url){throw Error('Envie sua foto em Meu perfil antes de aceitar o convite.')}
   const accept=b.dataset.accept==='true';
   const result=await a.call('/rest/v1/rpc/cmim_answer_invite',{method:'POST',secure:true,body:{p_invite:b.dataset.inviteId,p_accept:accept}});
   if(result!==(accept?'accepted':'declined'))throw Error('Não foi possível confirmar a resposta.');
   if(sendStatus)sendStatus.textContent=accept?'Convite aceito! Você agora integra a equipe.':'Convite recusado.';
   await read();document.dispatchEvent(new Event('cmim-invite-answered'));
  }catch(e){if(sendStatus)sendStatus.textContent=safeErr(e);status(safeErr(e),true)}
  finally{inboxBusy=false;root.querySelectorAll('button').forEach(x=>x.disabled=false)}
 });
}
async function refreshInbox(){
 if(!myPage||!state.me||inboxBusy)return;
 inboxBusy=true;
 try{
  const rows=await a.call('/rest/v1/cmim_squad_invites?recipient_id=eq.'+encodeURIComponent(state.me.id)+'&status=eq.pending&select=id,team_id,lane,sender_id,created_at&order=created_at.desc',{secure:true});
  if(!Array.isArray(rows))throw Error('Convites indisponíveis');
  const unknown=rows.map(r=>r.team_id).filter(id=>!team(id));
  if(unknown.length){const squads=await a.call('/rest/v1/cmim_squads?id=in.('+[...new Set(unknown)].map(encodeURIComponent).join(',')+')&select=id,name,short_name,owner_id,captain_lane,logo_url',{secure:true});if(Array.isArray(squads))state.squads.push(...squads.filter(t=>!team(t.id)))}
  state.invites=rows;state.inviteError=false;
 }catch{state.inviteError=true}
 finally{inboxBusy=false;renderInvites()}
}
if(myPage){$('refresh-invites')?.addEventListener('click',()=>void refreshInbox());document.addEventListener('cmim-invites-changed',()=>void refreshInbox())}
function renderReschedules(){
 const root=$('my-reschedules');if(!root)return;
 if(!state.me){root.innerHTML='<p class="cmim-muted">Entre para consultar pedidos de reagendamento.</p>';return}
 if(state.rescheduleError){root.textContent='Não foi possível consultar solicitações. Atualize a página.';return}
 const ids=new Set(own().map(t=>t.id)),memberIds=new Set(myTeams().map(t=>t.id)),requests=(state.reschedules||[]).filter(r=>myPage?ids.has(r.requester_team_id)||ids.has(r.recipient_team_id):state.admin&&r.status==='pending_admin');
 const games=myPage?state.matches.filter(m=>m.status!=='approved'&&m.team_b_id&&(memberIds.has(m.team_a_id)||memberIds.has(m.team_b_id))):[];
 const labels={pending:'Pendente',pending_admin:'Aguardando confirmação do ADM',accepted:'Aceito',rejected:'Recusado',cancelled:'Cancelado',stale:'Expirado ou horário alterado'};
 root.innerHTML='<h3>MEUS CONFRONTOS</h3>'+(games.length?games.map(m=>{
  const pending=requests.some(r=>r.match_id===m.id&&['pending','pending_admin'].includes(r.status));
  return '<div class="cmim-match"><b>'+teamLink(m.team_a_id)+' × '+teamLink(m.team_b_id)+'</b><p>'+esc(dateTime(m.scheduled_at))+'</p>'+
  (!ids.has(m.team_a_id)&&!ids.has(m.team_b_id)?'<p class="cmim-muted">O capitão é responsável pelo reagendamento.</p>':m.status!=='scheduled'||m.room_id?'<p class="cmim-muted">Partida indisponível para reagendamento.</p>':pending?'<p class="cmim-muted">Há uma solicitação pendente ou aguardando confirmação da organização.</p>':'<form class="cmim-form-row" data-reschedule-match="'+m.id+'"><label class="cmim-field">NOVA DATA E HORA (BRASÍLIA)<input type="datetime-local" name="time" required></label><label class="cmim-field">MOTIVO (OPCIONAL)<input name="reason" maxlength="500"></label><button class="cmim-button">SOLICITAR REAGENDAMENTO</button></form>')+'</div>';
 }).join(''):'<p class="cmim-muted">Nenhum confronto disponível para reagendar.</p>')+
 '<h3>SOLICITAÇÕES RECEBIDAS E ENVIADAS</h3>'+(requests.length?requests.map(r=>{
  const m=state.matches.find(x=>x.id===r.match_id);
  const incoming=ids.has(r.recipient_team_id),outgoing=ids.has(r.requester_team_id);
  return '<div class="cmim-match"><b>'+readable(r.requester_team_id)+' → '+readable(r.recipient_team_id)+'</b><p>'+esc(labels[r.status]||r.status)+' · '+esc(m?competition(m.competition_id)?.title||'Campeonato':'Campeonato')+'</p><p>Atual: '+esc(dateTime(r.old_time))+' · Proposta: '+esc(dateTime(r.proposed_time))+'</p><p>'+esc(r.reason||'Sem motivo informado')+'</p>'+
  (r.status==='pending_admin'&&state.admin?'<div class="cmim-actions"><button class="cmim-button" data-confirm-reschedule="'+r.id+'" data-accept="true">CONFIRMAR HORÁRIO</button><button class="cmim-button ghost" data-confirm-reschedule="'+r.id+'" data-accept="false">RECUSAR HORÁRIO</button></div>':'')+(r.status==='pending'?'<div class="cmim-actions">'+(incoming?'<button class="cmim-button" data-reschedule-id="'+r.id+'" data-action="accepted">Aceitar</button><button class="cmim-button ghost" data-reschedule-id="'+r.id+'" data-action="rejected">Recusar</button>':'')+(outgoing?'<button class="cmim-button ghost" data-reschedule-id="'+r.id+'" data-action="cancelled">Cancelar pedido</button>':'')+'</div>':'')+'</div>';
 }).join(''):'<p class="cmim-muted">Nenhuma solicitação.</p>');
 root.querySelectorAll('[data-reschedule-match]').forEach(form=>form.onsubmit=async e=>{
  e.preventDefault();const b=form.querySelector('button'),f=new FormData(form);b.disabled=true;
  try{await a.call('/rest/v1/rpc/cmim_request_reschedule',{method:'POST',secure:true,body:{p_match:form.dataset.rescheduleMatch,p_time:toISO(f.get('time')),p_reason:f.get('reason')}});await read();status('Solicitação enviada ao capitão adversário.')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}
 });
 root.querySelectorAll('[data-confirm-reschedule]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const result=await a.call('/rest/v1/rpc/cmim_confirm_reschedule',{method:'POST',secure:true,body:{p_request:b.dataset.confirmReschedule,p_accept:b.dataset.accept==='true'}});await read();status(result==='accepted'?'Horário oficial confirmado na agenda.':result==='stale'?'Solicitação expirada.':'Solicitação recusada.',result==='stale')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}});
 root.querySelectorAll('[data-reschedule-id]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;try{const result=await a.call('/rest/v1/rpc/cmim_answer_reschedule',{method:'POST',secure:true,body:{p_request:b.dataset.rescheduleId,p_action:b.dataset.action}});await read();status(result==='accepted'?'Novo horário confirmado na agenda.':result==='pending_admin'?'Aceito pelo adversário. Aguardando confirmação da organização.':result==='stale'?'Solicitação expirada ou horário alterado.':'Solicitação respondida.',result==='stale')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}
 });
}
async function register(compId){
 if(!state.me){a.gotoLogin();return}
 const comp=competition(compId),eligible=own().filter(t=>startersFor(t.id).length===5&&t.logo_url&&membersFor(t.id).every(m=>state.profiles.find(p=>p.id===m.user_id)?.avatar_url)&&
  !state.entries.some(e=>e.competition_id===compId&&e.team_id===t.id));
 if(!eligible.length){status('Para se inscrever, tenha cinco titulares, logo e fotos de todos os membros.',true);return}
 const choice=eligible.length===1?eligible[0].id:prompt('Qual time deseja inscrever? Informe a sigla:\n'+eligible.map(t=>t.short_name+' — '+t.name).join('\n'));
 const chosen=eligible.length===1?eligible[0]:eligible.find(t=>t.id===choice||t.short_name.toLowerCase()===String(choice||'').toLowerCase());
 if(!chosen)return;
 try{await a.call('/rest/v1/rpc/cmim_register_competition',{method:'POST',secure:true,body:{p_competition:comp.id,p_team:chosen.id}});
  status('✓ Solicitação de '+chosen.name+' enviada. Aguarde a aprovação do ADM antes de participar.');await read()}
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
function hybridStandings(compId){
 const games=state.matches.filter(m=>m.competition_id===compId&&m.round_number<=3);
 const approved=games.filter(m=>m.status==='approved');
 const groups=['A','B','C','D'].map(group=>{
  const actual=games.filter(m=>m.round_number===1&&groupLabel(m)===group).flatMap(m=>[m.team_a_id,m.team_b_id]);
  const ids=actual.length?actual:(competition(compId)?.group_team_order||[]).slice((group.charCodeAt(0)-65)*4,(group.charCodeAt(0)-64)*4).filter(Boolean);
  const rows=ids.map(id=>({id,wins:approved.filter(m=>m.winner_id===id).length,losses:approved.filter(m=>[m.team_a_id,m.team_b_id].includes(id)&&m.winner_id!==id).length,
   tie:state.entries.find(e=>e.competition_id===compId&&e.team_id===id)?.group_tiebreak??null,direct:0}));
  for(const row of rows){
   row.direct=approved.filter(m=>m.winner_id===row.id&&rows.some(o=>o.id!==row.id&&o.wins===row.wins&&[m.team_a_id,m.team_b_id].includes(o.id))).length;
  }
  for(const row of rows){
   const tied=rows.filter(o=>o.wins===row.wins&&o.direct===row.direct);
   row.unresolved=tied.length>1&&(tied.some(o=>o.tie===null)||new Set(tied.map(o=>o.tie)).size!==tied.length);
  }
  rows.sort((a,b)=>b.wins-a.wins||b.direct-a.direct||(a.tie??99)-(b.tie??99)||a.id.localeCompare(b.id));
  const official=state.hybridRanks?.[compId];
  if(Array.isArray(official)&&official.length){const ranks=official.filter(r=>Number(r.group_no)===group.charCodeAt(0)-64);for(const row of rows){const r=ranks.find(x=>x.team_id===row.id);if(r)Object.assign(row,{wins:r.wins,losses:r.losses,direct:r.direct_wins,tie:r.tie_order,unresolved:r.unresolved,position:Number(r.standing_position)});}rows.sort((a,b)=>(a.position??99)-(b.position??99));}
  return {group,rows};
 });
 return {groups,complete:approved.length===24};
}
function hybridTables(comp){
 const {groups,complete}=hybridStandings(comp.id);
 return '<h3 style="color:#ffe58c">CLASSIFICAÇÃO POR GRUPOS</h3><p class="cmim-muted">Vitória = 1 ponto. Desempate: confronto direto; no Open, tempo médio de vitória entre empatados quando persistir empate múltiplo. Os dois primeiros de cada grupo avançam.</p>'+
 groups.map(g=>'<h4>GRUPO '+g.group+'</h4><div class="cmim-table-wrap"><table class="cmim-table"><thead><tr><th>Pos.</th><th>Time</th><th>V</th><th>D</th><th>Pontos</th><th>Situação</th></tr></thead><tbody>'+[...g.rows,...Array.from({length:Math.max(0,4-g.rows.length)},()=>({id:null,wins:0,losses:0}))].map((t,i)=>'<tr><td>'+(i+1)+'º</td><td>'+(t.id?teamLink(t.id):'Vaga a definir')+'</td><td>'+t.wins+'</td><td>'+t.losses+'</td><td>'+t.wins+'</td><td>'+(!t.id?'A definir':!complete?'Em disputa':t.unresolved?'Desempate pendente':i<2?'<span class="cmim-badge">✓ CLASSIFICADO</span>':'Eliminado')+'</td></tr>').join('')+'</tbody></table></div>').join('');
}
function playoffPreview(list=[]){
 const stages=[{r:4,title:'Quartas · MD3',slots:[['1º A','2º B'],['1º C','2º D'],['1º B','2º A'],['1º D','2º C']]},{r:5,title:'Semifinais · MD3',slots:[['Vencedor Q1','Vencedor Q2'],['Vencedor Q3','Vencedor Q4']]},{r:6,title:'Final · MD5',slots:[['Vencedor S1','Vencedor S2']]}];
 return '<h3>PLAYOFFS · CHAVE FIXA</h3><div class="cmim-bracket">'+stages.map(stage=>'<section class="cmim-bracket-round"><h4>'+stage.title+'</h4>'+stage.slots.map((slot,i)=>{const m=list.find(m=>m.round_number===stage.r&&m.match_number===i+1);return '<article class="cmim-bracket-match"><span class="cmim-bracket-status">'+esc(m?dateTime(m.scheduled_at):'A definir')+'</span><div class="cmim-bracket-team"><b>'+(m?teamLink(m.team_a_id):slot[0])+'</b><strong>'+(m?.status==='approved'?m.score_a:'—')+'</strong></div><div class="cmim-bracket-team"><b>'+(m?teamLink(m.team_b_id):slot[1])+'</b><strong>'+(m?.status==='approved'?m.score_b:'—')+'</strong></div>'+(m?'<a class="cv-match-link" href="'+matchHref(m.id)+'">Ver partida →</a>':'')+'</article>'}).join('')+'</section>').join('')+'</div>';
}
function emptyFormatPreview(){return '<p class="cmim-muted">Formato previsto do CMIM Open · modelo ilustrativo, sem equipes ou partidas oficiais cadastradas.</p>'+hybridTables({id:null})+playoffPreview();}
function entryReviewText(e){const r=reviewFor(e.id),c=competition(e.competition_id);return '<div class="cv-review-note"><small>Inscrição: '+esc(money(c))+'</small>'+((c?.registration_fee_cents||0)>0?'<p>'+esc(paymentLabel(r?.payment_status||'pending'))+'</p>':'')+(r?.review_state==='corrections'?'<p><strong>Ajustes solicitados pela organização</strong></p>':'')+(r?.staff_note?'<p class="cv-pre">'+esc(r.staff_note)+'</p>':'')+(state.reviewError?'<p>Detalhes da análise temporariamente indisponíveis.</p>':'')+'</div>'}
function reviewForm(e,c){const r=reviewFor(e.id)||{};const options=(items,selected)=>items.map(([v,t])=>'<option value="'+v+'" '+(v===selected?'selected':'')+'>'+t+'</option>').join('');return '<form class="cv-review-form" data-review-entry="'+esc(e.id)+'"><div class="cmim-form-row"><label class="cmim-field">ANÁLISE<select name="review_state">'+options([['reviewing','Em análise'],['corrections','Solicitar ajustes'],['ready','Elenco conferido']],r.review_state||'reviewing')+'</select></label><label class="cmim-field">PAGAMENTO · '+esc(money(c))+'<select name="payment_status">'+options([['pending','Pendente / não conferido'],['confirmed','Confirmado manualmente'],['waived','Isento']],r.payment_status||'pending')+'</select></label></div><label class="cmim-field">MENSAGEM PARA O TIME<textarea name="staff_note" maxlength="1500" rows="2" placeholder="Orientações, ajustes ou motivo de recusa">'+esc(r.staff_note||'')+'</textarea></label><button type="submit" class="cmim-button ghost">Salvar análise</button></form>'}
async function saveReview(form){const fd=new FormData(form),review_state=String(fd.get('review_state')),staff_note=String(fd.get('staff_note')||'').trim();if(review_state==='corrections'&&!staff_note)throw Error('Descreva os ajustes necessários.');await a.call('/rest/v1/cmim_entry_reviews?on_conflict=entry_id',{method:'POST',secure:true,headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:{entry_id:form.dataset.reviewEntry,review_state,payment_status:String(fd.get('payment_status')),staff_note,updated_at:new Date().toISOString()}})}
function renderCircuitAdmin(){
 const denied=$('cv-admin-denied');if(!state.admin){denied.textContent='Acesso exclusivo do administrador.';return}
 denied.hidden=true;$('competition-admin').hidden=false;$('league-reschedule-admin').hidden=false;renderReschedules();
 const selector=$('admin-competition-select'),previous=selector.value;
 selector.innerHTML=state.comps.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.title)+' · '+state.entries.filter(e=>e.competition_id===c.id&&e.status==='pending').length+' pendente(s)</option>').join('');
 if(state.comps.some(c=>c.id===previous))selector.value=previous;else if(state.comps.some(c=>c.id===initialCompetition))selector.value=initialCompetition;
 renderAdminManage();
 if(!document.body.dataset.adminInitialized){document.body.dataset.adminInitialized='1';document.querySelector('[data-admin-screen="manage"]')?.click()}
}
function tournamentGame(m,c){const ta=team(m.team_a_id),tb=team(m.team_b_id);return '<a class="cv-game" href="'+matchHref(m.id)+'"><div class="cv-game-meta">'+esc(roundLabel(c,Number(m.round_number)))+' · MD'+bestOf(c,m)+'</div><div class="cv-game-teams"><span>'+imageTag(ta?.logo_url,'')+readable(m.team_a_id)+'</span><strong>'+(m.status==='approved'?Number(m.score_a)+' : '+Number(m.score_b):'VS')+'</strong><span>'+imageTag(tb?.logo_url,'')+(tb?readable(m.team_b_id):'Folga')+'</span></div><small>'+esc(dateTime(m.scheduled_at))+' · '+esc(label(m.status))+'</small></a>'}
function renderChampionship(){
 const hero=$('cv-champ-hero'),tabs=$('cv-champ-tabs'),body=$('cv-champ-content'),c=competition(championshipId);
 if(!c||c.status==='draft'&&!state.admin){hero.textContent=state.loaded?.comps?'Campeonato não encontrado ou ainda não publicado.':'Não foi possível carregar o campeonato.';tabs.hidden=true;body.innerHTML='<a href="./ligas.html">Voltar aos campeonatos</a>';return}
 document.title=c.title+' | CMIM';
 const entries=state.entries.filter(e=>e.competition_id===c.id&&e.status==='approved'),games=state.matches.filter(m=>m.competition_id===c.id);
 const ownEntry=state.entries.find(e=>e.competition_id===c.id&&own().some(t=>t.id===e.team_id));
 const action=ownEntry?'<a class="cv-btn" href="./meu-time.html#minhas-inscricoes">'+esc(entryLabel(ownEntry.status))+'</a>':c.status==='open'&&(!c.closes_at||Date.parse(c.closes_at)>Date.now())?'<button class="cmim-button" id="cv-register">Solicitar inscrição</button>':'';
 hero.innerHTML='<div class="cv-champ-head"><img src="'+esc(competitionLogo(c))+'" alt=""><div><span class="cv-kicker">'+esc(leagueLabel(c.league_tier))+'</span><h1>'+esc(c.title)+'</h1><p>'+esc(label(c.status))+' · '+esc(label(c.structure))+'</p></div>'+action+'</div><div class="cv-metrics"><div><small>Equipes aprovadas</small><strong>'+entries.length+'/'+esc(c.max_teams)+'</strong></div><div><small>Início</small><strong>'+formatDate(c.starts_at)+'</strong></div><div><small>Inscrições até</small><strong>'+formatDate(c.closes_at)+'</strong></div><div><small>Formato</small><strong>'+esc(seriesLabel(c))+'</strong></div><div><small>Inscrição</small><strong>'+esc(money(c))+'</strong></div></div>';
 $('cv-register')?.addEventListener('click',()=>register(c.id));
 const views=[['visao-geral','Visão geral'],['equipes','Equipes'],['classificacao',hybrid(c)?'Grupos':'Classificação'],['playoffs',hybrid(c)?'Playoffs':'Chaveamento'],['partidas','Partidas'],['regulamento','Regulamento']];
 function show(){const key=views.some(x=>x[0]===location.hash.slice(1))?location.hash.slice(1):'visao-geral';tabs.hidden=false;tabs.innerHTML=views.map(([id,name])=>'<a href="#'+id+'" '+(id===key?'aria-current="page"':'')+'>'+name+'</a>').join('');
  if(key==='equipes'){body.innerHTML='<h2>Equipes homologadas</h2><div class="cv-team-grid">'+entries.map(e=>{const t=team(e.team_id);return '<a class="cv-team" href="./equipe.html?id='+encodeURIComponent(e.team_id)+'">'+imageTag(t?.logo_url,'Logo')+'<strong>'+readable(e.team_id)+'</strong></a>'}).join('')+'</div>'+(entries.length?'':'<p>Nenhuma equipe aprovada.</p>');}
  else if(key==='classificacao'){body.innerHTML=hybrid(c)?hybridTables(c):'<h2>Classificação</h2><div class="cmim-table-wrap"><table class="cmim-table"><thead><tr><th>Pos.</th><th>Equipe</th><th>V</th><th>D</th><th>Mapas</th><th>Pontos</th></tr></thead><tbody>'+standings(c.id).map((t,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(t.team)+'</td><td>'+t.wins+'</td><td>'+t.losses+'</td><td>'+t.mapsWon+'/'+t.mapsLost+'</td><td>'+t.points+'</td></tr>').join('')+'</tbody></table></div>';}
  else if(key==='playoffs'){body.innerHTML=hybrid(c)?playoffPreview(games):'<h2>Confrontos por rodada</h2><div class="cmim-bracket">'+[...new Set(games.map(m=>m.round_number))].sort((a,b)=>a-b).map(r=>'<section class="cmim-bracket-round"><h4>'+esc(roundLabel(c,r))+'</h4>'+games.filter(m=>m.round_number===r).map(m=>tournamentGame(m,c)).join('')+'</section>').join('')+'</div>'+(games.length?'':'<p>Chaveamento ainda não publicado.</p>');}
  else if(key==='partidas'){body.innerHTML='<h2>Partidas oficiais</h2><div class="cv-game-grid">'+games.map(m=>tournamentGame(m,c)).join('')+'</div>'+(games.length?'':'<p>Partidas ainda não publicadas.</p>');}
  else if(key==='regulamento'){body.innerHTML='<h2>Regulamento</h2><p class="cv-pre">'+esc(c.rules||c.description||'Regulamento ainda não divulgado.')+'</p>'+(c.league_tier==='open'?'<a class="cv-btn" href="./regulamento-open.html">Regulamento oficial do Open</a>':'');}
  else {body.innerHTML=(ownEntry?'<section class="cv-review-note"><h3>Minha inscrição · '+esc(entryLabel(ownEntry.status))+'</h3>'+entryReviewText(ownEntry)+'</section>':'')+(/^https:\/\//i.test(c.broadcast_url||'')?'<a class="cv-btn" href="'+esc(c.broadcast_url)+'" target="_blank" rel="noopener noreferrer">Assistir transmissão oficial ↗</a>':'')+'<h2>Sobre o campeonato</h2><p class="cv-pre">'+esc(c.description||'Detalhes serão divulgados pela organização.')+'</p><h2>Próximos confrontos</h2><div class="cv-game-grid">'+games.filter(m=>m.status!=='approved').slice(0,6).map(m=>tournamentGame(m,c)).join('')+'</div>'+(!games.some(m=>m.status!=='approved')?'<p>Nenhum próximo confronto publicado.</p>':'')+'<p><a class="cv-btn" href="#partidas">Todas as partidas →</a></p>';}
 }
 window.onhashchange=show;show();
}
function renderOverview(){
 const target=$('competition-overview'),comp=competition($('selected-competition').value);
 if(!comp){target.innerHTML=state.league==='all'||state.league==='open'?emptyFormatPreview():'<p class="cmim-muted">Formato ainda não publicado para esta liga.</p>';return}
 const list=state.matches.filter(m=>m.competition_id===comp.id),rank=standings(comp.id);
 let html=compLogoTag(comp)+'<p class="cmim-muted">'+esc(comp.description||'')+'</p>'+
  '<div><span class="cmim-badge">'+esc(label(comp.structure))+'</span><span class="cmim-badge">'+esc(seriesLabel(comp))+'</span><span class="cmim-badge">'+esc(label(comp.status))+'</span></div>';
 if(hybrid(comp))html+=hybridTables(comp)+playoffPreview(list);else if(!rank.length)html+='<h3>TABELA DE CLASSIFICAÇÃO</h3><div class="cmim-table-wrap"><table class="cmim-table"><thead><tr><th>#</th><th>Equipe</th><th>V</th><th>D</th><th>Pontos</th></tr></thead><tbody>'+Array.from({length:Math.min(128,Number(comp.max_teams)||16)},(_,i)=>'<tr><td>'+(i+1)+'</td><td>Vaga a definir</td><td>0</td><td>0</td><td>0</td></tr>').join('')+'</tbody></table></div>';else if(rank.length)html+='<h3 style="color:#ffe58c">TABELA DE CLASSIFICAÇÃO</h3><div class="cmim-table-wrap"><table class="cmim-table"><thead><tr><th>Pos.</th><th>Time</th><th>V</th><th>D</th><th>Mapas</th><th>Pontos</th><th>Buchholz</th><th>Folgas</th></tr></thead><tbody>'+rank.map((t,i)=>'<tr><td>'+(i+1)+'º</td><td>'+esc(t.team)+'</td><td>'+t.wins+'</td><td>'+t.losses+'</td><td>'+t.mapsWon+'/'+t.mapsLost+'</td><td>'+t.points+'</td><td>'+t.buchholz+'</td><td>'+t.byes+'</td></tr>').join('')+'</tbody></table></div>';
 if(list.length){
  const rounds=[...new Set(list.map(m=>m.round_number))].sort((a,b)=>a-b);
  html+='<h3 class="cmim-bracket-title">CHAVEAMENTO POR RODADAS</h3>'+
   '<p class="cmim-muted">Os confrontos abaixo refletem os registros oficiais de cada rodada.</p>'+
   '<div class="cmim-bracket" role="region" aria-label="Confrontos por rodada">'+rounds.map(round=>
    '<section class="cmim-bracket-round" aria-label="'+esc(roundLabel(comp,round))+'"><h4>'+esc(roundLabel(comp,round))+'</h4>'+
    list.filter(m=>m.round_number===round).map(m=>
      '<article class="cmim-bracket-match"><span class="cmim-bracket-status">'+esc((hybrid(comp)&&round<=3?'Grupo '+groupLabel(m)+' · ':'')+(m.team_b_id?'MD'+bestOf(comp,m)+' · '+label(m.status)+' · '+dateTime(m.scheduled_at):'FOLGA'))+'</span>'+
      '<div class="cmim-bracket-team"><b>'+teamLink(m.team_a_id)+'</b><strong>'+(m.status==='approved'?Number(m.score_a):'—')+'</strong></div>'+
      '<div class="cmim-bracket-team"><b>'+(m.team_b_id?teamLink(m.team_b_id):'FOLGA · AVANÇA')+'</b><strong>'+(m.team_b_id&&m.status==='approved'?Number(m.score_b):'—')+'</strong></div>'+
      (m.room_id?'<a class="cmim-match-link" href="./selecao.html?room='+encodeURIComponent(m.room_id)+'">▶ Assistir seleção</a>':'')+
      '</article>').join('')+'</section>').join('')+'</div>';
 }
 else html+='<div class="cmim-empty" style="margin-top:18px">Nenhuma rodada gerada ainda. O ADM pode abrir a competição e criar os confrontos.</div>';
 const final=hybrid(comp)&&list.find(m=>m.round_number===6&&m.status==='approved');
 if(final)html+='<h3>🏆 CAMPEÃO: '+teamLink(final.winner_id)+'</h3><p>VICE-CAMPEÃO: '+teamLink(final.winner_id===final.team_a_id?final.team_b_id:final.team_a_id)+'</p>';
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
if($('selected-competition'))$('selected-competition').onchange=e=>{state.selected=e.target.value;renderOverview()};
if($('create-squad'))$('create-squad').onsubmit=async e=>{
 e.preventDefault();if(!state.me){a.gotoLogin();return}
 const form=e.currentTarget,btn=form.querySelector('button'),f=new FormData(form);btn.disabled=true;
 try{const photo=f.get('player_photo');if(photo?.size)await a.uploadAvatar(photo);else if(!myProfile()?.avatar_url)throw Error('Sua foto é obrigatória.');const logo_url=await a.uploadTeamLogo(f.get('logo'));await a.call('/rest/v1/cmim_squads',{method:'POST',secure:true,headers:{Prefer:'return=representation'},body:{
  name:f.get('name'),short_name:String(f.get('short_name')).toUpperCase(),captain_lane:f.get('captain_lane'),owner_id:state.me.id,logo_url
 }});form.reset();await read();status('✓ Time criado. Convide jogadores pelo formulário acima.')}
 catch(err){status('Não foi possível criar o time: '+safeErr(err),true)}finally{btn.disabled=false}
};
function groupEditor(comp,entries){
 const approved=entries.filter(e=>e.status==='approved');
 const saved=Array.isArray(comp.group_team_order)?comp.group_team_order:Array(16).fill(null);
 const options='<option value="">Escolher equipe</option>'+approved.map(e=>'<option value="'+esc(e.team_id)+'">'+readable(e.team_id)+'</option>').join('');
 return '<section class="cmim-cup" id="hybrid-group-editor" style="margin:18px 0"><h3 style="color:#ffe58c">MONTAGEM DOS GRUPOS</h3>'+
 '<p class="cmim-muted">Monte manualmente durante a live ou sorteie automaticamente. Salve os grupos antes de gerar a primeira rodada. '+approved.length+'/16 equipes aprovadas.</p>'+
 '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">'+['A','B','C','D'].map((group,g)=>'<div class="cmim-match" style="display:block"><h4>GRUPO '+group+'</h4>'+Array.from({length:4},(_,i)=>'<label class="cmim-field">VAGA '+(i+1)+'<select data-group-slot="'+(g*4+i)+'">'+options+'</select></label>').join('')+'</div>').join('')+'</div>'+
 '<p id="hybrid-group-count" class="cmim-muted"></p><div class="cmim-actions"><button type="button" class="cmim-button ghost" id="hybrid-draw" '+(approved.length!==16?'disabled':'')+'>SORTEIO AUTOMÁTICO</button><button type="button" class="cmim-button ghost" id="hybrid-clear">LIMPAR GRUPOS</button><button type="button" class="cmim-button" id="hybrid-save">SALVAR GRUPOS</button></div>'+
 '<p class="cmim-muted">Os grupos salvos podem ser editados até a primeira rodada. Vagas vazias podem ser salvas durante o sorteio.</p></section>';
}
function bindGroupEditor(comp,entries){
 const editor=$('hybrid-group-editor');if(!editor)return;
 const slots=[...editor.querySelectorAll('[data-group-slot]')];
 const approved=entries.filter(e=>e.status==='approved').map(e=>e.team_id);
 const saved=Array.isArray(comp.group_team_order)?comp.group_team_order:Array(16).fill(null);
 slots.forEach((select,i)=>select.value=approved.includes(saved[i])?saved[i]:'');
 const values=()=>slots.map(el=>el.value||null);
 const update=()=>{
  const selected=values();
  slots.forEach(select=>[...select.options].forEach(option=>option.disabled=!!option.value&&option.value!==select.value&&selected.includes(option.value)));
  const count=selected.filter(Boolean).length;
  const dirty=JSON.stringify(selected)!==JSON.stringify(saved);
  $('hybrid-group-count').textContent=count+'/16 vagas preenchidas · '+(dirty?'Alterações não salvas':'Grupos salvos');
  $('generate-round').disabled=count!==16||dirty||approved.length!==16;
 };
 slots.forEach(select=>select.addEventListener('change',update));
 $('hybrid-draw').onclick=()=>{
  if(approved.length!==16)return;
  if(values().some(Boolean)&&!confirm('Substituir a montagem atual por um novo sorteio?'))return;
  const shuffled=[...approved];
  for(let i=shuffled.length-1;i>0;i--){
   const n=i+1,limit=Math.floor(4294967296/n)*n,buffer=new Uint32Array(1);
   do{crypto.getRandomValues(buffer)}while(buffer[0]>=limit);
   const j=buffer[0]%n;[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  slots.forEach((select,i)=>select.value=shuffled[i]);update();
 };
 $('hybrid-clear').onclick=()=>{if(confirm('Limpar todas as vagas? Salve para confirmar.')){slots.forEach(el=>el.value='');update()}};
 $('hybrid-save').onclick=async()=>{
  const selected=values(),filled=selected.filter(Boolean);
  if(new Set(filled).size!==filled.length)return status('Equipe duplicada.',true);
  const btn=$('hybrid-save');btn.disabled=true;
  try{await a.call('/rest/v1/cmim_competitions?id=eq.'+comp.id,{method:'PATCH',secure:true,body:{group_team_order:selected},headers:{Prefer:'return=representation'}}).then(rows=>{if(!Array.isArray(rows)||rows.length!==1)throw Error('Não foi possível confirmar o salvamento.');});await read();status('✓ Grupos salvos: '+filled.length+'/16 vagas.')}
  catch(e){status(safeErr(e),true)}finally{btn.disabled=false}
 };
 update();
}
function renderAdminManage(){
 if(!state.admin)return;
 const comp=competition($('admin-competition-select').value),box=$('admin-competition-body');
 if(!comp){box.innerHTML='<div class="cmim-empty">Cadastre um campeonato antes de administrar.</div>';return}
 const entries=state.entries.filter(e=>e.competition_id===comp.id).sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending')||String(a.created_at).localeCompare(String(b.created_at)));
 const games=state.matches.filter(m=>m.competition_id===comp.id),currentRound=Math.max(0,...games.map(g=>g.round_number));
 box.innerHTML=compLogoTag(comp)+'<form class="cmim-form-row" id="competition-logo-form"><label class="cmim-field">LOGO DO CAMPEONATO<input type="file" name="logo" accept="image/jpeg,image/png,image/webp" required></label><button class="cmim-button ghost">Salvar logo</button></form><div class="cmim-actions">'+['draft','open','closed','live','finished'].map(s=>'<button data-comp-status="'+s+'" class="cmim-button '+(comp.status===s?'':'ghost')+'">'+esc(label(s))+'</button>').join('')+'</div>'+
 '<details class="cv-settings"><summary>Configurações do campeonato · inscrição, elenco e transmissão</summary><form id="cv-event-settings"><div class="cmim-form-row"><label class="cmim-field">VALOR DA INSCRIÇÃO (R$)<input name="fee" type="number" min="0" max="100000" step="0.01" value="'+(comp.registration_fee_cents==null?'':comp.registration_fee_cents/100)+'" placeholder="A divulgar"></label><label class="cmim-field">ENCERRAMENTO DAS INSCRIÇÕES<input name="closes_at" type="datetime-local" value="'+timeInput(comp.closes_at)+'"></label><label class="cmim-field">LINK DA TRANSMISSÃO (HTTPS)<input name="broadcast_url" type="url" maxlength="1000" value="'+esc(comp.broadcast_url||'')+'" placeholder="https://..."></label></div><label><input type="checkbox" name="lock_roster" '+(comp.lock_roster_at_close?'checked':'')+'> Bloquear inclusão/remoção de jogadores e troca de lane após o prazo (titular/reserva continua permitido)</label><p class="cmim-muted">Pagamentos são conferidos manualmente pela organização; não há cobrança automática.</p><button class="cmim-button ghost">Salvar configurações</button></form></details>'+
 '<h3 style="color:#ffe08d">ANÁLISE DE INSCRIÇÕES · '+entries.filter(e=>e.status==='pending').length+' PENDENTE(S)</h3><p class="cmim-muted">Somente equipes aprovadas pelo ADM entram na competição. Confira o elenco e os requisitos antes de homologar.</p><p>'+entries.filter(e=>e.status==='approved').length+'/'+comp.max_teams+' aprovadas · '+entries.filter(e=>e.status==='rejected').length+' recusadas</p>'+
 (entries.length?entries.map(e=>'<div class="cmim-match">'+imageTag(team(e.team_id)?.logo_url,'Logo')+teamLink(e.team_id)+' · '+esc(entryLabel(e.status))+'<p>'+startersFor(e.team_id).length+'/5 titulares · '+membersFor(e.team_id).length+'/10 jogadores</p><a href="./equipe.html?id='+encodeURIComponent(e.team_id)+'" target="_blank" rel="noopener">CONFERIR ELENCO E FOTOS ↗</a>'+
 (e.status==='pending'?reviewForm(e,comp):entryReviewText(e))+'<div class="cmim-actions">'+(e.status==='pending'?'<button class="cmim-button" data-entry="'+e.id+'" data-entry-status="approved">✓ Aprovar time</button><button class="cmim-button ghost" data-entry="'+e.id+'" data-entry-status="rejected">Rejeitar</button>':'')+'</div></div>').join(''):'<p class="cmim-muted">Sem inscrições.</p>')+
 (hybrid(comp)&&currentRound===0?groupEditor(comp,entries):'')+
 '<div class="cmim-actions" style="margin-top:21px"><button id="generate-round" class="cmim-button">⚔ GERAR '+(comp.structure==='liga'?'TABELA DA LIGA':'PRÓXIMA RODADA')+'</button><span class="cmim-muted">Rodada atual: '+currentRound+'</span></div>'+
  '<div class="cmim-form-row" style="margin-top:12px"><label class="cmim-field">DATA/HORA PARA A PRÓXIMA RODADA (OPCIONAL)<input id="next-round-start" type="datetime-local" value="'+(currentRound===0&&comp.league_tier!=='open'?timeInput(comp.starts_at):'')+'"></label></div>'+
  '<p class="cmim-muted">Partidas geradas entram na agenda. A data informada vale para a rodada, mas pode ser ajustada por jogo.</p>'+
  (currentRound?'<div class="cmim-form-row"><label class="cmim-field">REAGENDAR RODADA<select id="bulk-round-number">'+[...new Set(games.map(g=>g.round_number))].sort((a,b)=>a-b).map(round=>'<option value="'+round+'">Rodada '+round+'</option>').join('')+'</select></label><label class="cmim-field">NOVO DIA E HORÁRIO<input id="bulk-round-start" type="datetime-local"></label><button type="button" id="bulk-round-save" class="cmim-button ghost">SALVAR HORÁRIO DA RODADA</button></div>':'')+
 (hybrid(comp)?hybridTables(comp):'')+
 (hybrid(comp)&&currentRound===3&&games.filter(g=>g.status==='approved').length===24?'<h3>DESEMPATES CIRCULARES</h3><p class="cmim-muted">Registre a ordem obtida em partidas extras de desempate (1 = melhor). Use números diferentes para cada time empatado.</p>'+hybridStandings(comp.id).groups.map(g=>g.rows.filter(t=>t.unresolved||t.tie!==null).map(t=>'<div class="cmim-match">Grupo '+g.group+' · '+teamLink(t.id)+' <button type="button" class="cmim-button ghost" data-tiebreak="'+t.id+'">Ordem: '+(t.tie??'definir')+'</button></div>').join('')).join(''):'')+
 '<h3 style="color:#ffe08d">CONFRONTOS</h3>'+
 (games.length?games.map(g=>'<form class="cmim-match" data-match-edit="'+g.id+'"><b>'+esc(roundLabel(comp,Number(g.round_number)))+(hybrid(comp)&&g.round_number<=3?' · Grupo '+groupLabel(g):'')+' · MD'+bestOf(comp,g)+' · Jogo '+g.match_number+'</b>'+
 '<p>'+readable(g.team_a_id)+' × '+(g.team_b_id?readable(g.team_b_id):'FOLGA')+'</p>'+
  (g.team_b_id?'<div class="cmim-form-row"><label class="cmim-field">DATA E HORA (BRASÍLIA)<input type="datetime-local" name="scheduled_at" value="'+timeInput(g.scheduled_at)+'"></label><button type="button" class="cmim-button ghost" data-save-schedule="'+g.id+'">SALVAR DIA/HORA</button></div>':'')+
 (hybrid(comp)&&comp.league_tier==='open'&&g.round_number<=3&&!games.some(m=>m.round_number>=4)&&g.team_b_id?'<div class="cmim-form-row"><label class="cmim-field">DURAÇÃO DA VITÓRIA (SEGUNDOS)<input type="number" min="1" max="21600" name="victory_seconds" value="'+(g.victory_seconds??'')+'" placeholder="Ex.: 1800 para 30 min"></label><label class="cmim-field"><input name="is_walkover" type="checkbox" '+(g.is_walkover?'checked':'')+'> Vitória por W.O.</label><button type="button" data-save-victory="'+g.id+'" class="cmim-button ghost">SALVAR DADOS DE DESEMPATE</button></div>':'')+
 '<div class="cmim-form-row"><label class="cmim-field">PLACAR A<input name="score_a" type="number" min="0" max="5" value="'+g.score_a+'"></label><label class="cmim-field">PLACAR B<input name="score_b" type="number" min="0" max="5" value="'+g.score_b+'"></label>'+
 '<label class="cmim-field">STATUS<select name="status">'+['scheduled','live','pending','approved'].map(x=>'<option value="'+x+'" '+(g.status===x?'selected':'')+'>'+esc(label(x))+'</option>').join('')+'</select></label>'+
 '</div>'+
 '<div class="cmim-actions">'+(g.status==='approved'?'<span class="cmim-badge">✓ RESULTADO HOMOLOGADO (BLOQUEADO)</span>':'<button class="cmim-button ghost">SALVAR RESULTADO</button>')+
 (g.team_b_id&&g.status!=='approved'?(!g.room_id?
  '<button type="button" class="cmim-button" data-launch-match="'+g.id+'">🎮 CRIAR SELEÇÃO MD'+bestOf(comp,g)+'</button>':
  '<button type="button" class="cmim-button" data-sync-match="'+g.id+'">✓ SINCRONIZAR JOGO HOMOLOGADO</button><a class="cmim-button ghost" href="./admin.html?tab=matches">APROVAR NO ADM ↗</a>'):
  (g.team_b_id?'':'<span class="cmim-badge">FOLGA AUTOMÁTICA</span>'))+
 '</div></form>').join(''):'<p class="cmim-muted">Confrontos ainda não criados.</p>');
 $('competition-logo-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button');b.disabled=true;try{const cover_url=await a.uploadTeamLogo(new FormData(form).get('logo'));await a.call('/rest/v1/cmim_competitions?id=eq.'+comp.id,{method:'PATCH',secure:true,body:{cover_url}});await read();status('Logo atualizada.')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}};
 box.querySelectorAll('[data-save-victory]').forEach(b=>b.onclick=async()=>{const form=b.closest('form'),fd=new FormData(form),is_walkover=fd.has('is_walkover'),raw=fd.get('victory_seconds');const victory_seconds=is_walkover||!raw?null:Number(raw);if(victory_seconds!==null&&(!Number.isInteger(victory_seconds)||victory_seconds<1||victory_seconds>21600))return status('Duração inválida.',true);b.disabled=true;try{await a.call('/rest/v1/cmim_competition_matches?id=eq.'+b.dataset.saveVictory,{method:'PATCH',secure:true,body:{victory_seconds,is_walkover}});await read();status('Dados de desempate atualizados.')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}});
 box.querySelectorAll('[data-comp-status]').forEach(b=>b.onclick=async()=>{
  if(!confirm('Alterar situação de '+comp.title+' para '+label(b.dataset.compStatus)+'?'))return;
  try{await a.call('/rest/v1/cmim_competitions?id=eq.'+comp.id,{method:'PATCH',secure:true,body:{status:b.dataset.compStatus}});await read()}catch(e){status(safeErr(e),true)}
 });
 $('cv-event-settings').onsubmit=async ev=>{ev.preventDefault();const form=ev.currentTarget,fd=new FormData(form),btn=form.querySelector('button');btn.disabled=true;try{const fee=String(fd.get('fee')||'').trim(),broadcast=String(fd.get('broadcast_url')||'').trim(),closes=toISO(fd.get('closes_at'));if(broadcast&&!/^https:\/\//i.test(broadcast))throw Error('Informe um link HTTPS.');if(fd.has('lock_roster')&&!closes)throw Error('Defina a data limite antes de bloquear elencos.');await a.call('/rest/v1/cmim_competitions?id=eq.'+comp.id,{method:'PATCH',secure:true,headers:{Prefer:'return=representation'},body:{registration_fee_cents:fee===''?null:Math.round(Number(fee)*100),closes_at:closes,lock_roster_at_close:fd.has('lock_roster'),broadcast_url:broadcast||null}});await read();status('Configurações salvas.')}catch(e){status(safeErr(e),true)}finally{btn.disabled=false}};
 box.querySelectorAll('[data-review-entry]').forEach(form=>form.onsubmit=async ev=>{ev.preventDefault();const btn=form.querySelector('button');btn.disabled=true;try{await saveReview(form);await read();status('Análise salva. A equipe pode acompanhar em Meu Time.')}catch(e){status(safeErr(e),true)}finally{btn.disabled=false}});
 box.querySelectorAll('[data-entry]').forEach(b=>b.onclick=async()=>{
  if(!confirm(b.dataset.entryStatus==='approved'?'Aprovar a inscrição desta equipe?':'Recusar a inscrição desta equipe?'))return;b.disabled=true;try{const form=box.querySelector('[data-review-entry="'+b.dataset.entry+'"]');if(form){if(b.dataset.entryStatus==='rejected'&&!form.elements.staff_note.value.trim())throw Error('Informe o motivo da recusa.');if(b.dataset.entryStatus==='approved'){if(form.elements.review_state.value==='corrections')throw Error('Resolva os ajustes antes de aprovar.');form.elements.review_state.value='ready';}await saveReview(form)}const result=await a.call('/rest/v1/cmim_competition_entries?id=eq.'+b.dataset.entry+'&status=eq.pending',{method:'PATCH',secure:true,headers:{Prefer:'return=representation'},body:{status:b.dataset.entryStatus}});if(!Array.isArray(result)||result.length!==1||result[0].status!==b.dataset.entryStatus)throw Error('A inscrição não foi alterada. Atualize a página.');await read();status(b.dataset.entryStatus==='approved'?'Equipe aprovada para o torneio.':'Inscrição recusada.')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}
 });
 box.querySelectorAll('[data-tiebreak]').forEach(b=>b.onclick=async()=>{
  const entry=entries.find(e=>e.team_id===b.dataset.tiebreak);
  const value=prompt('Ordem do desempate (1 a 4; vazio para limpar):',entry.group_tiebreak??'');
  if(value===null)return;
  if(value.trim()!==''&&!/^[1-4]$/.test(value.trim()))return status('Informe um número de 1 a 4.',true);
  b.disabled=true;
  try{await a.call('/rest/v1/cmim_competition_entries?id=eq.'+entry.id,{method:'PATCH',secure:true,body:{group_tiebreak:value.trim()===''?null:Number(value)}});await read();status('Ordem de desempate registrada.')}catch(e){status(safeErr(e),true)}finally{b.disabled=false}
 });
 $('generate-round').onclick=()=>generateRound(comp);
 if(hybrid(comp)&&currentRound===0)bindGroupEditor(comp,entries);
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
  const needed=(bestOf(comp,match)+1)/2;
  if(statusValue==='approved'&&match.room_id)return status('Esta sala vinculada só pode ser homologada pelo botão SINCRONIZAR.',true);
  if(statusValue==='approved'&&!(Math.max(score_a,score_b)===needed&&Math.min(score_a,score_b)<needed))
   return status('Para aprovar MD'+bestOf(comp,match)+', um time precisa de '+needed+' vitória(s).',true);
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
  const squad=team(teamId),members=startersFor(teamId);
  if(!squad||members.length!==5)throw Error('A equipe '+(squad?.name||'?')+' precisa de cinco titulares.');
  const lineup=lanes.map(l=>members.find(m=>m.lane===l));
  if(lineup.some(x=>!x)||new Set(lineup.map(x=>x.user_id)).size!==5)
   throw Error('A equipe '+squad.name+' precisa de um jogador diferente em cada lane.');
  const profiles=lineup.map(x=>state.profiles.find(p=>p.id===x.user_id));
  if(profiles.some(x=>!x))throw Error('Uma conta não foi encontrada no elenco.');
  const pending=profiles.filter(p=>!p.rank_player_id||!p.rank_verified_at);
  if(pending.length)throw Error('Vincule ao Ranking as contas: '+pending.map(p=>p.nick+'#'+p.tag).join(', ')+'.');
  const captain=state.profiles.find(p=>p.id===squad.owner_id)?.nick||profiles[0].nick;
  return {name:squad.name,logo:squad.logo_url||'',captain,
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
  const payload={teams,games:bestOf(comp,match),mode:'Normal',duration:30,first:'B',pilot:true,
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
if($('admin-competition-select'))$('admin-competition-select').onchange=renderAdminManage;
document.querySelectorAll('[data-admin-screen]').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('[data-admin-screen]').forEach(x=>x.classList.toggle('active',x===b));
 $('admin-comp-create').hidden=b.dataset.adminScreen!=='create';
 $('admin-comp-manage').hidden=b.dataset.adminScreen!=='manage';renderAdminManage();
});
const createForm=$('admin-comp-create');
const updateHybridFields=()=>{
 const isHybrid=createForm.elements.structure.value==='liga_mata_mata';
 for(const key of ['series_games','max_teams','swiss_rounds'])createForm.elements[key].disabled=isHybrid;
 if(isHybrid){createForm.elements.series_games.value='1';createForm.elements.max_teams.value='16';}
 const hint=$('hybrid-format-hint');if(hint)hint.hidden=!isHybrid;
};
if(createForm){createForm.elements.structure.addEventListener('change',updateHybridFields);
createForm.addEventListener('reset',()=>setTimeout(updateHybridFields,0));
updateHybridFields();
$('admin-comp-create').onsubmit=async e=>{
 e.preventDefault();if(!state.admin)return;
 const form=e.currentTarget,btn=form.querySelector('button'),f=new FormData(form);
 btn.disabled=true;
 try{
  const logo=f.get('cover');const cover_url=logo?.size?await a.uploadTeamLogo(logo):null;
  await a.call('/rest/v1/cmim_competitions',{method:'POST',secure:true,body:{cover_url,closes_at:toISO(f.get('closes_at')),
   title:txt(f.get('title')).trim(),description:txt(f.get('description')).trim(),structure:f.get('structure'),league_tier:txt(f.get('league_tier')).toLowerCase(),
   series_games:f.get('structure')==='liga_mata_mata'?1:Number(f.get('series_games')),format:'MD'+(f.get('structure')==='liga_mata_mata'?1:f.get('series_games')),starts_at:toISO(f.get('starts_at')),
   max_teams:f.get('structure')==='liga_mata_mata'?16:Number(f.get('max_teams')),swiss_rounds:Number(f.get('swiss_rounds')||5),status:f.get('status')
  }});
  form.reset();status('✓ Campeonato criado.');await read();
 }catch(err){status('Erro ao cadastrar: '+safeErr(err),true)}finally{btn.disabled=false}
};}
try{
 state.me=await a.user();
 state.admin=state.me?.app_metadata?.cmim_admin===true;
 if(mode==='admin'&&!state.admin){$('cv-admin-denied').textContent='Área exclusiva de administradores. Entre com uma conta autorizada.';return;}
 if(mode==='hub'&&safeTeamId(initialCompetition)){location.replace(eventHref(initialCompetition)+(location.hash==='#chaveamentos'?'#classificacao':''));return;}
 const date=new Date();date.setDate(date.getDate()+7);if(createForm)createForm.querySelector('[name=starts_at]').value=date.toISOString().slice(0,16);
 await read();
 }catch(e){
  if(!state.me){$('champ-status').textContent=myPage?'Entre na sua conta para acessar seu time.':'Você pode conhecer as ligas sem login. Para utilizar equipes e inscrições, entre na sua conta.';}
  else status('Falha ao consultar campeonatos: '+safeErr(e),true);
 }
});
