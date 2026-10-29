import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,locked,turn,roleFor,cleanPresentation,ADJUST_SECONDS} from './engine.mjs';
const ids=Array.from({length:120},(_,i)=>'C'+i);
function ready(config={},now=0){let s=initial(config);s=apply(s,{type:'ready'},'B',ids,now);return apply(s,{type:'ready'},'R',ids,now);}
function complete(mode='Normal',games=3){let s=ready({mode,games},0);for(let i=0;i<20;i++)s=apply(s,{type:'confirm',champion:ids[i]},turn(s).side,ids,1);return s;}
function jointly(s,a,now){const ballot=['next','finish'].includes(a.type)?{type:'report_result',winner:a.winner,invertSides:a.invertSides===true}:a;s=apply(s,ballot,'B',ids,now);return apply(s,ballot,'R',ids,now);}
test('sem Master: os dois capitães iniciam o draft automaticamente na segunda confirmação',()=>{let s=initial({});assert.equal(s.started,false);s=apply(s,{type:'ready'},'B',ids,1000);assert.deepEqual(s.ready,[true,false]);assert.equal(s.started,false);s=apply(s,{type:'ready'},'R',ids,2000);assert.equal(s.started,true);assert.equal(s.deadline,32000);assert.throws(()=>apply(s,{type:'ready'},'B'));assert.throws(()=>apply(s,{type:'start'},'B'));assert.throws(()=>apply(initial({}),{type:'ready'},'admin'));assert.throws(()=>apply(initial({}),{type:'ready'},'viewer'));});
test('20 ações, 10 picks, 10 bans e cinco picks por time',()=>{const s=complete();assert.equal(turn(s),null);for(const side of ['B','R'])for(const type of ['ban','pick'])assert.equal(s.actions.filter(a=>a.side===side&&a.type===type).length,5);});
test('captão não joga fora de turno ou campeão duplicado e viewer não edita',()=>{let s=ready();assert.throws(()=>apply(s,{type:'confirm',champion:ids[0]},'R',ids,1));s=apply(s,{type:'confirm',champion:ids[0]},'B',ids,1);assert.throws(()=>apply(s,{type:'confirm',champion:ids[0]},'R',ids,2));assert.throws(()=>apply(s,{type:'pause'},'viewer',ids,2));});
test('30 segundos fixos de ajustes após o último pick',()=>{let s=complete();assert.equal(ADJUST_SECONDS,30);assert.equal(s.swapDuration,30);assert.equal(s.swapDeadline,30001);assert.throws(()=>apply(s,{type:'swap',side:'B',a:0,b:4},'R',ids,2));s=apply(s,{type:'swap',side:'B',a:0,b:4},'B',ids,2);assert.deepEqual(s.swaps[0],[4,1,2,3,0]);s=apply(s,{type:'lane',side:'B',player:0,lane:'MID'},'B',ids,2);assert.equal(s.lanes[0][0],'MID');assert.throws(()=>apply(s,{type:'lane',side:'B',player:0,lane:'SUP'},'B',ids,30001));assert.throws(()=>apply(s,{type:'swap',side:'B',a:0,b:4},'B',ids,30001));});
test('sem ação de Master: desfazer e reiniciar exigem dois capitães',()=>{let s=ready();s=apply(s,{type:'confirm',champion:ids[0]},'B',ids,1);s=apply(s,{type:'undo'},'B',ids,2);assert.equal(s.actions.length,1);assert.equal(s.pendingDecision.by,'B');assert.throws(()=>apply(s,{type:'undo'},'B',ids,3));s=apply(s,{type:'undo'},'R',ids,4);assert.equal(s.actions.length,0);assert.equal(s.pendingDecision,null);s=apply(s,{type:'reset'},'R',ids,5);assert.equal(s.started,true);s=apply(s,{type:'reset'},'B',ids,6);assert.equal(s.started,false);assert.deepEqual(s.ready,[false,false]);});
test('próxima partida e placar exigem aprovação após o prazo de 30 segundos',()=>{let s=complete('Fearless');assert.throws(()=>apply(s,{type:'report_result',winner:'B'},'B',ids,30000));s=apply(s,{type:'report_result',winner:'B',invertSides:true},'B',ids,30002);assert.equal(s.game,1);assert.equal(s.resultVotes.B.winner,'B');s=apply(s,{type:'report_result',winner:'B',invertSides:true},'R',ids,30003);assert.equal(s.game,2);assert.deepEqual(s.score,[0,1]);assert.deepEqual(s.sideOwners,['R','B']);assert.equal(roleFor(s,'B'),'R');assert.equal(roleFor(s,'R'),'B');assert.equal(locked(s).size,10);});
test('primeiro jogo finalizado em modo de um jogo, sem registro duplo',()=>{let s=complete('Normal',1);s=jointly(s,{type:'finish',winner:'R'},30002);assert.equal(s.score[1],1);assert.equal(s.finished,true);assert.throws(()=>apply(s,{type:'report_result',winner:'R'},'B',ids,30003));assert.throws(()=>apply(s,{type:'reset'},'B',ids,30003));});
test('picks e bans: ban expira pulando; pick expira pausando e capitão retoma',()=>{let s=ready();assert.throws(()=>apply(s,{type:'timeout'},'B',ids,10));for(let i=0;i<6;i++)s=apply(s,{type:'timeout'},'B',ids,(i+1)*35000);s=apply(s,{type:'timeout'},'B',ids,245000);assert.equal(s.actions.length,6);assert.equal(s.paused,true);s=apply(s,{type:'pause'},'R',ids,245001);assert.equal(s.paused,false);assert.equal(s.deadline,275001);});
test('tempo congelado e retomado preserva restante',()=>{let s=ready({duration:30},1000);s=apply(s,{type:'pause'},'B',ids,11000);assert.equal(s.remaining,20);assert.throws(()=>apply(s,{type:'confirm',champion:ids[0]},'B',ids,12000));s=apply(s,{type:'pause'},'R',ids,20000);assert.equal(s.deadline,40000);});
test('Normal, Fearless e Ironman respeitam bloqueios entre jogos',()=>{for(const mode of ['Normal','Fearless','Ironman']){let s=complete(mode);s=jointly(s,{type:'next',winner:'B'},30002);assert.equal(locked(s).size,mode==='Normal'?0:mode==='Fearless'?10:20);}});
test('partida seguinte exige nova confirmação dos dois lados',()=>{let s=complete();s=jointly(s,{type:'next',winner:'B'},30002);assert.deepEqual(s.ready,[false,false]);s=apply(s,{type:'ready'},'R',ids,40000);assert.equal(s.started,false);s=apply(s,{type:'ready'},'B',ids,40000);assert.equal(s.started,true);assert.equal(s.deadline,70000);});
test('manter histórico ao inverter lados e escolher outro vencedor',()=>{let s=complete('Fearless');const orig=s.teams.map(t=>t.name);s=jointly(s,{type:'next',winner:'B',invertSides:true},30002);assert.deepEqual(s.teams.map(t=>t.name),[...orig].reverse());assert.equal(s.history[0].teams[0].name,orig[0]);s=apply(s,{type:'ready'},'R',ids,40000);s=apply(s,{type:'ready'},'B',ids,40000);for(let i=20;i<40;i++)s=apply(s,{type:'confirm',champion:ids[i]},turn(s).side,ids,40001);s=jointly(s,{type:'next',winner:'R',invertSides:true},70002);assert.deepEqual(s.teams.map(t=>t.name),[...orig].reverse());assert.equal(s.game,2);assert.equal(s.finished,true);assert.equal(s.finalWinner,'R');assert.deepEqual(s.score,[0,2]);});
test('som e vídeo aceitam somente HTTPS e MP4; MP3/WAV/JS são bloqueados',()=>{const p=cleanPresentation({music:'https://example.com/musica.mp4?download=1',banSound:'https://a.org/ban.mp3',pickSound:'http://a.org/pick.mp4',video:'https://a.org/movie.webm'});assert.equal(p.music,'https://example.com/musica.mp4?download=1');assert.equal(p.banSound,'');assert.equal(p.pickSound,'');assert.equal(p.video,'');assert.equal(cleanPresentation({music:'javascript:alert(1)'}).music,'');});
test('capitães podem ajustar apresentação e times antes de iniciar (sem Master)',()=>{let s=initial({});s=apply(s,{type:'presentation',presentation:{name:'Liga',layout:'cinema',video:'https://example.com/a.mp4'}},'B');assert.equal(s.presentation.name,'Liga');s=apply(s,{type:'teams',teams:[{name:'A'},{name:'B'}]},'R');assert.equal(s.teams[0].name,'A');s=apply(s,{type:'ready'},'B',ids,0);s=apply(s,{type:'ready'},'R',ids,0);assert.throws(()=>apply(s,{type:'presentation',presentation:{}},'B'));});
test('resultados divergentes bloqueiam avanço ate votos independentes coincidirem',()=>{
 let s=complete();
 s=apply(s,{type:'report_result',winner:'B'},'B',ids,30002);
 assert.equal(s.game,1);
 s=apply(s,{type:'report_result',winner:'R'},'R',ids,30003);
 assert.equal(s.game,1);assert.equal(s.resultVotes.B.winner,'B');assert.equal(s.resultVotes.R.winner,'R');
 assert.deepEqual(s.score,[0,0]);
 s=apply(s,{type:'report_result',winner:'R'},'B',ids,30004);
 assert.equal(s.game,2);assert.deepEqual(s.score,[0,1]);assert.equal(s.lastConfirmedResult.winner,'R');
 assert.equal(s.history.length,1);assert.equal(s.history[0].confirmedAt,30004);
});

