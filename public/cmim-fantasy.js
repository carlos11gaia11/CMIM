(()=>{'use strict';
const $=id=>document.getElementById(id), A=window.CMIMAuth, L=['TOP','JG','MID','ADC','SUP'], esc=A.esc, fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2});
const opt=(v,t,s=false)=>'<option value="'+esc(v)+'"'+(s?' selected':'')+'>'+esc(t)+'</option>';
let rounds=[],round=null,market=[],scores=[],games=[],stats=[],user=null,admin=false,picks={},captain='',saved=false,version=0,editing=null,busy=false,teamProfile=null;
const rest=(table,query='',secure=false)=>A.call('/rest/v1/'+table+'?'+query,{secure});
const rpc=(name,body,secure=true)=>A.call('/rest/v1/rpc/cmim_fantasy_'+name,{method:'POST',body,secure});
const open=()=>!!round&&!round.finalized&&Date.parse(round.closes_at)>Date.now();
const get=id=>market.find(p=>p.player_id===id), score=id=>scores.find(p=>p.player_id===id);
function msg(s='',error=false){$('message').hidden=!s;$('message').textContent=s;$('message').classList.toggle('error',error)}
async function task(fn){if(busy)return;busy=true;try{msg();await fn()}catch(e){msg(e.message||'Falha ao consultar Fantasy',true)}finally{busy=false;controls()}}
function controls(){
 const can=open()&&!!user&&!!teamProfile, cost=Object.values(picks).reduce((a,id)=>a+(get(id)?.price||0),0);
 $('balance').textContent=fmt(100-cost)+' C$';$('balance').style.color=cost>100?'#ff8888':'';$('count').textContent=Object.values(picks).filter(Boolean).length+'/5';
 $('team-name').disabled=!user||busy;$('register-team').disabled=!user||busy||!$('team-name').value.trim();$('register-team').textContent=teamProfile?'Salvar nome do time':'Criar meu time';$('team-state').textContent=!user?'Entre na sua conta CMIM para criar seu time.':teamProfile?'Time cadastrado: '+teamProfile.name:'Crie seu time agora, mesmo sem uma rodada aberta.';$('lineup-help').textContent=!user?'Entre na sua conta para jogar.':!teamProfile?'Primeiro, crie seu time no campo acima.':!round?'Seu time está cadastrado. Aguarde a primeira rodada para escolher os jogadores.':!open()?'O mercado desta rodada está fechado.':'Selecione os cinco jogadores e o capitão, respeitando os 100 créditos.';$('name').disabled=!can;$('captain').disabled=!can;$('save').disabled=busy||!can||cost>100||L.some(l=>!picks[l])||!captain;
 $('login').hidden=!!user;$('team-login').hidden=!!user; $('saved').textContent=saved?'Escalação salva':'Não salva';
 $('round-state').textContent=!round?'Nenhuma rodada aberta':round.finalized?'Rodada publicada':open()?'Mercado aberto':'Mercado fechado';
 $('deadline').textContent=round?'Fechamento: '+new Date(round.closes_at).toLocaleString('pt-BR'):'O administrador precisa criar a primeira rodada.';
 $('close').disabled=busy||!admin||!open();$('publish').disabled=busy||!admin||!round||open()||round.finalized||!games.length;
 $('save-game').disabled=busy||!admin||!round||open()||round.finalized;
 $('admin-tab').hidden=!admin;
 const sum=Object.values(picks).filter(Boolean).reduce((a,id)=>a+Number(score(id)?.points||0)*(id===captain?1.5:1),0);
 $('own-points').textContent=round&&saved&&scores.length?fmt(sum):'—';
 document.querySelectorAll('#slots select,#market button').forEach(el=>el.disabled=!can);
}
function renderSlots(){
 $('slots').innerHTML=L.map(l=>'<div class="slot"><b>'+l+'</b><select data-lane="'+l+'" aria-label="Escalar '+l+'">'+opt('','Escolher jogador',!picks[l])+market.filter(p=>p.lane===l).sort((a,b)=>a.price-b.price).map(p=>opt(p.player_id,p.nick+' · '+p.team+' · '+p.price+' C$',picks[l]===p.player_id)).join('')+'</select></div>').join('');
 $('captain').innerHTML=opt('','Escolher capitão',!captain)+L.filter(l=>picks[l]).map(l=>opt(picks[l],get(picks[l])?.nick||l,captain===picks[l])).join('');
 controls();
}
function pick(l,id){if(!open()||!user||!teamProfile)return;picks[l]=id;if(!Object.values(picks).includes(captain))captain='';saved=false;renderSlots();renderMarket()}
function renderMarket(){
 const q=$('search').value.trim().toLowerCase(),lane=$('lane-filter').value,order=$('order').value;
 const list=market.filter(p=>(!lane||p.lane===lane)&&(!q||(p.nick+' '+p.team+' '+p.elo).toLowerCase().includes(q))).sort((a,b)=>order==='high'?b.price-a.price:order==='points'?Number(score(b.player_id)?.points||0)-Number(score(a.player_id)?.points||0):a.price-b.price);
 $('market').innerHTML=list.length?list.map(p=>{const image=/^https:\/\//i.test(p.avatar||'')?'<img class="avatar" src="'+esc(p.avatar)+'" alt="" loading="lazy">':'<span class="avatar">'+esc(p.nick.slice(0,1))+'</span>';return '<article class="player"><div class="row">'+image+'<div><h3>'+esc(p.nick)+'</h3><small>'+esc(p.team)+'</small></div></div><div class="row between"><span class="pill">'+esc(p.lane)+' · '+esc(p.elo.replaceAll('_',' '))+'</span><span class="price">'+p.price+' C$</span></div><small>'+ (p.starter?'Titular':'Reserva')+' · '+(score(p.player_id)?fmt(score(p.player_id).points)+' pts':'Sem jogos')+'</small><button data-pick="'+esc(p.player_id)+'" class="'+(picks[p.lane]===p.player_id?'secondary':'')+'">'+(picks[p.lane]===p.player_id?'Escalado':'Escalar')+'</button></article>'}).join(''):'<p class="muted">'+(round?'Nenhum jogador encontrado.':'O mercado aparece quando uma rodada é criada.')+'</p>';controls();
}
function renderScores(){
 $('scores').innerHTML=scores.length?scores.slice().sort((a,b)=>Number(b.points)-Number(a.points)).map(s=>{const p=get(s.player_id);return '<tr><td>'+esc(p?.nick||'Jogador')+'</td><td>'+esc(p?.team||'—')+'</td><td>'+esc(p?.lane||'—')+'</td><td>'+s.games+'</td><td><strong>'+fmt(s.points)+'</strong></td></tr>'}).join(''):'<tr><td colspan="5">Nenhuma partida registrada.</td></tr>';
 $('results-games').innerHTML=games.length?games.map(g=>'<details class="notice"><summary>'+esc(g.label)+'</summary><div class="tablewrap"><table><thead><tr><th>Jogador</th><th>Rota</th><th>K/D/A</th><th>Farm</th></tr></thead><tbody>'+stats.filter(s=>s.game_id===g.id).map(s=>'<tr><td>'+esc(get(s.player_id)?.nick||'Jogador')+'</td><td>'+esc(get(s.player_id)?.lane||'—')+'</td><td>'+s.kills+'/'+s.deaths+'/'+s.assists+'</td><td>'+s.farm+'</td></tr>').join('')+'</tbody></table></div></details>').join(''):'<p class="muted">Sem jogos.</p>';
}
async function ranking(){const id=$('ranking-mode').value==='round'?round?.id:null;if($('ranking-mode').value==='round'&&!id){$('ranking').innerHTML='<tr><td colspan="4">Selecione uma rodada.</td></tr>';return}const data=await rpc('ranking',{p_round:id},false);$('ranking').innerHTML=data.length?data.map((r,i)=>'<tr><td>'+ (i+1) +'º</td><td>'+esc(r.name)+'</td><td>'+r.rounds+'</td><td><strong>'+fmt(r.points)+'</strong></td></tr>').join(''):'<tr><td colspan="4">Nenhuma pontuação publicada ainda.</td></tr>'}
function teams(){const map=new Map();market.forEach(p=>map.set(p.team_id,p.team));return [...map].sort((a,b)=>a[1].localeCompare(b[1]))}
function renderAdmin(){
 const options=opt('','Selecione a equipe')+teams().map(([id,n])=>opt(id,n)).join('');
 $('team-a').innerHTML=options;$('team-b').innerHTML=options;$('game-label').value='';editing=null;
 $('admin-games').innerHTML=games.map(g=>'<button type="button" class="secondary" data-game="'+esc(g.id)+'">'+esc(g.label)+'</button>').join('');
 renderSide('a');renderSide('b');controls();
}
function renderSide(side,old=[]){
 const team=$('team-'+side).value;
 $('game-'+side).innerHTML='<h3>Equipe '+side.toUpperCase()+'</h3><div class="game-row muted"><span>Rota</span><span>Jogador</span><span>K</span><span>D</span><span>A</span><span>Farm</span></div>'+L.map(l=>{const ps=market.filter(p=>p.team_id===team&&p.lane===l).sort((a,b)=>Number(b.starter)-Number(a.starter)),prev=old.find(s=>ps.some(p=>p.player_id===s.player_id)),id=prev?.player_id||ps[0]?.player_id||'';return '<div class="game-row" data-game-row><b>'+l+'</b><select aria-label="'+side+' '+l+' jogador" required>'+opt('','Selecione',!id)+ps.map(p=>opt(p.player_id,p.nick,p.player_id===id)).join('')+'</select>'+['kills','deaths','assists','farm'].map(k=>'<input type="number" min="0" max="'+(k==='farm'?1500:100)+'" step="1" value="'+(prev?prev[k]:'')+'" required aria-label="'+side+' '+l+' '+k+'">').join('')+'</div>'}).join('');
}
function editGame(id){const g=games.find(x=>x.id===id);if(!g)return;editing=id;$('game-label').value=g.label;$('team-a').value=g.team_a;$('team-b').value=g.team_b;const old=stats.filter(s=>s.game_id===id);renderSide('a',old);renderSide('b',old)}
async function loadRound(id){
 const v=++version;round=rounds.find(r=>r.id===id)||null;market=[];scores=[];games=[];stats=[];picks={};captain='';saved=false;$('name').value=teamProfile?.name||'';
 if(round){const filter='round_id=eq.'+encodeURIComponent(round.id);const result=await Promise.all([rest('cmim_fantasy_market',filter),rest('cmim_fantasy_player_scores',filter),rest('cmim_fantasy_games',filter),rest('cmim_fantasy_stats',filter),user?rest('cmim_fantasy_lineups',filter,true):Promise.resolve([])]);if(v!==version)return;
 [market,scores,games,stats]=result;const own=result[4][0];if(own){own.picks.forEach(id=>{const p=get(id);if(p)picks[p.lane]=id});captain=own.captain;$('name').value=own.name;saved=true}}
 renderSlots();renderMarket();renderScores();renderAdmin();await ranking();controls();
}
async function load(id){user=await A.user();admin=user?.app_metadata?.cmim_admin===true;teamProfile=user?(await rest('cmim_fantasy_teams','select=name&user_id=eq.'+encodeURIComponent(user.id),true))[0]||null:null;$('team-name').value=teamProfile?.name||'';rounds=await rest('cmim_fantasy_rounds','order=created_at.desc');$('round').innerHTML=rounds.length?rounds.map(r=>opt(r.id,r.title,r.id===id)).join(''):opt('','Nenhuma rodada');if(id&&rounds.some(r=>r.id===id))$('round').value=id;await loadRound($('round').value)}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(b.dataset.tab==='admin'&&!admin)return;document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));for(const t of ['play','ranking','results','admin'])$('tab-'+t).hidden=t!==b.dataset.tab;if(b.dataset.tab==='ranking')task(ranking)});
$('team-name').oninput=controls;
$('team-form').onsubmit=e=>{e.preventDefault();task(async()=>{if(!user)throw Error('Entre na sua conta CMIM.');const name=$('team-name').value.trim();if(!name||name.length>40)throw Error('Informe um nome de 1 a 40 caracteres.');const data=await A.call('/rest/v1/cmim_fantasy_teams?on_conflict=user_id',{method:'POST',secure:true,headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:{user_id:user.id,name}});teamProfile=data[0];if(!saved)$('name').value=teamProfile.name;renderSlots();renderMarket();msg('Seu time Fantasy foi cadastrado com sucesso!'+(round?'':' A escalação estará disponível quando uma rodada abrir.'));})};
$('round').onchange=()=>task(()=>loadRound($('round').value));$('refresh').onclick=()=>task(()=>load(round?.id));
$('search').oninput=renderMarket;$('lane-filter').onchange=renderMarket;$('order').onchange=renderMarket;
$('slots').onchange=e=>{if(e.target.dataset.lane)pick(e.target.dataset.lane,e.target.value)};
$('market').onclick=e=>{const b=e.target.closest('[data-pick]');if(b){const p=get(b.dataset.pick);if(p)pick(p.lane,p.player_id)}};
$('captain').onchange=()=>{captain=$('captain').value;saved=false;controls()};$('name').oninput=()=>{saved=false;controls()};
$('save').onclick=()=>task(async()=>{if(!$('name').value.trim())throw Error('Informe o nome do seu time.');await rpc('save',{p_round:round.id,p_name:$('name').value.trim(),p_picks:L.map(l=>picks[l]),p_captain:captain});saved=true;msg('Escalação salva para esta rodada.');controls()});
$('ranking-mode').onchange=()=>task(ranking);
$('create').onsubmit=e=>{e.preventDefault();task(async()=>{if(!admin)return;const id=await rpc('create',{p_title:$('new-title').value.trim(),p_closes:new Date($('new-close').value).toISOString()});$('create').reset();await load(id);msg('Rodada criada e mercado aberto.')})};
$('close').onclick=()=>{if(round&&confirm('Fechar o mercado definitivamente para esta rodada?'))task(async()=>{await rpc('close',{p_round:round.id,p_publish:false});await load(round.id);msg('Mercado fechado.')})};
$('publish').onclick=()=>{if(round&&confirm('Publicar os resultados e encerrar a edição da rodada? Confira todos os jogos antes.'))task(async()=>{await rpc('close',{p_round:round.id,p_publish:true});await load(round.id);msg('Pontuação publicada no ranking.')})};
$('team-a').onchange=()=>renderSide('a');$('team-b').onchange=()=>renderSide('b');
$('admin-games').onclick=e=>{const b=e.target.closest('[data-game]');if(b)editGame(b.dataset.game)};
$('clear-game').onclick=renderAdmin;
$('game-form').onsubmit=e=>{e.preventDefault();task(async()=>{if(!round||!admin)return;const label=$('game-label').value.trim();const existing=games.find(g=>g.label===label);if(editing&&existing?.id!==editing)throw Error('Não altere a identificação de um jogo existente. Use Novo jogo para outro registro.');if(existing&&!editing&&!confirm('Já existe um jogo com esse nome. Substituir suas estatísticas?'))return;
 const data=[...document.querySelectorAll('[data-game-row]')].map(el=>{const [k,d,a,f]=[...el.querySelectorAll('input')].map(x=>Number(x.value));return {player_id:el.querySelector('select').value,kills:k,deaths:d,assists:a,farm:f}});
 await rpc('game',{p_round:round.id,p_label:label,p_team_a:$('team-a').value,p_team_b:$('team-b').value,p_stats:data});await loadRound(round.id);msg('Jogo salvo. Pontuações recalculadas.')})};
setInterval(controls,1000);task(()=>load());
})();