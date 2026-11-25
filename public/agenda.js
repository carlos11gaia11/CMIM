/* CMIM Agenda: eventos manuais e confrontos oficiais sincronizados via trigger. */
document.addEventListener('DOMContentLoaded',()=>{
 'use strict';
 const auth=window.CMIMAuth,$=id=>document.getElementById(id),esc=auth.esc;
 const state={events:[],comps:[],matches:[],squads:[],admin:false,editing:null};
 const TZ='America/Sao_Paulo';
 const dateKey=iso=>{if(!iso||!Number.isFinite(Date.parse(iso)))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso))};
 const todayKey=()=>dateKey(new Date().toISOString());
 let month=todayKey().slice(0,7),selected=null;
 const monthDate=()=>new Date(month+'-01T12:00:00Z');
 const shiftMonth=n=>{const d=monthDate();d.setUTCMonth(d.getUTCMonth()+n);month=d.toISOString().slice(0,7);selected=null;render()};
 const dayLabel=key=>new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).format(new Date(key+'T12:00:00Z'));
 const overlaps=(e,key)=>{const start=dateKey(e.starts_at),end=dateKey(e.ends_at)||start;return !!start&&start<=key&&end>=key};
 const kind=e=>['completed','closed'].includes(e.status)?'done':e.match_id?'match':'event';
 const fmtDate=iso=>{
  if(!iso)return 'Data e horário a definir';
  const date=new Date(iso);if(Number.isNaN(date.getTime()))return 'Data e horário a definir';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)+' (Brasília)';
 };
 const localValue=iso=>{
  if(!iso)return '';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,hourCycle:'h23'}).formatToParts(d);
  const item=k=>parts.find(p=>p.type===k)?.value||'';
  return item('year')+'-'+item('month')+'-'+item('day')+'T'+item('hour')+':'+item('minute');
 };
 const asIso=value=>{if(!value)return null;const d=new Date(value+':00-03:00');if(Number.isNaN(d.getTime()))throw Error('Data inválida.');return d.toISOString()};
 const info=(message,bad=false)=>{
  $('agenda-feedback').textContent=message;
  $('agenda-feedback').style.color=bad?'#ff9f93':'#b3c4b3';
 };
 const adminInfo=(message,bad=false)=>{$('agenda-admin-feedback').textContent=message;$('agenda-admin-feedback').style.color=bad?'#ff9f93':'#b3c4b3'};
 const safeUuid=id=>/^[0-9a-f-]{36}$/i.test(String(id||''));
 function resetForm(){
  state.editing=null;$('agenda-admin-form').reset();$('agenda-edit-id').value='';$('agenda-match-id').value='';
  for(const id of ['agenda-title-input','agenda-type-input','agenda-status-input','agenda-end-input','agenda-location-input','agenda-description-input'])$(id).disabled=false;
  $('agenda-start-input').required=true;$('agenda-submit').textContent='＋ Salvar evento';
  $('agenda-delete').hidden=true;$('agenda-title-input').focus();
 }
 function edit(id){
  if(!state.admin)return;
  const e=state.events.find(x=>x.id===id);if(!e)return;
  state.editing=e;$('agenda-edit-id').value=e.id;$('agenda-match-id').value=e.match_id||'';
  $('agenda-title-input').value=e.title;$('agenda-type-input').value=e.type;$('agenda-status-input').value=e.status;
  $('agenda-start-input').value=localValue(e.starts_at);$('agenda-end-input').value=localValue(e.ends_at);
  $('agenda-location-input').value=e.location||'';$('agenda-description-input').value=e.description||'';
  const linked=!!e.match_id;
  for(const input of ['agenda-title-input','agenda-type-input','agenda-status-input','agenda-end-input','agenda-location-input','agenda-description-input'])$(input).disabled=linked;
  $('agenda-start-input').required=!linked;
  $('agenda-submit').textContent=linked?'Atualizar horário da partida':'Salvar alterações do evento';
  $('agenda-delete').hidden=linked;
  adminInfo(linked?'Partida vinculada: somente dia e horário podem ser alterados. O placar continua protegido.':'Editando evento independente.');
  $('agenda-admin').scrollIntoView({behavior:'smooth',block:'start'});
 }
 function render(){
  const search=$('agenda-search').value.trim().toLocaleLowerCase('pt-BR');
  const category=$('agenda-category').value,scope=$('agenda-scope').value;
  const options=[...new Set(state.events.map(e=>e.type))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  $('agenda-category').innerHTML='<option value="">Todas as categorias</option>'+options.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  $('agenda-category').value=options.includes(category)?category:'';
  const visible=state.events.filter(e=>{
   if($('agenda-category').value&&e.type!==$('agenda-category').value)return false;
   if(search&&!(e.title+' '+e.type+' '+e.description+' '+(e.location||'')).toLocaleLowerCase('pt-BR').includes(search))return false;
   const completed=e.status==='completed'||e.status==='closed';
   if(scope==='upcoming'&&completed)return false;
   if(scope==='finished'&&!completed)return false;
   return true;
  }).sort((a,b)=>(a.starts_at?Date.parse(a.starts_at):Infinity)-(b.starts_at?Date.parse(b.starts_at):Infinity));
  const first=monthDate(),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).toISOString().slice(0,10);
  const startKey=month+'-01',monthEvents=visible.filter(e=>{const start=dateKey(e.starts_at),end=dateKey(e.ends_at)||start;return !!start&&start<=last&&end>=startKey});
  const current=todayKey(),offset=first.getUTCDay(),days=Number(last.slice(-2)),cells=Math.ceil((days+offset)/7)*7;
  $('calendar-month').textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'}).format(first);
  $('calendar-grid').innerHTML=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>'<div class="calendar-weekday">'+d+'</div>').join('')+Array.from({length:cells},(_,i)=>{
   const d=new Date(first);d.setUTCDate(1-offset+i);const key=d.toISOString().slice(0,10),events=visible.filter(e=>overlaps(e,key)),outside=!key.startsWith(month);
   return '<button type="button" class="calendar-day'+(outside?' outside':'')+(key===current?' today':'')+(key===selected?' selected':'')+'" data-day="'+key+'" aria-pressed="'+(key===selected)+'" aria-label="'+esc(dayLabel(key)+', '+events.length+' evento(s)')+'"><span class="calendar-number">'+d.getUTCDate()+'</span>'+events.slice(0,3).map(e=>'<span class="calendar-chip '+kind(e)+'" title="'+esc(e.title)+'">'+esc(e.title)+'</span>').join('')+(events.length>3?'<span class="calendar-more">+'+(events.length-3)+'</span>':'')+'</button>';
  }).join('');
  $('calendar-grid').querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selected=b.dataset.day;month=selected.slice(0,7);render()});
  $('calendar-all').hidden=!selected;$('calendar-list-title').textContent=selected?'Eventos de '+dayLabel(selected):'Programação do mês';
  const displayed=selected?visible.filter(e=>overlaps(e,selected)):monthEvents;
  const card=e=>{
   const comp=e.match_id?state.matches.find(m=>m.id===e.match_id):null;
   const competition=comp?state.comps.find(c=>c.id===comp.competition_id):null;
   const teamA=comp?state.squads.find(s=>s.id===comp.team_a_id)?.name:null;
   const teamB=comp?state.squads.find(s=>s.id===comp.team_b_id)?.name:null;
   const title=comp?(teamA||'A definir')+' × '+(teamB||'A definir'):e.title;
   const desc=competition?(competition.title+' · Rodada '+comp.round_number+' · Jogo '+comp.match_number):e.description;
   const statusName={scheduled:'Agendado',open:'Em andamento',closed:'Encerrado',completed:'Concluído'}[e.status]||e.status;
   const link=competition&&safeUuid(competition.id)?'<a href="./partida.html?id='+encodeURIComponent(comp.id)+'">Ver partida</a> · <a href="./campeonato.html?id='+encodeURIComponent(competition.id)+'">Campeonato</a>':'';
   return '<article class="event"><div><div class="meta"><span class="pill">'+esc(e.type)+'</span><span>'+esc(statusName)+'</span></div>'+
    '<h3>'+esc(title)+'</h3><div class="when">'+esc(fmtDate(e.starts_at))+'</div>'+
    (e.ends_at?'<p>Até '+esc(fmtDate(e.ends_at))+'</p>':'')+
    (e.location?'<p>Local: '+esc(e.location)+'</p>':'')+
    (desc?'<p>'+esc(desc)+'</p>':'')+link+'</div>'+
    (state.admin?'<aside><button type="button" class="secondary" data-edit="'+esc(e.id)+'">Editar'+(e.match_id?' horário':' evento')+'</button></aside>':'')+
    '</article>';
  };
  $('agenda-events').innerHTML=displayed.length?displayed.map(card).join(''):'<p class="hint">Nenhum evento programado para este período.</p>';
  const undated=visible.filter(e=>!dateKey(e.starts_at));$('calendar-undated-section').hidden=!undated.length;$('calendar-undated').innerHTML=undated.map(card).join('');
  document.querySelectorAll('#agenda-events [data-edit],#calendar-undated [data-edit]').forEach(x=>x.addEventListener('click',()=>edit(x.dataset.edit)));
  info(displayed.length+' evento(s) no período · '+undated.length+' sem data definida.');
 }
 async function load(){
  const urls=[
   '/rest/v1/cmim_portal_events?select=*&order=starts_at.asc.nullslast&limit=2000',
   '/rest/v1/cmim_competitions?select=id,title,status&limit=1000',
   '/rest/v1/cmim_competition_matches?select=id,competition_id,round_number,match_number,team_a_id,team_b_id&limit=4000',
   '/rest/v1/cmim_squads?select=id,name&limit=1000'
  ];
  const res=await Promise.allSettled(urls.map(x=>auth.call(x)));
  if(res[0].status!=='fulfilled')throw Error(res[0].reason?.message||'Não foi possível consultar a agenda.');
  const [events,comps,matches,squads]=res.map(x=>x.status==='fulfilled'&&Array.isArray(x.value)?x.value:[]);
  Object.assign(state,{events,comps,matches,squads});render();
 }
 $('calendar-prev').onclick=()=>shiftMonth(-1);$('calendar-next').onclick=()=>shiftMonth(1);$('calendar-today').onclick=()=>{month=todayKey().slice(0,7);selected=null;render()};$('calendar-all').onclick=()=>{selected=null;render()};
 $('agenda-search').addEventListener('input',render);
 $('agenda-category').addEventListener('change',render);
 $('agenda-scope').addEventListener('change',render);
 $('agenda-refresh').addEventListener('click',async()=>{try{await load()}catch(e){info(e.message,true)}});
 $('agenda-cancel').addEventListener('click',()=>{resetForm();adminInfo('Edição cancelada.')});
 $('agenda-admin-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!state.admin)return;
  const button=$('agenda-submit');button.disabled=true;adminInfo('Salvando...');
  try {
   const id=$('agenda-edit-id').value,matchId=$('agenda-match-id').value;
   if(matchId){
    const iso=asIso($('agenda-start-input').value);
    await auth.call('/rest/v1/cmim_competition_matches?id=eq.'+encodeURIComponent(matchId),{
     method:'PATCH',secure:true,body:{scheduled_at:iso,updated_at:new Date().toISOString()}
    });
   } else {
    const starts_at=asIso($('agenda-start-input').value),ends_at=asIso($('agenda-end-input').value);
    if(ends_at&&ends_at<=starts_at)throw Error('O término deve ser posterior ao início.');
    const data={title:$('agenda-title-input').value.trim(),type:$('agenda-type-input').value.trim(),
     starts_at,ends_at,status:$('agenda-status-input').value,location:$('agenda-location-input').value.trim(),
     description:$('agenda-description-input').value.trim(),updated_at:new Date().toISOString()};
    if(!data.title||!data.type)throw Error('Preencha o título e o tipo.');
    await auth.call('/rest/v1/cmim_portal_events'+(id?'?id=eq.'+encodeURIComponent(id):''),{
     method:id?'PATCH':'POST',secure:true,body:data
    });
   }
   await load();resetForm();adminInfo('✓ Evento salvo e agenda sincronizada.');
  }catch(err){adminInfo('Erro ao salvar: '+(err?.message||String(err)),true)}
  finally{button.disabled=false}
 });
 $('agenda-delete').addEventListener('click',async()=>{
  const id=$('agenda-edit-id').value;if(!state.admin||!id||state.editing?.match_id)return;
  if(!confirm('Excluir este evento da agenda?'))return;
  try{await auth.call('/rest/v1/cmim_portal_events?id=eq.'+encodeURIComponent(id),{method:'DELETE',secure:true});
   await load();resetForm();adminInfo('Evento excluído.');
  }catch(err){adminInfo(err?.message||String(err),true)}
 });
 (async()=>{
  try{
   const me=await auth.user().catch(()=>null);
   state.admin=me?.app_metadata?.cmim_admin===true;
   $('agenda-admin').hidden=!state.admin;
   await load();
  }catch(err){info('Agenda temporariamente indisponível: '+(err?.message||String(err)),true)}
 })();
});