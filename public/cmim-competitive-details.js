/* CMIM Competitive Profiles — pages generated from real Supabase public records. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const mode=document.body?.dataset?.competitiveDetail;
 if(!['league','team'].includes(mode))return;
 const A=window.CMIMAuth;
 const esc=A?.esc||((v)=>String(v??'').replace(/[&<>"']/g,''));
 const leagues={
  open:{name:'CMIM Open',subtitle:'A porta de entrada do cenário competitivo.',description:'Equipes e confrontos oficiais da categoria de entrada do circuito CMIM.',logo:'./assets/branding/cmim-open.webp'},
  academy:{name:'CMIM Academy',subtitle:'A evolução faz parte do jogo.',description:'Uma categoria de desenvolvimento, consistência e crescimento das equipes do circuito.',logo:'./assets/branding/cmim-academy.webp'},
  major:{name:'CMIM Major',subtitle:'O palco principal do competitivo.',description:'O espaço das disputas de maior destaque do circuito de equipes CMIM.',logo:'./assets/branding/cmim-major.webp'}
 };
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const q=new URLSearchParams(location.search);
 const leagueKey=q.get('liga'),teamId=q.get('id');
 const statusLabels={draft:'Rascunho',open:'Inscrições abertas',closed:'Inscrições encerradas',live:'Em andamento',finished:'Finalizado',pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',scheduled:'Agendado'};
 const fmtStatus=x=>statusLabels[x]||'Status não informado';
 const fmtDate=x=>{if(!x)return 'Data a definir';const d=new Date(x);return Number.isNaN(+d)?'Data a definir':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
 const safeImage=value=>{if(typeof value!=='string'||value.length>1000)return '';try{const url=new URL(value,location.href);return url.protocol==='https:'?url.href:''}catch{return ''}};
 const leagueName=x=>leagues[x]?.name||'Circuito CMIM';
 const urlTeam=id=>uuid.test(id||'')?'./equipe.html?id='+encodeURIComponent(id):'./ligas.html#equipes-oficiais';
 const teamLink=(team)=>team?'<a href="'+urlTeam(team.id)+'">'+esc(team.name)+'</a>':'Equipe a definir';
 const empty=(message,failed=false)=>'<div class="cmim-detail-empty'+(failed?' cmim-detail-error':'')+'">'+esc(message)+'</div>';
 const get=path=>A.call('/rest/v1/'+path);
 let data=null,ok={};
 function metric(label,value,desc=''){return '<div class="cmim-detail-metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(desc)+'</span></div>';}
 function linkEvent(c){return './ligas.html?liga='+encodeURIComponent(c.league_tier||'all')+'#chaveamentos';}
 function matchesFor(compIds){return data.matches.filter(m=>compIds.has(m.competition_id));}
 function approvedFor(compIds){return data.entries.filter(e=>compIds.has(e.competition_id)&&e.status==='approved');}
 function finishedGames(matches){return matches.filter(m=>m.status==='approved'&&m.team_b_id&&m.winner_id);}
 function gameCard(m){
  const ca=data.comps.find(c=>c.id===m.competition_id),a=data.squads.find(t=>t.id===m.team_a_id),b=data.squads.find(t=>t.id===m.team_b_id);
  const official=m.status==='approved';
  return '<article class="cmim-detail-match">'+
   '<div class="team-a"><strong>'+teamLink(a)+'</strong></div>'+
   '<div class="result">'+(official?Number(m.score_a)+' × '+Number(m.score_b):'VS')+'<small>'+esc(fmtStatus(m.status))+'</small></div>'+
   '<div class="team-b"><strong>'+teamLink(b)+'</strong></div>'+
   '<div class="meta"><span>'+esc(ca?.title||'Competição CMIM')+'</span><span>Rodada '+Number(m.round_number||0)+'</span><span>'+esc(m.scheduled_at?fmtDate(m.scheduled_at):'Horário a definir')+'</span></div></article>';
 }
 function standings(comp){
  const registered=data.entries.filter(e=>e.competition_id===comp.id&&e.status==='approved');
  const teamIds=[...new Set(registered.map(e=>e.team_id))];
  const rows=teamIds.map(id=>({id,team:data.squads.find(t=>t.id===id),w:0,l:0,p:0,mapW:0,mapL:0,played:0,byes:0,buchholz:0}));
  const approved=data.matches.filter(m=>m.competition_id===comp.id&&m.status==='approved');
  for(const m of approved){
    const aa=rows.find(x=>x.id===m.team_a_id),bb=rows.find(x=>x.id===m.team_b_id);
    if(!bb){if(aa&&m.winner_id===aa.id){aa.p+=3;aa.byes++}continue}
    if(!aa)continue;
    aa.played++;bb.played++;aa.mapW+=Number(m.score_a||0);aa.mapL+=Number(m.score_b||0);
    bb.mapW+=Number(m.score_b||0);bb.mapL+=Number(m.score_a||0);
    if(m.winner_id===aa.id){aa.w++;aa.p+=3;bb.l++}
    else if(m.winner_id===bb.id){bb.w++;bb.p+=3;aa.l++}
  }
  for(const m of approved.filter(x=>x.team_b_id)){
    const aa=rows.find(x=>x.id===m.team_a_id),bb=rows.find(x=>x.id===m.team_b_id);
    if(aa&&bb){aa.buchholz+=bb.p;bb.buchholz+=aa.p}
  }
  return rows.sort((a,b)=>b.p-a.p||b.buchholz-a.buchholz||(b.mapW-b.mapL)-(a.mapW-a.mapL)||b.w-a.w||(a.team?.name||'').localeCompare(b.team?.name||'','pt-BR'));
 }
 function standingsMarkup(comp){
  const rows=standings(comp);
  if(!rows.length)return empty('Ainda não existem equipes homologadas nesta competição.');
  return '<div class="cmim-detail-table-wrap"><table class="cmim-detail-table"><thead><tr><th>#</th><th>EQUIPE</th><th>J</th><th>V</th><th>D</th><th>MAPAS</th><th>PTS</th><th>BUCHHOLZ</th><th>FOLGAS</th></tr></thead><tbody>'+
    rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+teamLink(r.team)+'</td><td>'+r.played+'</td><td>'+r.w+'</td><td>'+r.l+'</td><td>'+r.mapW+':'+r.mapL+'</td><td><strong>'+r.p+'</strong></td><td>'+r.buchholz+'</td><td>'+r.byes+'</td></tr>').join('')+
    '</tbody></table></div>';
 }
 function setHero({title,eyebrow,description,logo,league,labels=[],cta=[]}){
  const hero=$('detail-hero');
  if(league)hero.dataset.league=league;
  hero.innerHTML='<img src="'+esc(logo)+'" alt="Emblema '+esc(title)+'">'+
   '<div class="cmim-detail-hero-content"><span class="eyebrow">'+esc(eyebrow)+'</span><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p>'+
   '<div class="cmim-detail-tags">'+labels.map(x=>'<span class="cmim-detail-tag">'+esc(x)+'</span>').join('')+'</div>'+
   '<div class="cmim-detail-cta">'+cta.map((c,i)=>'<a href="'+esc(c.href)+'"'+(i?' class="secondary"':'')+'>'+esc(c.label)+'</a>').join('')+'</div></div>';
  document.title=title+' | CMIM Competitive Circuit';
 }
 function renderLeague(key){
  const league=leagues[key];
  const comps=data.comps.filter(c=>c.league_tier===key);
  const ids=new Set(comps.map(c=>c.id));
  const entries=approvedFor(ids);
  const teams=[...new Set(entries.map(e=>e.team_id))].map(id=>data.squads.find(t=>t.id===id)).filter(Boolean);
  const all=matchesFor(ids),approved=finishedGames(all);
  const pending=all.filter(m=>['scheduled','live','pending'].includes(m.status));
  pending.sort((a,b)=>(a.scheduled_at?new Date(a.scheduled_at).getTime():Infinity)-(b.scheduled_at?new Date(b.scheduled_at).getTime():Infinity)||a.round_number-b.round_number);
  setHero({title:league.name,eyebrow:'CMIM COMPETITIVE CIRCUIT · LIGA DE EQUIPES',description:league.description,logo:league.logo,league:key,labels:[league.subtitle,comps.length+' eventos registrados'],cta:[{href:'./ligas.html?liga='+key+'#eventos',label:'CONFERIR EVENTOS →'},{href:'./ligas.html#equipes',label:'CRIAR MEU TIME'}]});
  $('detail-metrics').innerHTML=metric('EVENTOS REGISTRADOS',comps.length,'Nesta liga')+metric('EQUIPES HOMOLOGADAS',teams.length,'Distintas entre os eventos')+metric('SÉRIES HOMOLOGADAS',approved.length,'Resultados aprovados')+metric('PRÓXIMOS CONFRONTOS',pending.length,'Agendados ou pendentes');
  $('detail-events').innerHTML=ok.comps?(comps.length?comps.map(c=>{
    const count=entries.filter(e=>e.competition_id===c.id).length;
    return '<article class="cmim-detail-card"><small>'+esc(fmtStatus(c.status))+' · '+esc(c.structure.toUpperCase())+'</small><h3>'+esc(c.title)+'</h3><p>'+esc(c.description||'Confira os detalhes no circuito CMIM.')+'</p><div class="cmim-detail-tags"><span class="cmim-detail-tag">'+count+' / '+Number(c.max_teams||0)+' equipes</span><span class="cmim-detail-tag">'+fmtDate(c.starts_at)+'</span></div><a class="card-link" href="'+linkEvent(c)+'">ACOMPANHAR EVENTO →</a></article>';
   }).join(''):empty('Nenhum campeonato foi publicado nesta liga até o momento.')):empty('Não foi possível consultar os eventos desta liga agora.',true);
  $('detail-teams').innerHTML=(!ok.entries||!ok.squads)?empty('O catálogo de equipes está temporariamente indisponível.',true):teams.length?teams.map(t=>'<article class="cmim-detail-card"><small>TIME HOMOLOGADO</small><h3>'+esc(t.name)+'</h3><p>'+esc(t.short_name||'CMIM')+'</p><a class="card-link" href="'+urlTeam(t.id)+'">ELENCO E ESTATÍSTICAS →</a></article>').join(''):empty('Ainda não há equipes homologadas nesta liga.');
  $('detail-schedule').innerHTML=!ok.matches?empty('A agenda está temporariamente indisponível.',true):pending.length?pending.slice(0,12).map(gameCard).join(''):empty('Nenhum confronto futuro ou pendente foi publicado.');
  $('detail-results').innerHTML=!ok.matches?empty('Os resultados estão temporariamente indisponíveis.',true):approved.length?[...approved].sort((a,b)=>(Date.parse(b.approved_at||'')||0)-(Date.parse(a.approved_at||'')||0)).slice(0,12).map(gameCard).join(''):empty('Sem resultados homologados nesta liga.');
  $('detail-standings').innerHTML=(!ok.entries||!ok.matches)?empty('Não foi possível carregar a classificação.',true):comps.length?comps.map(c=>'<section class="cmim-detail-card" style="margin-bottom:15px"><h3>'+esc(c.title)+'</h3><p style="margin-bottom:14px">Classificação por confrontos aprovados no sistema; pode mudar durante o evento.</p>'+standingsMarkup(c)+'</section>').join(''):empty('Quando os eventos forem cadastrados, a classificação aparecerá aqui.');
 }
 function showMissing(message){
  $('detail-hero').innerHTML='<div class="cmim-detail-hero-content"><span class="eyebrow">CIRCUITO CMIM</span><h1>CONTEÚDO INDISPONÍVEL.</h1><p>'+esc(message)+'</p>'+
  '<div class="cmim-detail-cta"><a href="./ligas.html">VOLTAR AO CIRCUITO →</a></div></div>';
  $('detail-metrics').innerHTML='';
  document.querySelectorAll('.cmim-detail-section').forEach(el=>el.hidden=true);
  $('detail-loading').textContent=message;
 }
 function renderTeam(id){
  const t=data.squads.find(t=>t.id===id);
  if(!t){showMissing(ok.squads?'A equipe solicitada não foi encontrada no catálogo.':'Não foi possível consultar o catálogo de equipes agora.');return}
  const members=data.members.filter(m=>m.team_id===id);
  const registrations=data.entries.filter(e=>e.team_id===id&&e.status==='approved');
  const comps=registrations.map(e=>data.comps.find(c=>c.id===e.competition_id)).filter(Boolean);
  const all=data.matches.filter(m=>(m.team_a_id===id||m.team_b_id===id)&&comps.some(c=>c.id===m.competition_id));
  const finished=finishedGames(all);
  const wins=finished.filter(m=>m.winner_id===id);
  const mapWins=finished.reduce((sum,m)=>sum+Number(m.team_a_id===id?m.score_a:m.score_b||0),0);
  const mapLosses=finished.reduce((sum,m)=>sum+Number(m.team_a_id===id?m.score_b:m.score_a||0),0);
  const next=all.filter(m=>['scheduled','live','pending'].includes(m.status)).sort((a,b)=>(Date.parse(a.scheduled_at)||Infinity)-(Date.parse(b.scheduled_at)||Infinity));
  setHero({title:t.name,eyebrow:'CMIM COMPETITIVE CIRCUIT · PERFIL DE EQUIPE',description:t.motto||'Equipe do cenário competitivo do CMIM. Aqui você acompanha elenco, participação em ligas e resultados oficiais.',logo:safeImage(t.logo_url)||'./assets/branding/cmim-main.webp',labels:[t.short_name||'EQUIPE CMIM',members.length+' atletas no elenco'],cta:[{href:'./ligas.html#equipes-oficiais',label:'EXPLORAR OUTRAS EQUIPES →'},{href:'./ligas.html#eventos',label:'VER CAMPEONATOS'}]});
  $('detail-metrics').innerHTML=metric('PARTICIPAÇÕES',comps.length,'Inscrições homologadas')+metric('SÉRIES JOGADAS',finished.length,'Confrontos aprovados')+metric('VITÓRIAS',wins.length,'Séries vencidas')+metric('WIN RATE',finished.length?Math.round(100*wins.length/finished.length)+'%':'—',finished.length?mapWins+' mapas ganhos · '+mapLosses+' perdidos':'Aguardando resultados');
  const laneOrder=['TOP','JG','MID','ADC','SUP'];
  const roster=members.slice().sort((a,b)=>laneOrder.indexOf(a.lane)-laneOrder.indexOf(b.lane));
  $('detail-roster').innerHTML=!ok.members||!ok.profiles?empty('Elenco temporariamente indisponível.',true):roster.length?roster.map(m=>{
    const p=data.profiles.find(p=>p.id===m.user_id);const avatar=safeImage(p?.avatar_url);
    return '<article class="cmim-detail-player">'+(avatar?'<img src="'+esc(avatar)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="avatar-placeholder">'+esc((p?.nick||'CM').slice(0,2).toUpperCase())+'</span>')+
     '<span class="role">'+esc(m.lane||'LANE')+'</span><b>'+esc(p?p.nick+'#'+p.tag:'Jogador sem perfil público')+'</b><span>'+esc(p?.tier?'TIER '+p.tier:'Tier não divulgado')+'</span></article>';
   }).join(''):empty('Esta equipe ainda não possui atletas confirmados no banco de dados.');
  $('detail-events').innerHTML=!ok.entries?empty('Não foi possível consultar as inscrições.',true):comps.length?comps.map(c=>'<article class="cmim-detail-card"><small>'+esc(leagueName(c.league_tier))+'</small><h3>'+esc(c.title)+'</h3><p>'+esc(fmtStatus(c.status))+' · Início: '+esc(fmtDate(c.starts_at))+'</p><a class="card-link" href="'+linkEvent(c)+'">VER CHAVEAMENTO →</a></article>').join(''):empty('Ainda não há participações homologadas para esta equipe.');
  $('detail-schedule').innerHTML=!ok.matches?empty('Agenda indisponível.',true):next.length?next.slice(0,12).map(gameCard).join(''):empty('Esta equipe ainda não possui partidas agendadas.');
  $('detail-results').innerHTML=!ok.matches?empty('Histórico indisponível.',true):finished.length?[...finished].sort((a,b)=>(Date.parse(b.approved_at)||0)-(Date.parse(a.approved_at)||0)).slice(0,15).map(gameCard).join(''):empty('Nenhum resultado homologado no histórico desta equipe.');
 }
 async function init(){
  if(mode==='league'&&!leagues[leagueKey]||mode==='team'&&!uuid.test(teamId||'')){
    showMissing('O endereço informado não corresponde a uma liga ou equipe válida. Confira o link e tente novamente.');return;
  }
  $('detail-loading').textContent='Consultando dados oficiais do circuito...';
  const requests={
   comps:'cmim_competitions?select=id,title,description,format,starts_at,closes_at,max_teams,status,structure,series_games,league_tier&order=created_at.desc&limit=150',
   squads:'cmim_squads?select=id,name,short_name,captain_lane,motto,logo_url,owner_id,created_at&limit=800',
   entries:'cmim_competition_entries?select=id,competition_id,team_id,status&limit=3000',
   matches:'cmim_competition_matches?select=id,competition_id,round_number,match_number,team_a_id,team_b_id,score_a,score_b,status,winner_id,scheduled_at,approved_at&limit=4000',
   members:'cmim_squad_members?select=team_id,user_id,lane&limit=2500',
   profiles:'cmim_profiles?select=id,nick,tag,lane,tier,avatar_url&limit=2500'
  };
  const keys=Object.keys(requests);
  const responses=await Promise.allSettled(keys.map(k=>get(requests[k])));
  data={};
  keys.forEach((key,i)=>{ok[key]=responses[i].status==='fulfilled'&&Array.isArray(responses[i].value);data[key]=ok[key]?responses[i].value:[]});
  $('detail-loading').textContent=keys.some(k=>!ok[k])?'Algumas informações estão temporariamente indisponíveis. Os dados exibidos são apenas os registros acessíveis.':'Dados do circuito atualizados.';
  if(mode==='league')renderLeague(leagueKey);else renderTeam(teamId);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void init()},{once:true});else void init();
})();
