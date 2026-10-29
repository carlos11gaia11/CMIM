export const ORDER = [
 ['B','ban'],['R','ban'],['B','ban'],['R','ban'],['B','ban'],['R','ban'],
 ['B','pick'],['R','pick'],['R','pick'],['B','pick'],['B','pick'],['R','pick'],
 ['R','ban'],['B','ban'],['R','ban'],['B','ban'],
 ['R','pick'],['B','pick'],['B','pick'],['R','pick']
];
export const ADJUST_SECONDS = 30;
export const HIDDEN_GRACE_MS = 5000;
export const CHANGE_SECONDS = 10;
export function initial(config={}) {
 const duration = [20,30,45,60,90].includes(Number(config.duration)) ? Number(config.duration) : 30;
 const teams = ['B','R'].map((side,i)=>({name:String(config.teams?.[i]?.name||`Time ${i+1}`).slice(0,40),logo:cleanLogo(config.teams?.[i]?.logo),captain:String(config.teams?.[i]?.captain||config.teams?.[i]?.players?.[0]||'Capitão').slice(0,24),profileIds:Array.from({length:5},(_,j)=>/^[a-f0-9]{8}-[a-f0-9-]{27,}$/.test(String(config.teams?.[i]?.profileIds?.[j]||''))?config.teams[i].profileIds[j]:null),players:Array.from({length:5},(_,j)=>String(config.teams?.[i]?.players?.[j]||['Top','Jungle','Mid','ADC','Support'][j]).slice(0,24))}));
 return {sideOwners:['B','R'],ready:[false,false],swapDuration:ADJUST_SECONDS,swapDeadline:0,lanes:[['TOP','JGL','MID','ADC','SUP'],['TOP','JGL','MID','ADC','SUP']],presentation:cleanPresentation(config.presentation),teams,mode:['Normal','Fearless','Ironman'].includes(config.mode)?config.mode:'Normal',games:[1,3,5].includes(Number(config.games))?Number(config.games):3,duration,disabled:Array.isArray(config.disabled)?config.disabled.filter(x=>typeof x==='string').slice(0,200):[],first:'B',game:1,history:[],actions:[],started:false,paused:false,remaining:duration,deadline:0,score:[0,0],swaps:[[0,1,2,3,4],[0,1,2,3,4]],pendingDecision:null,changeRequest:null,resultVotes:{B:null,R:null},lastConfirmedResult:null,season:config.season||null,pilot:config.pilot===true,lastEvent:null};
}
export function cleanLogo(value) {return typeof value==='string' && value.length<600000 && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value)?value:''}
export function turn(s) { const t=ORDER[s.actions.length]; return t ? {side:t[0],type:t[1]} : null; }
export function roleFor(s,identity){if(!['B','R'].includes(identity))return identity;return (s.sideOwners||['B','R'])[0]===identity?'B':'R';}
export function locked(s) {return new Set([...s.disabled,...s.actions.filter(a=>a.champion).map(a=>a.champion),...s.history.flatMap(g=>g.actions.filter(a=>s.mode==='Ironman'||(s.mode==='Fearless'&&a.type==='pick')).map(a=>a.champion)).filter(Boolean)]);}
const decisions=new Set(['undo','reset']);
export function apply(s,action,role,champions=[],now=Date.now()) {
 const next=structuredClone(s),captain=['B','R'].includes(role);
 const needCaptain=()=>{if(!captain)throw Error('Somente os capitães podem fazer isso.');};
 if(!action||typeof action.type!=='string')throw Error('Ação inválida.');
 // Um pedido de correção congela a sequência até a resposta e a escolha final.
 const restoreClock=()=>{
  const req=next.changeRequest;
  if(!req)return;
  next.paused=req.wasPaused;
  if(turn(next)&&!req.wasPaused)next.deadline=now+req.remainingMs;
  if(!turn(next)&&req.adjustRemainingMs!==null)next.swapDeadline=now+req.adjustRemainingMs;
  next.changeRequest=null;
 };
 if(next.changeRequest){
  if(!['change_answer','change_commit','change_cancel','change_timeout'].includes(action.type))
   throw Error('Existe uma solicitação de troca de campeão em andamento.');
 }
 if(action.type==='change_request'){
  needCaptain();
  if(!next.started||next.finished)throw Error('Não há draft ativo para corrigir.');
  if(!turn(next)&&(!next.swapDeadline||now>=next.swapDeadline))throw Error('O período de ajustes já terminou.');
  if(!Number.isInteger(action.index)||action.index<0||action.index>=next.actions.length)throw Error('Escolha inválida.');
  const pick=next.actions[action.index];
  if(pick.type!=='pick'||pick.side!==role||!pick.champion)throw Error('Só é possível pedir a troca de um campeão escolhido pelo seu time.');
  next.changeRequest={by:role,index:action.index,original:pick.champion,status:'requested',until:0,wasPaused:next.paused,remainingMs:turn(next)?Math.max(1000,(next.paused?(next.remaining||next.duration)*1000:next.deadline-now)):0,adjustRemainingMs:turn(next)?null:Math.max(0,next.swapDeadline-now)};
  next.paused=true;
  return next;
 }
 if(action.type==='change_answer'){
  needCaptain();
  const req=next.changeRequest;
  if(!req||req.status!=='requested'||req.by===role)throw Error('Esta solicitação não está disponível para você.');
  if(action.approve===true){req.status='select';req.until=now+CHANGE_SECONDS*1000;}
  else restoreClock();
  return next;
 }
 if(action.type==='change_cancel'){
  needCaptain();
  if(!next.changeRequest||next.changeRequest.by!==role)throw Error('Somente quem solicitou pode cancelar.');
  restoreClock();return next;
 }
 if(action.type==='change_timeout'){
  needCaptain();
  const req=next.changeRequest;
  if(!req||req.status!=='select'||now<req.until)throw Error('O tempo de troca ainda não terminou.');
  restoreClock();return next;
 }
 if(action.type==='change_commit'){
  needCaptain();
  const req=next.changeRequest;
  if(!req||req.status!=='select'||req.by!==role)throw Error('Troca de campeão não autorizada.');
  if(now>=req.until)throw Error('Os 10 segundos terminaram.');
  if(action.champion===req.original||!champions.includes(action.champion)||locked(next).has(action.champion))
   throw Error('Esse campeão está indisponível para a troca.');
  next.actions[req.index].champion=action.champion;
  next.lastEvent={side:role,type:'pick',champion:action.champion,correction:true,id:crypto.randomUUID()};
  restoreClock();return next;
 }
 // Cada capitao registra o vencedor sem simplesmente aceitar o voto adversario.
 if(action.type==='report_result'){
  needCaptain();
  if(!next.started||next.finished||turn(next)||!next.swapDeadline||now<next.swapDeadline)
   throw Error('Aguarde o fim do draft e dos 30 segundos de ajustes.');
  if(next.changeRequest)throw Error('Conclua primeiro a solicitacao de troca.');
  if(!['B','R'].includes(action.winner))throw Error('Escolha um vencedor valido.');
  next.resultVotes??={B:null,R:null};
  next.resultVotes[role]={winner:action.winner,invertSides:next.game<next.games&&action.invertSides===true,at:now};
  const blue=next.resultVotes.B,red=next.resultVotes.R;
  if(!blue||!red)return next;
  // Divergencia bloqueia a transicao; ambos podem reenviar sua escolha.
  if(blue.winner!==red.winner||blue.invertSides!==red.invertSides)return next;
  const winner=blue.winner,invertSides=blue.invertSides;
  next.lastConfirmedResult={game:next.game,winner,at:now};
  next.score[winner==='B'?0:1]++;
  next.pendingDecision=null;
  next.resultVotes={B:null,R:null};
  if(next.game>=next.games||Math.max(...next.score)>=Math.ceil(next.games/2)){
   next.finished=true;next.finalWinner=winner;
  }else{
   next.history.push({game:next.game,actions:next.actions,winner,teams:next.teams,swaps:next.swaps,lanes:next.lanes,confirmedAt:now});
   if(invertSides){
    next.teams=[...next.teams].reverse();
    next.score=[...next.score].reverse();
    next.sideOwners=[...(next.sideOwners||['B','R'])].reverse();
   }
   next.game++;next.first='B';
   next.ready=[false,false];next.swapDeadline=0;
   next.lanes=[['TOP','JGL','MID','ADC','SUP'],['TOP','JGL','MID','ADC','SUP']];
   next.actions=[];next.started=false;next.paused=false;next.lastEvent=null;
   next.swaps=[[0,1,2,3,4],[0,1,2,3,4]];next.changeRequest=null;
  }
  return next;
 }
 // Comandos que mudam a partida exigem aprovação dos dois capitães, sem Master.
 if(decisions.has(action.type)) {
  needCaptain();
  if(action.type==='undo'&&(!next.actions.length||next.finished))throw Error('Não há ações para desfazer.');
  if(action.type==='reset'&&(!next.started||next.finished))throw Error('Não é possível reiniciar este jogo.');
  const vote={type:action.type};
  if(!next.pendingDecision||JSON.stringify(next.pendingDecision.action)!==JSON.stringify(vote)||next.pendingDecision.by===role) {
   if(next.pendingDecision?.by===role&&JSON.stringify(next.pendingDecision.action)===JSON.stringify(vote))throw Error('Sua solicitação já foi enviada. Aguarde o outro capitão.');
   next.pendingDecision={action:vote,by:role};
   return next;
  }
  next.pendingDecision=null;
 } else next.pendingDecision=null;
 if(action.type==='presentation') {needCaptain();if(next.started)throw Error('Personalização da sala disponível antes do draft.');next.presentation=cleanPresentation(action.presentation);next.ready=[false,false];}
 else if(action.type==='ready') {
  if(next.started)throw Error('Draft já iniciado.');needCaptain();
  const i=role==='R'?1:0;next.ready??=[false,false];next.ready[i]=!next.ready[i];
  if(next.ready.every(Boolean)){next.started=true;next.paused=false;next.remaining=next.duration;next.deadline=now+next.duration*1000;}
 }
 else if(action.type==='confirm') {
  const t=turn(next);if(!next.started||next.paused||!t)throw Error('Draft indisponível para seleção.');
  if(role!==t.side)throw Error('Aguarde o turno do seu time.');
  if(now>=next.deadline+HIDDEN_GRACE_MS)throw Error('O tempo do turno acabou.');
  if(!champions.includes(action.champion)||locked(next).has(action.champion))throw Error('Campeão indisponível.');
  next.actions.push({...t,champion:action.champion});next.lastEvent={...t,champion:action.champion,id:crypto.randomUUID()};next.deadline=now+next.duration*1000;
  if(!turn(next))next.swapDeadline=now+ADJUST_SECONDS*1000;
 }
 else if(action.type==='timeout') {
  if(!next.started||next.paused||!turn(next)||now<next.deadline+HIDDEN_GRACE_MS)throw Error('O tempo ainda não acabou.');
  const t=turn(next);
  if(t.type==='ban'){next.actions.push({...t,champion:null});next.lastEvent={...t,champion:null,id:crypto.randomUUID()};next.deadline=now+next.duration*1000;}
  else {next.paused=true;next.remaining=0;}
 }
 else if(action.type==='pause') {needCaptain();if(!next.started||!turn(next))throw Error('Nenhum turno ativo.');next.paused=!next.paused;if(next.paused)next.remaining=Math.max(0,(next.deadline-now)/1000);else next.deadline=now+(next.remaining>0?next.remaining:next.duration)*1000;}
 else if(action.type==='undo') {next.resultVotes={B:null,R:null};next.lastConfirmedResult=null;next.swapDeadline=0;next.actions.pop();next.paused=false;next.deadline=now+next.duration*1000;next.lastEvent=null;}
 else if(action.type==='reset') {next.ready=[false,false];next.swapDeadline=0;next.lanes=[['TOP','JGL','MID','ADC','SUP'],['TOP','JGL','MID','ADC','SUP']];next.actions=[];next.started=false;next.paused=false;next.lastEvent=null;next.swaps=[[0,1,2,3,4],[0,1,2,3,4]];next.changeRequest=null;next.resultVotes={B:null,R:null};next.lastConfirmedResult=null;}
 else if(action.type==='lane') {const i=action.side==='R'?1:0;if(!captain||role!==action.side)throw Error('Você só pode ajustar seu time.');if(turn(next)||next.finished||!next.swapDeadline||now>=next.swapDeadline)throw Error('Tempo de ajustes encerrado.');if(!Number.isInteger(action.player)||action.player<0||action.player>4||!['TOP','JGL','MID','ADC','SUP'].includes(action.lane))throw Error('Posição inválida.');next.lanes??=[['TOP','JGL','MID','ADC','SUP'],['TOP','JGL','MID','ADC','SUP']];const j=next.lanes[i].indexOf(action.lane);[next.lanes[i][action.player],next.lanes[i][j]]=[next.lanes[i][j],next.lanes[i][action.player]];}
 else if(action.type==='swap') {const i=action.side==='R'?1:0;if(!captain||role!==action.side)throw Error('Você só pode trocar seu time.');if(turn(next)||next.finished||!next.swapDeadline||now>=next.swapDeadline)throw Error('Trocas disponíveis somente nos 30 segundos de ajustes.');if(!Number.isInteger(action.a)||!Number.isInteger(action.b)||action.a<0||action.a>4||action.b<0||action.b>4)throw Error('Posição inválida.');[next.swaps[i][action.a],next.swaps[i][action.b]]=[next.swaps[i][action.b],next.swaps[i][action.a]];}
 else if(action.type==='teams') {needCaptain();if(next.started)throw Error('Times só podem ser editados antes do draft.');next.teams=initial({...next,teams:action.teams}).teams;next.ready=[false,false];}
 else throw Error('Ação inválida.');
 return next;
}
export function cleanPresentation(p={}) {
 const url=(v,allowMp3=false)=>{try{const u=new URL(v);const path=u.pathname.toLowerCase();return u.protocol==='https:'&&u.href.length<2048&&(path.endsWith('.mp4')||(allowMp3&&path.endsWith('.mp3')))?u.href:''}catch{return ''}};
 return {name:String(p?.name||'CMIM DRAFT').slice(0,40),color:/^#[0-9a-f]{6}$/i.test(p?.color)?p.color:'#ffe000',logo:cleanLogo(p?.logo),layout:['classic','vertical','horizontal','cinema','compact','worlds','broadcast'].includes(p?.layout)?p.layout:'classic',specMode:['events','video','both'].includes(p?.specMode)?p.specMode:'both',music:url(p?.music,true),video:url(p?.video),banSound:url(p?.banSound),pickSound:url(p?.pickSound),volume:Math.max(0,Math.min(1,Number(p?.volume??0.5))),animations:p?.animations!==false,intensity:['soft','normal','epic'].includes(p?.intensity)?p.intensity:'epic'};
}