test('cinco segundos ocultos: pick permitido em zero, bloqueado após tolerância',()=>{
 let s=ready({},0);assert.equal(s.deadline,30000);
 assert.throws(()=>apply(s,{type:'timeout'},'R',ids,34999));
 s=apply(s,{type:'confirm',champion:ids[0]},'B',ids,34999);
 assert.equal(s.actions.length,1);
 let z=ready({},0);
 assert.throws(()=>apply(z,{type:'confirm',champion:ids[0]},'B',ids,35000));
 z=apply(z,{type:'timeout'},'B',ids,35000);
 assert.equal(z.actions.length,1);
});
test('solicitação de troca: adversário pode aceitar e dono tem dez segundos',()=>{
 let s=ready({},0);
 for(let i=0;i<7;i++)s=apply(s,{type:'confirm',champion:ids[i]},turn(s).side,ids,1);
 const original=s.actions[6];assert.equal(original.type,'pick');
 s=apply(s,{type:'change_request',index:6},original.side,ids,1000);
 assert.equal(s.paused,true);
 assert.equal(s.changeRequest.status,'requested');
 assert.throws(()=>apply(s,{type:'confirm',champion:ids[30]},turn(s).side,ids,1001));
 assert.throws(()=>apply(s,{type:'change_answer',approve:true},original.side,ids,1002));
 s=apply(s,{type:'change_answer',approve:true},original.side==='B'?'R':'B',ids,1003);
 assert.equal(s.changeRequest.status,'select');assert.equal(s.changeRequest.until,11003);
 assert.throws(()=>apply(s,{type:'change_commit',champion:ids[7]},'viewer',ids,1004));
 assert.throws(()=>apply(s,{type:'change_commit',champion:ids[0]},original.side,ids,1004));
 s=apply(s,{type:'change_commit',champion:ids[38]},original.side,ids,10500);
 assert.equal(s.actions[6].champion,ids[38]);assert.equal(s.changeRequest,null);
 assert.equal(s.paused,false);assert.equal(s.deadline,39501);
});
test('recusa e expiração mantêm pick antigo e restauram relógio',()=>{
 let s=ready({},0);
 for(let i=0;i<7;i++)s=apply(s,{type:'confirm',champion:ids[i]},turn(s).side,ids,1);
 const side=s.actions[6].side, other=side==='B'?'R':'B';
 s=apply(s,{type:'change_request',index:6},side,ids,1000);
 s=apply(s,{type:'change_answer',approve:false},other,ids,1100);
 assert.equal(s.actions[6].champion,ids[6]);assert.equal(s.changeRequest,null);
 s=apply(s,{type:'change_request',index:6},side,ids,1200);
 s=apply(s,{type:'change_answer',approve:true},other,ids,1300);
 assert.throws(()=>apply(s,{type:'change_commit',champion:ids[40]},side,ids,11300));
 s=apply(s,{type:'change_timeout'},other,ids,11300);
 assert.equal(s.changeRequest,null);assert.equal(s.actions[6].champion,ids[6]);
});

