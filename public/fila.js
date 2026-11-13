/* Fila CMIM — site estático, operações críticas validadas pelo Postgres */
(()=>{'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\"':'&quot;'}[c]));
const state={me:null,rooms:[],room:null,entries:[],picks:[],busy:false};
const fmt=s=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—';
const api=(name,args)=>CMIMAuth.call('/rest/v1/rpc/'+name,{method:'POST',body:args,secure:true});
const list=path=>CMIMAuth.call('/rest/v1/'+path,{secure:true});
function notice(s,bad=false){let el=$('message');el.hidden=false;el.textContent=s;el.className='notice'+(bad?' error':'');}
function status(r){if(!r)return '';if(r.status==='scheduled'&&Date.now()>=Date.parse(r.opens_at)&&Date.now()<=Date.parse(r.closes_at))return 'open';if((r.status==='scheduled'||r.status==='open')&&Date.now()>Date.parse(r.closes_at))return 'closed';return r.status}
function canJoin(r){return r&&['open','scheduled'].includes(r.status)&&Date.now()>=Date.parse(r.opens_at)&&Date.now()<=Date.parse(r.closes_at)}
async function act(fn){if(state.busy)return;state.busy=true;try{await fn();await load();}catch(e){notice(e.message||String(e),true);}finally{state.busy=false;render();}}
async function load(){state.rooms=await list('cmim_queue_rooms?select=*&order=opens_at.desc&limit=30');if(!state.room||!state.rooms.some(x=>x.id===state.room.id))state.room=state.rooms.find(x=>!['finished','canceled'].includes(x.status))||state.rooms[0]||null;else state.room=state.rooms.find(x=>x.id===state.room.id);if(state.room){const id=encodeURIComponent(state.room.id);[state.entries,state.picks]=await Promise.all([list('cmim_queue_entries?select=*&room_id=eq.'+id+'&order=joined_at.asc'),list('cmim_queue_picks?select=*&room_id=eq.'+id+'&order=pick_number.asc')]);}else{state.entries=[];state.picks=[];}render()}
function render(){let r=state.room;const rooms=$('rooms');rooms.innerHTML=state.rooms.length?state.rooms.map(x=>`<button data-room="${x.id}" class="${r?.id===x.id?'active':''}"><b>${esc(x.title)}</b><br><small>${fmt(x.opens_at)} · ${esc(status(x))}</small></button>`).join(''):'Nenhuma sala cadastrada.';
$('roomTitle').textContent=r?.title||'Nenhuma sala';$('roomTime').textContent=r?'Abre '+fmt(r.opens_at)+' · Encerra '+fmt(r.closes_at):'';$('roomStatus').textContent=status(r);
let active=state.entries.filter(x=>x.status==='queued'||x.status==='confirmed'),confirmed=active.filter(x=>x.status==='confirmed');const mine=state.entries.find(x=>x.user_id===state.me?.id);const laneSelect=$('laneChoice');if(laneSelect.dataset.room!==(r?.id||'')){laneSelect.dataset.room=r?.id||'';laneSelect.dataset.dirty='';laneSelect.value=mine?.lane||'';}else if(laneSelect.dataset.dirty!=='1'&&mine?.lane){laneSelect.value=mine.lane;}laneSelect.disabled=!canJoin(r)||r?.status==='drafting';const slot=active.findIndex(x=>x.user_id===state.me?.id)+1;
$('queueSummary').textContent=`${confirmed.length}/10 confirmados · ${active.length} na fila · ${Math.max(0,active.length-10)} na espera`;
$('participants').innerHTML=active.length?active.map((p,i)=>`<div class="player"><b>${esc(p.nick)}</b><span class="tier">${esc(p.tier||'B')}</span><small>${esc(p.lane||'Lane não definida')} · ${p.status==='confirmed'?'✓ Confirmado':i>=10?'Lista de espera':'Aguardando confirmação'}</small></div>`).join(''):'Aguardando jogadores.';
$('myStatus').textContent=mine?`Seu status: ${mine.status}${slot?' · Posição '+slot:''}`:'Você ainda não entrou nesta sala.';
$('join').disabled=!canJoin(r)||!!mine&&mine.status!=='left'||!laneSelect.value;$('saveLane').disabled=!canJoin(r)||!mine||!['queued','confirmed'].includes(mine.status)||!laneSelect.value;$('confirm').disabled=!canJoin(r)||mine?.status!=='queued'||slot>10;$('leave').disabled=!r||!mine||!['queued','confirmed'].includes(mine.status)||!['scheduled','open','closed'].includes(r.status);
$('reportForm').querySelector('button').disabled=!mine||!['queued','confirmed'].includes(mine.status);
let draft=['drafting','paused','finished'].includes(r?.status);$('draftArea').hidden=!draft;if(!draft)return;
const turn=r.pick_number%2===1?'A':'B',turnCaptain=turn==='A'?r.captain_a:r.captain_b;
const tA=state.entries.filter(e=>e.side==='A'),tB=state.entries.filter(e=>e.side==='B');
$('teams').innerHTML=[['A',tA,r.captain_a],['B',tB,r.captain_b]].map(([side,players,cap])=>`<div class="team ${side==='B'?'red':''}"><h3>Equipe ${side} · ${players.length}/5</h3>${players.map(e=>`<div class="row"><span>${esc(e.nick)} ${e.user_id===cap?'(capitão)':''}</span><b>${esc(e.tier||'B')}</b></div>`).join('')}</div>`).join('');
$('turnLabel').textContent=r.status==='finished'?'Draft finalizado!':r.status==='paused'?'Draft pausado pelo ADM':`Escolha ${r.pick_number}/8 · Vez do capitão da equipe ${turn}${turnCaptain===state.me?.id?' (você)':''}`;
$('available').innerHTML=state.entries.filter(e=>e.status==='confirmed'&&!e.side).map(e=>`<div class="player"><b>${esc(e.nick)}</b><span class="tier">${esc(e.tier||'B')}</span><small>${esc(e.lane||'Lane não definida')}</small>${r.status==='drafting'&&turnCaptain===state.me?.id?`<button class="pick-btn" data-pick="${e.user_id}">Escolher</button>`:''}</div>`).join('')||'<p>Todos os jogadores foram escolhidos.</p>';
updateClock();}
function updateClock(){let r=state.room;if(!$('draftArea')||$('draftArea').hidden)return;let remain=r?.status==='drafting'&&r.pick_deadline?Math.max(0,Math.ceil((Date.parse(r.pick_deadline)-Date.now())/1000)):null;$('clock').textContent=r.status==='finished'?'✓':r.status==='paused'?'PAUSADO':remain===0?'TEMPO ESGOTADO':remain===null?'':remain+'s';}
async function init(){try{state.me=await CMIMAuth.user();if(!state.me){$('signin').hidden=false;return;}if(state.me.app_metadata?.cmim_admin===true)$('adminLink').hidden=false;$('mainGrid').hidden=false;await load();}catch(e){notice(e.message,true);}}
$('rooms').addEventListener('click',e=>{const btn=e.target.closest('[data-room]');if(!btn)return;state.room=state.rooms.find(r=>r.id===btn.dataset.room);load().catch(err=>notice(err.message,true));});
$('laneChoice').addEventListener('change',()=>{$('laneChoice').dataset.dirty='1';render();});
$('join').addEventListener('click',()=>act(async()=>{await api('cmim_q_join_lane',{p_room:state.room.id,p_lane:$('laneChoice').value});$('laneChoice').dataset.dirty='';notice('Entrada registrada com a lane escolhida.');}));
$('saveLane').addEventListener('click',()=>act(async()=>{await api('cmim_q_join_lane',{p_room:state.room.id,p_lane:$('laneChoice').value});$('laneChoice').dataset.dirty='';notice('Lane atualizada nesta sala.');}));
$('confirm').addEventListener('click',()=>act(()=>api('cmim_q_confirm',{p_room:state.room.id})));
$('leave').addEventListener('click',()=>act(()=>api('cmim_q_leave',{p_room:state.room.id})));
$('available').addEventListener('click',e=>{const btn=e.target.closest('[data-pick]');if(btn)act(()=>api('cmim_q_pick',{p_room:state.room.id,p_player:btn.dataset.pick}));});
$('reportForm').addEventListener('submit',e=>{e.preventDefault();act(async()=>{await api('cmim_q_report',{p_room:state.room.id,p_nick:$('reportNick').value,p_details:$('reportDetails').value});$('reportForm').reset();notice('Reporte enviado à administração para avaliação.');});});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
setInterval(()=>{if(state.me&&!state.busy)load().catch(()=>{});updateClock()},5000);setInterval(updateClock,250);
})();