/* CMIM — fila online, limite de duas vagas por lane controlado no PostgreSQL. */
(() => {
  'use strict';
  const LANES = ['TOP','JG','MID','ADC','SUP'];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"\'":'&#39;'}[c]));
  const state = {me:null,rooms:[],room:null,roomId:null,entries:[],picks:[],busy:false,loading:false,laneRoom:null,laneDirty:false};
  const fmt = value => value ? new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}) : '—';
  const api = (name,args) => CMIMAuth.call('/rest/v1/rpc/'+name,{method:'POST',body:args,secure:true});
  const list = path => CMIMAuth.call('/rest/v1/'+path,{secure:true});

  function notice(message,bad=false){
    const node=$('message');node.hidden=false;node.textContent=message;node.className='notice'+(bad?' error':'');
  }
  function roomStatus(room){
    if(!room) return 'none';
    if(room.status==='scheduled' && Date.now()>=Date.parse(room.opens_at) && Date.now()<=Date.parse(room.closes_at)) return 'open';
    if(['scheduled','open'].includes(room.status) && Date.now()>Date.parse(room.closes_at)) return 'closed';
    return room.status;
  }
  function canJoin(room){
    return !!room && ['scheduled','open'].includes(room.status)
      && Date.now()>=Date.parse(room.opens_at) && Date.now()<=Date.parse(room.closes_at);
  }
  const statusLabel={none:'SEM SALA',scheduled:'AGENDADA',open:'FILA ABERTA',closed:'ENCERRADA',drafting:'DRAFT AO VIVO',paused:'DRAFT PAUSADO',finished:'TIMES DEFINIDOS',canceled:'CANCELADA'};
  function activeEntries(){return state.entries.filter(e=>['queued','confirmed'].includes(e.status));}
  function mine(){return state.entries.find(e=>e.user_id===state.me?.id);}
  function membersFor(lane){return activeEntries().filter(e=>e.lane===lane);}
  function laneAvailable(lane){return membersFor(lane).filter(e=>e.user_id!==state.me?.id).length<2;}

  async function load(){
    if(state.loading)return;
    state.loading=true;
    try{
      const rooms=await list('cmim_queue_rooms?select=*&order=opens_at.desc&limit=50');
      state.rooms=rooms;
      const prevId=state.roomId;
      if(!state.roomId || !rooms.some(r=>r.id===state.roomId)){
        const urlId=new URLSearchParams(location.search).get('sala');
        const eligible=rooms.find(r=>['open','scheduled'].includes(roomStatus(r)))||rooms[0];
        state.roomId=rooms.some(r=>r.id===urlId)?urlId:(eligible?.id||null);
      }
      state.room=rooms.find(r=>r.id===state.roomId)||null;
      if(prevId!==state.roomId){state.laneDirty=false;state.laneRoom=null;}
      if(state.room){
        const id=encodeURIComponent(state.room.id);
        [state.entries,state.picks]=await Promise.all([
          list('cmim_queue_entries?select=*&room_id=eq.'+id+'&order=joined_at.asc'),
          list('cmim_queue_picks?select=*&room_id=eq.'+id+'&order=pick_number.asc')
        ]);
      }else{state.entries=[];state.picks=[];}
      render();
    } finally {state.loading=false;}
  }
  function laneOptions(){
    const select=$('laneChoice');
    if(!select)return;
    const own=mine(), r=state.room;
    if(state.laneRoom!==r?.id){
      state.laneRoom=r?.id??null;
      state.laneDirty=false;
      select.value=own?.lane||'';
    } else if(!state.laneDirty && own?.lane && select.value!==own.lane){
      select.value=own.lane;
    }
    for(const option of select.options){
      if(!LANES.includes(option.value))continue;
      const taken=membersFor(option.value).length;
      const current=own?.lane===option.value && ['queued','confirmed'].includes(own?.status);
      option.textContent=option.value+' · '+taken+'/2 vagas';
      option.disabled=!current&&!laneAvailable(option.value);
    }
    if(select.selectedOptions[0]?.disabled)select.value='';
    select.disabled=!canJoin(r);
  }
  function render(){
    const r=state.room, status=roomStatus(r), entries=activeEntries();
    const confirmed=entries.filter(e=>e.status==='confirmed'), own=mine();
    const rooms=$('rooms');
    rooms.innerHTML=state.rooms.length?state.rooms.map(x=>`<button type="button" data-room="${x.id}" class="${x.id===r?.id?'active':''}" aria-pressed="${x.id===r?.id}"><strong>${esc(x.title)}</strong><small>${fmt(x.opens_at)} · ${esc(statusLabel[roomStatus(x)]||roomStatus(x))}</small></button>`).join(''):'<p class="subtext">Ainda não há salas agendadas. Volte no horário divulgado no WhatsApp.</p>';
    $('roomTitle').textContent=r?.title||'Nenhuma sala disponível';
    $('roomTime').textContent=r?'Abre '+fmt(r.opens_at)+' · Check-in até '+fmt(r.closes_at):'Acompanhe os horários divulgados pela administração.';
    const statusNode=$('roomStatus');
    statusNode.className='status-chip '+status;
    statusNode.textContent=statusLabel[status]||'AGUARDANDO';
    $('confirmedCount').innerHTML=confirmed.length+'<span>/10</span>';
    $('confirmedBar').style.width=(confirmed.length*10)+'%';
    $('confirmedTrack').setAttribute('aria-valuenow',String(confirmed.length));
    $('queueSummary').textContent=r?.status==='finished'?'Draft concluído. Equipes prontas!':status==='drafting'?'Os dez jogadores confirmaram. Capitães definidos e draft em andamento.':status==='paused'?'Draft pausado pela administração. Aguarde a retomada.':status==='closed'?'Check-in encerrado. O ADM pode ajustar presenças antes do draft.':r ? entries.length+'/10 vagas ocupadas · '+confirmed.length+'/10 confirmados. As vagas são distribuídas em duas por lane.' : 'Selecione uma sala para acompanhar a fila.';
    $('laneBoard').innerHTML=LANES.map(lane=>{
      const players=membersFor(lane), num=players.length, done=players.filter(p=>p.status==='confirmed').length;
      return `<div class="lane-card ${num===2?'full':''} ${done===2?'confirmed':''}" aria-label="${lane}: ${num} de 2 vagas ocupadas"><b>${lane}</b><div class="lane-counter">${num}<span>/2</span></div><div class="capacity">${players.map(()=>'<i></i>').join('')}</div><small>${num===2?'ESGOTADA':num===1?'1 VAGA LIVRE':'2 VAGAS LIVRES'}</small></div>`;
    }).join('');
    $('participants').innerHTML=LANES.map(lane=>{
      const players=membersFor(lane), cells=[...players];
      while(cells.length<2)cells.push(null);
      return `<section class="lane-roster" aria-label="Participantes ${lane}"><h3>${lane}<span>${players.length}/2</span></h3>${cells.map((p,i)=>p
        ?`<div class="player-slot"><span class="player-icon">${lane[0]}</span><span class="player-meta"><strong title="${esc(p.nick)}">${esc(p.nick)} ${p.user_id===state.me?.id?'(você)':''}</strong><small><span class="tiny-dot ${p.status==='confirmed'?'active':'idle'}"></span>${p.status==='confirmed'?'Presença confirmada':'Aguardando confirmação'}</small></span><span class="player-tier">${esc(p.tier||'B')}</span></div>`
        :`<div class="player-slot empty"><span class="player-icon">+</span><span class="player-meta"><strong>Vaga disponível</strong><small>Posição ${i+1} de 2</small></span></div>`).join('')}</section>`;
    }).join('');
    laneOptions();
    let slot = own&&['queued','confirmed'].includes(own.status)?entries.findIndex(e=>e.user_id===own.user_id)+1:0;
    $('myStatus').textContent=!r?'Selecione uma sala':own?.status==='confirmed'? 'Sua presença está confirmada na '+own.lane+'!':own?.status==='queued'?'Você está na fila como '+own.lane+'. Confirme sua presença.':own?.status==='removed'?'Sua inscrição foi removida pelo ADM.':own?.status==='left'?'Você saiu da sala. Pode entrar novamente se houver vaga.':'Escolha sua lane para entrar nesta sala.';
    const hasLane=LANES.includes($('laneChoice').value)&&laneAvailable($('laneChoice').value);
    $('join').disabled=!canJoin(r)||!hasLane||!!own&&own.status!=='left';
    $('confirm').disabled=!canJoin(r)||own?.status!=='queued'||slot>10;
    $('leave').disabled=!r||!own||!['queued','confirmed'].includes(own.status)||!['scheduled','open','closed'].includes(r.status);
    $('saveLane').disabled=!canJoin(r)||!hasLane||!own||!['queued','confirmed'].includes(own.status)||own.lane===$('laneChoice').value;
    $('reportForm').querySelector('button[type="submit"]').disabled=!own||!['queued','confirmed'].includes(own.status);
    renderDraft();
  }
  function renderDraft(){
    const r=state.room, active=['drafting','paused','finished'].includes(r?.status);
    $('draftArea').hidden=!active;
    $('nextStage').hidden=r?.status!=='finished';
    $('nextStageNote').hidden=r?.status!=='finished';
    if(!active)return;
    const turn=r.pick_number%2===1?'A':'B',captainId=turn==='A'?r.captain_a:r.captain_b;
    const captain=state.entries.find(e=>e.user_id===captainId);
    const name=captain?.nick||'Capitão '+turn;
    $('turnLabel').textContent=r.status==='finished'?'Draft finalizado. Dois times com cinco jogadores estão prontos. O próximo passo é organizar a seleção de campeões.':r.status==='paused'?'Draft pausado. O ADM poderá retomar as escolhas.':`Escolha ${r.pick_number}/8 · Capitão ${name} (Equipe ${turn})${captainId===state.me?.id?' — SUA VEZ':''}`;
    $('teams').innerHTML=['A','B'].map(side=>{
      const players=state.entries.filter(e=>e.side===side);
      return `<div class="team ${side==='B'?'red':''}"><h3>Equipe ${side} · ${players.length}/5</h3>${players.map(p=>`<div class="row"><span>${esc(p.nick)} ${p.is_captain?'(capitão)':''} <small>${esc(p.lane||'')}</small></span><b>${esc(p.tier||'B')}</b></div>`).join('')||'<p class="subtext">Aguardando escolhas.</p>'}</div>`;
    }).join('');
    const canPick=r.status==='drafting'&&captainId===state.me?.id&&Date.now()<Date.parse(r.pick_deadline||0);
    $('available').innerHTML=state.entries.filter(e=>e.status==='confirmed'&&!e.side).map(p=>`<div class="player"><strong>${esc(p.nick)} <span class="tier">${esc(p.tier||'B')}</span></strong><small>${esc(p.lane||'Lane indefinida')}</small>${canPick?`<button type="button" class="pick-btn" data-pick="${p.user_id}">Escolher jogador</button>`:''}</div>`).join('')||'<p class="subtext">Todos os jogadores foram escolhidos.</p>';
    updateClock();
  }
  function updateClock(){
    const r=state.room;
    if(!r||$('draftArea').hidden)return;
    if(r.status==='finished'){$('clock').textContent='✓ PRONTO';return;}
    if(r.status==='paused'){$('clock').textContent='PAUSADO';return;}
    const sec=r.pick_deadline?Math.max(0,Math.ceil((Date.parse(r.pick_deadline)-Date.now())/1000)):0;
    $('clock').textContent=sec?sec+'s':'TEMPO ESGOTADO';
    $('available').querySelectorAll('[data-pick]').forEach(b=>b.disabled=sec===0);
  }
  async function act(fn){
    if(state.busy||!state.room)return;
    state.busy=true;
    try{await fn();await load();}
    catch(e){notice(e.message||String(e),true);}
    finally{state.busy=false;render();}
  }
  async function init(){
    try{
      state.me=await CMIMAuth.user();
      if(!state.me){$('signin').hidden=false;return;}
      if(state.me.app_metadata?.cmim_admin===true)$('adminLink').hidden=false;
      $('mainGrid').hidden=false;
      await load();
    }catch(e){notice(e.message||String(e),true);}
  }
  $('rooms').addEventListener('click',e=>{
    const button=e.target.closest('[data-room]');if(!button||state.busy)return;
    state.roomId=button.dataset.room;state.laneRoom=null;state.laneDirty=false;
    const url=new URL(location.href);url.searchParams.set('sala',state.roomId);
    history.replaceState(null,'',url);
    load().catch(e=>notice(e.message,true));
  });
  $('laneChoice').addEventListener('change',()=>{state.laneDirty=true;render();});
  $('join').addEventListener('click',()=>act(async()=>{
    await api('cmim_q_join_lane',{p_room:state.room.id,p_lane:$('laneChoice').value});
    state.laneDirty=false;notice('Inscrição registrada. Agora confirme a presença!');
  }));
  $('saveLane').addEventListener('click',()=>act(async()=>{
    await api('cmim_q_join_lane',{p_room:state.room.id,p_lane:$('laneChoice').value});
    state.laneDirty=false;notice('Lane atualizada nesta sala.');
  }));
  $('confirm').addEventListener('click',()=>act(async()=>{
    await api('cmim_q_confirm',{p_room:state.room.id});
    notice('Presença confirmada! Você já está pronto para o draft.');
  }));
  $('leave').addEventListener('click',()=>act(async()=>{
    await api('cmim_q_leave',{p_room:state.room.id});
    state.laneDirty=false;notice('Você saiu da fila e liberou sua vaga.');
  }));
  $('available').addEventListener('click',e=>{
    const button=e.target.closest('[data-pick]');if(!button)return;
    act(()=>api('cmim_q_pick',{p_room:state.room.id,p_player:button.dataset.pick}));
  });
  $('reportForm').addEventListener('submit',e=>{
    e.preventDefault();
    act(async()=>{
      await api('cmim_q_report',{p_room:state.room.id,p_nick:$('reportNick').value.trim(),p_details:$('reportDetails').value.trim()});
      $('reportForm').reset();
      notice('Reporte enviado para avaliação da administração.');
    });
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
  setInterval(()=>{if(state.me&&!state.busy)load().catch(()=>{});},5000);
  setInterval(updateClock,250);
})();