test('capitao sozinho nao confirma resultado nem avanca',()=>{
 let s=complete('Normal',2);
 s=apply(s,{type:'report_result',winner:'B'},'B',ids,30002);
 assert.equal(s.game,1);assert.equal(s.score[0],0);
 assert.throws(()=>apply(s,{type:'next',winner:'B'},'B',ids,30003));
 assert.throws(()=>apply(s,{type:'finish',winner:'B'},'R',ids,30003));
 assert.throws(()=>apply(s,{type:'report_result',winner:'X'},'R',ids,30003));
 assert.throws(()=>apply(s,{type:'report_result',winner:'B'},'viewer',ids,30003));
});
test('inverter lados tambem requer concordancia de ambos',()=>{
 let s=complete('Normal',2);
 s=apply(s,{type:'report_result',winner:'B',invertSides:true},'B',ids,30002);
 s=apply(s,{type:'report_result',winner:'B',invertSides:false},'R',ids,30003);
 assert.equal(s.game,1);assert.deepEqual(s.score,[0,0]);
 s=apply(s,{type:'report_result',winner:'B',invertSides:true},'R',ids,30004);
 assert.equal(s.game,2);assert.deepEqual(s.sideOwners,['R','B']);
});
test('na ultima partida voto confirmado encerra sem avancar duas vezes',()=>{
 let s=complete('Normal',1);
 s=apply(s,{type:'report_result',winner:'B'},'B',ids,30002);
 assert.equal(s.finished,undefined);
 s=apply(s,{type:'report_result',winner:'B'},'R',ids,30003);
 assert.equal(s.finished,true);assert.equal(s.finalWinner,'B');
 assert.equal(s.lastConfirmedResult.game,1);
 assert.throws(()=>apply(s,{type:'report_result',winner:'B'},'B',ids,30004));
});

