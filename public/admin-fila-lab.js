/* Laboratório local, exclusivo de ADM. Não envia dados ao Supabase e não afeta o ranking. */
(() => {
  'use strict';
  const LANES=['TOP','JG','MID','ADC','SUP'];
  const SEED=[
    ['Simulado 01','S','TOP'],['Simulado 02','A','JG'],
    ['Simulado 03','A','MID'],['Simulado 04','B','ADC'],
    ['Simulado 05',null,'SUP'],['Simulado 06','B','TOP'],
    ['Simulado 07','C','JG'],['Simulado 08',null,'MID'],
    ['Simulado 09','D','ADC'],['Simulado 10','C','SUP']
  ];
  const priority={S:0,A:1,B:2,C:3,D:4};
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const state={players:[],picks:[],stage:'empty',captains:[],deadline:0};
  const tier=p=>p.tier||'B';
  const seed=()=>{
    state.players=SEED.map(([nick,level,lane],i)=>({id:i,nick,tier:level,lane,confirmed:false,side:null,captain:false}));
    state.picks=[];state.stage='queue';state.captains=[];state.deadline=0;render();
  };
  const startDraft=()=>{
    const captains=[...state.players].sort((a,b)=>priority[tier(a)]-priority[tier(b)]||a.id-b.id).slice(0,2);
    state.captains=captains.map(p=>p.id);
    captains.forEach((p,i)=>{p.captain=true;p.side=i===0?'A':'B'});
    state.stage='draft';state.deadline=Date.now()+60000;
  };
  const confirmPlayer=id=>{
    if(state.stage!=='queue')return;
    const player=state.players.find(p=>p.id===id);if(!player)return;
    player.confirmed=true;
    if(state.players.every(p=>p.confirmed))startDraft();
    render();
  };
  const choosePlayer=id=>{
    if(state.stage!=='draft'||Date.now()>state.deadline)return;
    const p=state.players.find(x=>x.id===id);if(!p||!p.confirmed||p.side)return;
    p.side=state.picks.length%2===0?'A':'B';
    state.picks.push(p.id);
    if(state.picks.length===8){state.stage='done';state.deadline=0}
    else state.deadline=Date.now()+60000;
    render();
  };
  const back=()=>{
    if(!state.picks.length)return;
    const id=state.picks.pop();const p=state.players.find(x=>x.id===id);p.side=null;
    state.stage='draft';state.deadline=Date.now()+60000;render();
  };
  let box;
  function render(){
    if(!box)return;
    const count=state.players.filter(p=>p.confirmed).length;
    const active=state.stage==='draft',isDone=state.stage==='done';
    const side=state.picks.length%2===0?'A':'B';
    box.querySelector('#lab-stage').textContent=state.stage==='empty'?'Aguardando início':state.stage==='queue'?'Fila: '+count+'/10 confirmados':isDone?'Draft finalizado':'Draft: escolha '+(state.picks.length+1)+'/8 · Capitão '+side;
    box.querySelector('#lab-count').textContent=state.players.length+' participantes fictícios · '+count+' confirmados';
    box.querySelector('#lab-start').disabled=state.stage==='queue'||active;
    box.querySelector('#lab-confirm-all').disabled=state.stage!=='queue';
    box.querySelector('#lab-undo').disabled=!state.picks.length;
    box.querySelector('#lab-reset-clock').disabled=!active;
    box.querySelector('#lab-players').innerHTML=state.players.map(p=>`
      <tr><td>${esc(p.nick)} ${p.captain?'(CAPITÃO)':''}</td>
      <td><b>${esc(tier(p))}</b>${p.tier?'':' <small>(padrão)</small>'}</td>
      <td><select data-lab-lane="${p.id}" aria-label="Lane de ${esc(p.nick)}" ${state.stage!=='queue'?'disabled':''}>
      ${LANES.map(l=>`<option value="${l}" ${p.lane===l?'selected':''}>${l}</option>`).join('')}</select></td>
      <td>${p.side?'Equipe '+p.side:p.confirmed?'Confirmado':'Na fila'}</td>
      <td>${state.stage==='queue'&&!p.confirmed?`<button type="button" data-lab-confirm="${p.id}">Confirmar</button>`:active&&p.confirmed&&!p.side?`<button type="button" data-lab-pick="${p.id}">Escolher</button>`:''}</td></tr>`).join('');
    box.querySelector('#lab-teams').innerHTML=['A','B'].map(s=>`<div style="border:1px solid #4b5d42;border-radius:8px;padding:10px;flex:1;min-width:170px"><b>Equipe ${s}</b><br>${state.players.filter(p=>p.side===s).map(p=>esc(p.nick)+' ('+esc(tier(p))+')').join('<br>')||'—'}</div>`).join('');
    updateClock();
  }
  function updateClock(){
    if(!box)return;
    const el=box.querySelector('#lab-clock');
    if(state.stage!=='draft'){el.textContent=state.stage==='done'?'✓ Finalizado':'—';return;}
    const seconds=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));
    el.textContent=seconds?'Tempo da escolha: '+seconds+'s':'Tempo esgotado · reinicie o relógio';
    box.querySelectorAll('[data-lab-pick]').forEach(b=>b.disabled===undefined?null:b.disabled=seconds===0);
  }
  async function init(){
    const user=await window.CMIMAuth?.user?.();
    if(user?.app_metadata?.cmim_admin!==true)return;
    const host=document.querySelector('#main > section');if(!host)return;
    box=document.createElement('div');box.className='card';
    box.style.borderColor='#9f842d';
    box.innerHTML=`
      <h2>Laboratório ADM — teste sozinho</h2>
      <p style="color:#d3c58b"><b>SIMULAÇÃO LOCAL:</b> os dez jogadores são simbólicos. Nada é enviado ao banco, nenhum ranking é alterado e nenhuma sala oficial é criada.</p>
      <p id="lab-stage" aria-live="polite">Aguardando início</p><p id="lab-count" class="muted"></p>
      <div class="actions">
        <button type="button" id="lab-start" class="primary">Gerar 10 jogadores fictícios</button>
        <button type="button" id="lab-confirm-all">Confirmar todos (teste rápido)</button>
        <button type="button" id="lab-undo">Desfazer escolha</button>
        <button type="button" id="lab-reset-clock">Reiniciar 60s</button>
        <button type="button" id="lab-reset">Limpar simulação</button>
      </div>
      <p id="lab-clock" class="muted">—</p>
      <div class="tablewrap"><table><thead><tr><th>Jogador</th><th>Tier</th><th>Lane (livre)</th><th>Etapa</th><th>Ação</th></tr></thead><tbody id="lab-players"></tbody></table></div>
      <div class="actions" id="lab-teams"></div>`;
    host.prepend(box);
    box.addEventListener('click',e=>{
      const button=e.target.closest('button');if(!button)return;
      if(button.id==='lab-start'){seed();return;}
      if(button.id==='lab-reset'){state.players=[];state.picks=[];state.stage='empty';state.deadline=0;render();return;}
      if(button.id==='lab-confirm-all'){state.players.forEach(p=>p.confirmed=true);startDraft();render();return;}
      if(button.id==='lab-undo'){back();return;}
      if(button.id==='lab-reset-clock'){if(state.stage==='draft'){state.deadline=Date.now()+60000;render()}return;}
      if(button.dataset.labConfirm!==undefined){confirmPlayer(Number(button.dataset.labConfirm));return;}
      if(button.dataset.labPick!==undefined){choosePlayer(Number(button.dataset.labPick));}
    });
    box.addEventListener('change',e=>{
      const el=e.target.closest('[data-lab-lane]');
      if(!el||state.stage!=='queue')return;
      const p=state.players.find(p=>p.id===Number(el.dataset.labLane));
      if(p&&LANES.includes(el.value)){p.lane=el.value;render()}
    });
    seed();
    setInterval(updateClock,300);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(()=>{}));
  else init().catch(()=>{});
})();
