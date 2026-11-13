/* Laboratório ADM — torneio de quatro times. Simulação integral no navegador, sem alterar o banco. */
(()=>{'use strict';
const LANES=['TOP','JG','MID','ADC','SUP'],ORDER=['A','B','C','D','D','C','B','A'],SIDES=['A','B','C','D'];
const tierOrder={S:0,A:1,B:2,C:3,D:4};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let panel=null;
const state={players:[],picks:[],history:[],captainLane:'MID',turn:0,stage:'empty',deadline:0};
const team=side=>state.players.filter(p=>p.side===side);
const selectedLane=(side,lane)=>team(side).some(p=>p.lane===lane);
const current=()=>ORDER[state.turn%8];
const snapshot=()=>({players:state.players.map(p=>({...p})),picks:state.picks.map(p=>({...p})),turn:state.turn,stage:state.stage,deadline:state.deadline});
const generate=()=>{
 state.players=LANES.flatMap((lane,li)=>Array.from({length:4},(_,i)=>({
   id:li*4+i,nick:'Simulado '+lane+' '+(i+1),lane,tier:['S','A','B','C'][(i+li)%4],
   confirmed:false,side:null,captain:false
 })));
 state.picks=[];state.history=[];state.turn=0;state.stage='queue';state.deadline=0;
 render();
};
const start=()=>{
 if(state.players.some(p=>!p.confirmed))return;
 const caps=state.players.filter(p=>p.lane===state.captainLane)
   .sort((a,b)=>tierOrder[a.tier]-tierOrder[b.tier]||a.id-b.id);
 caps.forEach((p,i)=>{p.side=SIDES[i];p.captain=true});
 state.stage='draft';state.turn=0;state.deadline=Date.now()+60000;
};
const advance=()=>{
 while(state.turn<16 && team(current()).length>=5)state.turn++;
 if(state.players.every(p=>p.side)){state.stage='finished';state.deadline=0;}
};
const autoAssign=()=>{
 let changed=true;
 while(changed){
   changed=false;
   for(const lane of LANES.filter(x=>x!==state.captainLane)){
     const remaining=state.players.filter(p=>p.lane===lane&&!p.side);
     const missing=SIDES.filter(s=>!selectedLane(s,lane));
     if(remaining.length===1&&missing.length===1){
       remaining[0].side=missing[0];
       state.picks.push({id:remaining[0].id,side:missing[0],automatic:true});
       changed=true;break;
     }
   }
 }
};
const pick=id=>{
 if(state.stage!=='draft'||Date.now()>state.deadline)return;
 const p=state.players.find(p=>p.id===id);
 const side=current();
 if(!p||p.side||p.lane===state.captainLane||selectedLane(side,p.lane))return;
 state.history.push(snapshot());
 p.side=side;state.picks.push({id,side,automatic:false});
 state.turn++;autoAssign();advance();state.deadline=state.stage==='finished'?0:Date.now()+60000;
 render();
};
function render(){
 if(!panel)return;
 const count=state.players.filter(p=>p.confirmed).length;
 const controls=panel.querySelectorAll('button');
 panel.querySelector('#tlab-state').textContent=state.stage==='queue'?count+'/20 confirmados':state.stage==='draft'?
   'PICK '+(state.picks.filter(p=>!p.automatic).length+1)+' · Equipe '+current()+' · Snake ABCDDCBA':
   state.stage==='finished'?'QUATRO TIMES COMPLETOS': 'Crie os jogadores fictícios';
 panel.querySelector('#tlab-clock').textContent=state.stage==='draft'?
   Math.max(0,Math.ceil((state.deadline-Date.now())/1000))+'s':'—';
 panel.querySelector('#tlab-captain').disabled=state.stage!=='queue';
 panel.querySelector('#tlab-captain').value=state.captainLane;
 panel.querySelector('#tlab-confirmall').disabled=state.stage!=='queue';
 panel.querySelector('#tlab-undo').disabled=!state.history.length;
 panel.querySelector('#tlab-players').innerHTML=state.players.map(p=>{
   const canPick=state.stage==='draft'&&!p.side&&p.lane!==state.captainLane&&!selectedLane(current(),p.lane);
   return `<tr><td>${esc(p.nick)}${p.captain?' ★':''}</td><td>${p.lane}</td><td>${p.tier}</td><td>${p.side?'Time '+p.side:p.confirmed?'Confirmado':'Pendente'}</td><td>${!p.confirmed&&state.stage==='queue'?`<button type="button" data-confirm="${p.id}">Confirmar</button>`:canPick?`<button type="button" data-pick="${p.id}">Escolher</button>`:''}</td></tr>`;
 }).join('');
 panel.querySelector('#tlab-teams').innerHTML=SIDES.map(side=>`<div style="background:#151b15;border:1px solid #4a6549;padding:12px;border-radius:9px;flex:1;min-width:160px"><b>TIME ${side} · ${team(side).length}/5</b><br>${LANES.map(l=>{
   const p=team(side).find(p=>p.lane===l);
   return '<small>'+l+': '+(p?esc(p.nick):'—')+'</small>';
 }).join('<br>')}</div>`).join('');
 panel.querySelector('#tlab-history').textContent=state.picks.map((p,i)=>
   (i+1)+'. '+p.side+' escolheu '+state.players.find(x=>x.id===p.id).nick+(p.automatic?' (AUTO)':'')).join(' · ');
 controls.forEach(button=>{if(button.dataset.pick!==undefined)button.disabled=state.stage!=='draft'||Date.now()>state.deadline;});
}
async function init(){
 const user=await window.CMIMAuth?.user?.();
 if(user?.app_metadata?.cmim_admin!==true)return;
 const host=document.querySelector('#main > section');if(!host)return;
 panel=document.createElement('section');
 panel.className='card';panel.style.borderColor='#c0a038';
 panel.innerHTML=`<h2>Laboratório ADM · Torneio 4 times</h2>
 <p class="muted">Teste sozinho com vinte jogadores fictícios, quatro por lane, quatro capitães, draft snake e autoatribuição. <b>Modo local: sem criar salas, sem alterar o ranking.</b></p>
 <div class="actions">
  <button id="tlab-reset" type="button" class="primary">Gerar 20 jogadores</button>
  <button id="tlab-confirmall" type="button">Confirmar os 20</button>
  <button id="tlab-undo" type="button">Desfazer último pick</button>
  <button id="tlab-restartclock" type="button">Reiniciar 60s</button>
 </div>
 <label>Lane dos quatro capitães<select id="tlab-captain">${LANES.map(l=>`<option value="${l}">${l}</option>`).join('')}</select></label>
 <p><b id="tlab-state"></b> · <strong id="tlab-clock">—</strong></p>
 <div class="actions" id="tlab-teams"></div>
 <div class="tablewrap"><table><thead><tr><th>Jogador</th><th>Lane</th><th>Tier</th><th>Etapa</th><th>Ação</th></tr></thead><tbody id="tlab-players"></tbody></table></div>
 <p class="muted" id="tlab-history" aria-live="polite"></p>`;
 host.prepend(panel);
 panel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='tlab-reset'){generate();return;}
  if(b.id==='tlab-confirmall'&&state.stage==='queue'){
   state.players.forEach(p=>p.confirmed=true);start();render();return;
  }
  if(b.id==='tlab-undo'&&state.history.length){
   const last=state.history.pop();Object.assign(state,last);state.deadline=Date.now()+60000;render();return;
  }
  if(b.id==='tlab-restartclock'&&state.stage==='draft'){state.deadline=Date.now()+60000;render();return;}
  if(b.dataset.confirm!==undefined&&state.stage==='queue'){
   const p=state.players.find(p=>p.id===Number(b.dataset.confirm));
   if(p){p.confirmed=true;if(state.players.every(p=>p.confirmed))start();render();}return;
  }
  if(b.dataset.pick!==undefined)pick(Number(b.dataset.pick));
 });
 panel.querySelector('#tlab-captain').addEventListener('change',e=>{
   if(state.stage==='queue'&&LANES.includes(e.target.value)){state.captainLane=e.target.value;render();}
 });
 generate();
 setInterval(()=>{
   if(!panel||state.stage!=='draft')return;
   const sec=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));
   panel.querySelector('#tlab-clock').textContent=sec+'s';
   if(sec===0)panel.querySelectorAll('[data-pick]').forEach(b=>b.disabled=true);
 },350);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(()=>{}));
else init().catch(()=>{});
})();