test('fluxo piloto MD3 conclui 2x0 sem exigir terceiro jogo',()=>{
 let s=complete('Normal',3);s.pilot=true;
 s=jointly(s,{type:'report_result',winner:'B'},30002);
 assert.equal(s.game,2);assert.equal(s.finished,undefined);assert.equal(s.pilot,true);
 s=apply(s,{type:'ready'},'B',ids,41000);s=apply(s,{type:'ready'},'R',ids,41000);
 for(let i=0;i<20;i++)s=apply(s,{type:'confirm',champion:ids[i+20]},turn(s).side,ids,41001);
 s=jointly(s,{type:'report_result',winner:'B'},71002);
 assert.equal(s.finished,true);assert.equal(s.game,2);assert.deepEqual(s.score,[2,0]);
});
test('fluxo piloto MD3 termina 2x1 com tres relatorios do jogo',()=>{
 let s=complete('Normal',3);s.pilot=true;
 s=jointly(s,{type:'report_result',winner:'B'},30002);
 s=apply(s,{type:'ready'},'B',ids,41000);s=apply(s,{type:'ready'},'R',ids,41000);
 for(let i=0;i<20;i++)s=apply(s,{type:'confirm',champion:ids[i+20]},turn(s).side,ids,41001);
 s=jointly(s,{type:'report_result',winner:'R'},71002);
 assert.equal(s.game,3);assert.equal(s.finished,undefined);
 s=apply(s,{type:'ready'},'B',ids,81000);s=apply(s,{type:'ready'},'R',ids,81000);
 for(let i=0;i<20;i++)s=apply(s,{type:'confirm',champion:ids[i+40]},turn(s).side,ids,81001);
 s=jointly(s,{type:'report_result',winner:'B'},111002);
 assert.equal(s.finished,true);assert.deepEqual(s.score,[2,1]);assert.equal(s.history.length,2);
});

test('formato da seleção limitado a MD1, MD3 ou MD5',()=>{
 assert.equal(initial({games:1}).games,1);
 assert.equal(initial({games:3}).games,3);
 assert.equal(initial({games:5}).games,5);
 assert.equal(initial({games:2}).games,3);
 assert.equal(initial({games:4}).games,3);
 assert.equal(initial({games:99}).games,3);
});
function playSeries(games,winners){
 let s=complete('Normal',games);
 for(let i=0;i<winners.length;i++){
  const t=i*50000;
  if(i){
   s=apply(s,{type:'ready'},'B',ids,t);
   s=apply(s,{type:'ready'},'R',ids,t);
   for(let j=0;j<20;j++)s=apply(s,{type:'confirm',champion:ids[j]},turn(s).side,ids,t+1);
  }
  s=jointly(s,{type:'report_result',winner:winners[i]},t+30002);
  assert.deepEqual(s.resultVotes,{B:null,R:null});
  if(i<winners.length-1)assert.equal(s.finished,undefined);
 }
 return s;
}
test('MD1 termina na primeira vitória e não abre um jogo 2',()=>{
 const s=playSeries(1,['R']);
 assert.equal(s.finished,true);assert.equal(s.game,1);assert.deepEqual(s.score,[0,1]);assert.equal(s.lastConfirmedResult.game,1);
});
test('MD5 encerra no 3x0 e não obriga a disputar cinco jogos',()=>{
 const s=playSeries(5,['B','B','B']);
 assert.equal(s.finished,true);assert.equal(s.game,3);
 assert.deepEqual(s.score,[3,0]);assert.equal(s.history.length,2);
});
test('MD5 encerra no 3x1 e não abre jogo cinco',()=>{
 const s=playSeries(5,['B','R','B','B']);
 assert.equal(s.finished,true);assert.equal(s.game,4);assert.deepEqual(s.score,[3,1]);
 assert.equal(s.history.length,3);
});
test('MD5 2x2 precisa de quinto jogo e termina 3x2',()=>{
 const s=playSeries(5,['B','R','B','R','R']);
 assert.equal(s.finished,true);assert.equal(s.game,5);assert.deepEqual(s.score,[2,3]);
 assert.equal(s.history.length,4);
});

test('música compartilhada aceita MP3 HTTPS e mantém video e efeitos apenas em MP4',()=>{
 const p=cleanPresentation({music:'https://media.example.org/worlds-2026.mp3',video:'https://media.example.org/video.mp3',banSound:'https://media.example.org/sfx.mp3',pickSound:'https://media.example.org/pick.mp4'});
 assert.equal(p.music,'https://media.example.org/worlds-2026.mp3');
 assert.equal(p.video,'');
 assert.equal(p.banSound,'');
 assert.equal(p.pickSound,'https://media.example.org/pick.mp4');
 assert.equal(cleanPresentation({music:'http://media.example.org/music.mp3'}).music,'');
});


test('Blue Side sempre inicia os bans inclusive apos inverter os lados',()=>{
 let s=initial({games:3,first:'R',teams:[{name:'Blue',captain:'Erick'},{name:'Red',captain:'VaiCrai'}]});
 assert.equal(s.first,'B');assert.deepEqual(turn(s),{side:'B',type:'ban'});
 assert.equal(s.teams[0].captain,'Erick');
 s=apply(s,{type:'ready'},'B',ids,0);s=apply(s,{type:'ready'},'R',ids,0);
 for(let i=0;i<20;i++)s=apply(s,{type:'confirm',champion:ids[i]},turn(s).side,ids,1);
 s=apply(s,{type:'report_result',winner:'B',invertSides:true},'B',ids,30002);
 s=apply(s,{type:'report_result',winner:'B',invertSides:true},'R',ids,30003);
 assert.equal(s.game,2);assert.equal(s.first,'B');assert.deepEqual(turn(s),{side:'B',type:'ban'});
 assert.equal(s.teams[0].captain,'VaiCrai');
});

test('Inverter sides troca equipes inteiras, nicks, capitães, donos e IDs de perfil',()=>{
 const p1='11111111-1111-4111-8111-111111111111',p2='22222222-2222-4222-8222-222222222222';
 let s=initial({games:3,teams:[
  {name:'Time VaiCrai',captain:'VaiCrai',players:['VaiCrai','B2','B3','B4','B5'],profileIds:[p1,null,null,null,null]},
  {name:'Time Erick',captain:'Erick',players:['Erick','R2','R3','R4','R5'],profileIds:[p2,null,null,null,null]}]});
 assert.equal(s.teams[0].players[0],'VaiCrai');
 assert.equal(s.teams[0].profileIds[0],p1);
 s=apply(s,{type:'ready'},'B',ids,0);s=apply(s,{type:'ready'},'R',ids,0);
 for(let i=0;i<20;i++)s=apply(s,{type:'confirm',champion:ids[i]},turn(s).side,ids,1);
 s=apply(s,{type:'report_result',winner:'B',invertSides:true},'B',ids,30002);
 s=apply(s,{type:'report_result',winner:'B',invertSides:true},'R',ids,30003);
 assert.equal(s.game,2);
 assert.equal(s.teams[1].name,'Time VaiCrai');
 assert.equal(s.teams[1].captain,'VaiCrai');
 assert.equal(s.teams[1].players[0],'VaiCrai');
 assert.equal(s.teams[1].profileIds[0],p1);
 assert.equal(s.teams[0].captain,'Erick');
 assert.deepEqual(s.sideOwners,['R','B']);
 assert.deepEqual(s.score,[0,1]);
 assert.equal(turn(s).side,'B');
});
