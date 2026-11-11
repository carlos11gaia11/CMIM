import {LESSONS as BASIC_LESSONS} from './aulas-data.js';
import {ADVANCED_LESSONS} from './aulas-avancadas.js';
import {RESOURCES} from './aulas-recursos.js';

const LESSONS=[...ADVANCED_LESSONS,...BASIC_LESSONS];
const lanes=[['todos','TODAS'],['fundamentos','FUNDAMENTOS'],['top','TOP'],['jg','JUNGLE'],['mid','MID'],['adc','ADC'],['sup','SUPORTE'],['equipe','EQUIPES']];
const labels=Object.fromEntries(lanes);
const $=id=>document.getElementById(id);
const safeNormalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const storeKey='cmim-academy-v2';
const fallback={done:[],saved:[],days:{},notes:{},studyLane:'top',lastScore:null};
let state;
try{state={...fallback,...JSON.parse(localStorage.getItem(storeKey)||'{}')}}catch{state={...fallback}};
state.done=Array.isArray(state.done)?state.done:[];
state.saved=Array.isArray(state.saved)?state.saved:[];
state.days=state.days&&typeof state.days==='object'?state.days:{};
state.notes=state.notes&&typeof state.notes==='object'?state.notes:{};
let lane='todos',level='todos',search='',order='curadoria',onlySaved=false,currentId=null,visible=[],resourcesFilter='todos';
let diagnosticStep=0,diagnosticScore=0,diagnosticAnswers=[];
const diagramOf=x=>x.visual||(/wave|freeze|farm|recall|crash|troca/i.test(x.title)?'waves':x.lane==='equipe'?'draft':/teamfight|engage|peel|posicionamento|trading/i.test(x.title)?'fight':'map');
const diagramPaths={waves:'./assets/academy/waves.svg',map:'./assets/academy/map.svg',fight:'./assets/academy/fight.svg',draft:'./assets/academy/draft.svg'};
const specialCases={
 'aula-01':{question:'Seu time vence uma luta em 23 minutos, mas os adversários têm ondas chegando às torres laterais, o Barão está vivo e seu jungler tem pouca vida. Qual é a melhor avaliação?',options:['Organizar mid, recursos e o tempo dos inimigos antes de escolher Barão ou estruturas.','Forçar Barão sem wave nem vida porque houve ace.','Perseguir o último inimigo no mapa mesmo sem waves.'],explanation:'Avalie tempo disponível, DPS, vida, rotas e pressão antes de escolher a conversão.'},
 'aula-02':{question:'Você perde vida aos 4 minutos e vê uma wave grande chegando à sua torre. O suporte rival sumiu e seu jungle está longe. O que preserva mais valor?',options:['Coletar XP e CS defensáveis e controlar o risco de dive antes de tentar responder.','Avançar pela kill para recuperar o ouro gasto.','Abandonar a wave e seguir o inimigo no rio sem visão.'],explanation:'Sobrevivência e experiência da wave sustentam economia mais que um all-in desesperado.'},
 'aula-03':{question:'Você quer resetar, mas a wave adversária ainda está fora do alcance da torre rival e o inimigo chega com TP. Qual é a melhor decisão?',options:['Avaliar se consegue completar crash ou pedir ajuda antes de resetar.','Recall instantâneo e aceitar freeze adversário por duas waves.','Fingir roam sem gerir o estado da wave.'],explanation:'Recall é parte de uma sequência wave–compra–retorno.'},
 'aula-04':{question:'Faltam 45 segundos para o dragão, mid está empurrada contra sua equipe e você tem só uma sentinela. Qual é a melhor entrada?',options:['Recuperar a wave e ocupar uma linha de visão que sua equipe consegue defender.','Ir sozinho ao fundo da selva inimiga antes de empurrar mid.','Gastar a ward dentro do pit e esperar sem entrada coberta.'],explanation:'Sem pressão de lane, visão profunda fica indefensável.'}
};
function node(tag,cls='',txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
function persist(){try{localStorage.setItem(storeKey,JSON.stringify(state))}catch{}}
function toggleList(key,id){const p=state[key].indexOf(id);if(p<0)state[key].push(id);else state[key].splice(p,1);persist();stats()}
function stats(){
 $('heroCount').textContent=LESSONS.length+' AULAS';
 $('statTotal').textContent=LESSONS.length;
 $('statComplete').textContent=state.done.length;
 $('statPractice').textContent=Math.round(state.done.length/LESSONS.length*100)+'%';
 $('statDays').textContent=Object.keys(state.days).filter(k=>state.days[k]).length+'/28';
}
function filtered(){
 const q=safeNormalize(search);
 const matches=LESSONS.filter(x=>(lane==='todos'||x.lane===lane)&&(level==='todos'||x.level===level)&&(!onlySaved||state.saved.includes(x.id))&&safeNormalize([x.title,x.summary,x.application,x.mistake,x.exercise,x.tag,x.lane,labels[x.lane]].join(' ')).includes(q));
 const difficulty={Iniciante:1,Intermediário:2,Avançado:3};
 if(order==='avancado')matches.sort((a,b)=>(difficulty[b.level]||0)-(difficulty[a.level]||0));
 if(order==='duracao')matches.sort((a,b)=>(b.duration||15)-(a.duration||15));
 if(order==='concluidas')matches.sort((a,b)=>Number(state.done.includes(a.id))-Number(state.done.includes(b.id)));
 return matches;
}
function renderFilters(){
 const target=$('laneFilters');target.replaceChildren();
 for(const [id,label] of lanes){const b=node('button','lane-button',label);b.type='button';b.setAttribute('aria-pressed',String(lane===id));b.addEventListener('click',()=>{lane=id;renderFilters();render()});target.append(b)}
}
function render(){
 visible=filtered();const grid=$('lessonGrid');grid.replaceChildren();
 $('resultCount').textContent=visible.length+' '+(visible.length===1?'AULA ENCONTRADA':'AULAS ENCONTRADAS');
 $('emptyState').hidden=visible.length!==0;
 for(const lesson of visible){
  const card=node('button','lesson-card'+(state.done.includes(lesson.id)?' completed':''));
  card.type='button';card.setAttribute('aria-label','Abrir aula: '+lesson.title);
  const meta=node('div','lesson-meta');
  meta.append(node('span','lesson-tag',labels[lesson.lane]),node('span','lesson-tag level',lesson.level));
  if(lesson.duration)meta.append(node('span','lesson-tag muted',lesson.duration+' MIN'));
  if(state.saved.includes(lesson.id))meta.append(node('span','lesson-tag','★ SALVA'));
  const title=node('h3','',lesson.title);
  const image=document.createElement('img');image.src=diagramPaths[diagramOf(lesson)];image.alt='Diagrama CMIM Academy';image.loading='lazy';image.className='card-diagram';
  const progress=node('div','lesson-foot',state.done.includes(lesson.id)?'✓ CONCLUÍDA · REVISAR →':'ESTUDAR E RESOLVER CASO →');
  card.append(meta,image,title,node('p','',lesson.summary),progress);
  card.addEventListener('click',()=>openLesson(lesson.id));
  grid.append(card);
 }
 stats();
}
function paraLines(target,text){
 const items=String(text||'').split(/;\s*/).filter(Boolean);
 const box=$(target);box.replaceChildren();for(let i=0;i<items.length;i++)box.append(node('li','',items[i].replace(/\.$/,'')+'.'));
}
function lessonResources(x){
 const pick=RESOURCES.filter(r=>r.lanes.includes(x.lane));
 const priority=(r)=>r.id==='vid-wave'&&diagramOf(x)==='waves'?5:r.author.includes('Djoko')&&x.lane==='equipe'?4:r.type==='video'?3:r.type==='busca-video'?2:r.type==='oficial'?0:1;
 return pick.sort((a,b)=>priority(b)-priority(a)).slice(0,4);
}
function renderMedia(x){
 const target=$('dialogMedia');target.replaceChildren();
 for(const r of lessonResources(x)){
  const a=node('a','media-item');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';
  if(r.videoId){const img=document.createElement('img');img.src='https://img.youtube.com/vi/'+r.videoId+'/hqdefault.jpg';img.alt='Miniatura do vídeo '+r.title;img.loading='lazy';a.append(img)}
  const b=node('div','');b.append(node('span','eyebrow',r.type==='video'?'VÍDEO PT-BR':r.type==='busca-video'?'BUSCA YOUTUBE':'REFERÊNCIA EXTERNA'),node('strong','',r.title),node('small','',r.author+' · '+r.era));
  a.append(b);target.append(a);
 }
}
function renderQuiz(x){
 const quiz=specialCases[x.id]||x;
 const choices=$('quizAnswers');choices.replaceChildren();$('quizFeedback').textContent='';$('quizExplanation').textContent='';
 $('quizQuestion').textContent=quiz.question||'Como aplicar esta aula em um estado real de partida?';
 const opts=quiz.options||[quiz.correct,quiz.wrong,'Aguardar a jogada acontecer sem planejar próxima wave ou tempo de retorno.'];
 // Ordem alternada para evitar respostas sempre na primeira posição.
 const offset=LESSONS.findIndex(y=>y.id===x.id)%opts.length;
 const arranged=opts.map((_,i)=>opts[(i+offset)%opts.length]);
 for(const answer of arranged){
  const b=node('button','',answer);b.type='button';
  b.addEventListener('click',()=>{
   for(const btn of choices.querySelectorAll('button')){btn.disabled=true;btn.classList.add(btn.textContent===quiz.correct?'correct':'wrong')}
   const right=answer===quiz.correct;
   $('quizFeedback').textContent=right?'✓ Boa leitura do estado de jogo.':'✕ A decisão ignora uma restrição do cenário. Veja a opção destacada.';
   $('quizExplanation').textContent=quiz.explanation||'Revise a informação disponível, o custo de cada alternativa e o gatilho que muda a decisão.';
  });
  choices.append(b);
 }
}
function openLesson(id){
 const x=LESSONS.find(l=>l.id===id);if(!x)return;currentId=id;
 $('dialogCategory').textContent=labels[x.lane]+' / '+x.level+(x.duration?' / '+x.duration+' MIN':'');
 $('dialogTitle').textContent=x.title;$('dialogSummary').textContent=x.summary;
 $('dialogApplication').textContent=x.application;$('dialogMistake').textContent=x.mistake;$('dialogExercise').textContent=x.exercise;
 $('dialogSource').href=x.source;$('dialogSource').textContent='CONSULTAR REFERÊNCIA ↗';
 $('dialogDiagram').src=diagramPaths[diagramOf(x)];$('dialogDiagram').alt='Diagrama de '+x.title;
 paraLines('dialogFramework',x.application);
 $('lessonNotes').value=state.notes[id]||'';
 $('notesStatus').textContent='Anotações privadas salvas no navegador deste dispositivo.';
 $('markComplete').textContent=state.done.includes(id)?'✓ CONCLUÍDA · DESMARCAR':'MARCAR COMO CONCLUÍDA ✓';
 $('bookmarkLesson').textContent=state.saved.includes(id)?'★ SALVA · REMOVER':'☆ SALVAR AULA';
 $('markComplete').onclick=()=>{toggleList('done',id);$('markComplete').textContent=state.done.includes(id)?'✓ CONCLUÍDA · DESMARCAR':'MARCAR COMO CONCLUÍDA ✓';render();};
 $('bookmarkLesson').onclick=()=>{toggleList('saved',id);$('bookmarkLesson').textContent=state.saved.includes(id)?'★ SALVA · REMOVER':'☆ SALVAR AULA';render();};
 renderQuiz(x);renderMedia(x);
 const i=LESSONS.indexOf(x);const next=LESSONS[(i+1)%LESSONS.length];
 $('nextLesson').onclick=()=>openLesson(next.id);
 const d=$('lessonDialog');if(!d.open)d.showModal();d.querySelector('.dialog-scroll').scrollTop=0;
 if(location.hash!=='#'+id)history.replaceState(null,'','#'+id);
}
function closeLesson(){if($('lessonDialog').open)$('lessonDialog').close();if(location.hash.startsWith('#aula-'))history.replaceState(null,'',location.pathname+location.search+'#biblioteca')}
function resourceCard(r){
 const a=node('a','resource-card');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';
 if(r.videoId){const img=document.createElement('img');img.src='https://img.youtube.com/vi/'+r.videoId+'/hqdefault.jpg';img.alt='Miniatura de vídeo '+r.title;img.loading='lazy';a.append(img)}
 else{const img=node('div','resource-icon',r.type==='curso'||r.type==='escola'?'ACADEMIA ↗':r.type==='oficial'?'RIOT ↗':r.type==='busca-video'?'YOUTUBE ↗':'GUIA ↗');a.append(img)}
 const b=node('div','resource-body');
 b.append(node('span','eyebrow',(r.free?'ACESSO EXTERNO':'ACESSO PODE SER PAGO')+' · '+r.author),node('h3','',r.title),node('p','',r.topic),node('small','',r.era+' · '+r.note),node('strong','resource-cta','ABRIR FONTE EXTERNA ↗'));a.append(b);return a;
}
function renderResources(){
 const grid=$('resourceGrid');grid.replaceChildren();
 const match=RESOURCES.filter(r=>resourcesFilter==='todos'||resourcesFilter==='video'&&(r.type==='video'||r.type==='busca-video'||r.type==='canal')||resourcesFilter==='djoko'&&r.author.toLowerCase().includes('djoko')||resourcesFilter==='courses'&&['curso','escola','artigo','biblioteca','oficial'].includes(r.type));
 for(const r of match)grid.append(resourceCard(r));
 const buttonMap={todos:'resourcesAll',video:'resourcesVideo',djoko:'resourcesDjoko',courses:'resourcesCourses'};
 for(const [value,id] of Object.entries(buttonMap))$(id).setAttribute('aria-pressed',String(resourcesFilter===value));
}
const weekHeads=[
 ['W1','LEITURA DE ESTADO','Aprender a perceber wave, recurso e informação antes de agir.'],
 ['W2','MICRO DA FUNÇÃO','Escolher suas janelas, executar a lane e reconhecer o custo da agressão.'],
 ['W3','MACRO COORDENADO','Transformar prioridade em pressão, visão e controle de objetivos.'],
 ['W4','REVISÃO COMPETITIVA','Jogar com hipótese, revisar VOD e preparar decisões em série.']
];
const dailyPrompts=[
 ['Diagnosticar o problema dominante','Reveja uma derrota. Pausa 10s antes do primeiro erro de decisão e descreva a informação disponível.'],
 ['Observar 3 estados de wave','Pare o replay nos minutos 3, 6 e 9: qual wave, quem tem prioridade e quem pode chegar primeiro?'],
 ['Executar um treino de 15 minutos','Escolha uma única mecânica mensurável da sua rota. Compare antes/depois sem mudar o treino no meio.'],
 ['Revisar dois recalls','Anote o motivo do reset, posição da wave, tempo de volta e o próximo objetivo.'],
 ['Treinar uma decisão sem informação','Escolha um momento de fog of war e registre 2 hipóteses possíveis, não apenas uma.'],
 ['Aplicar uma rotina em partida','Escolha uma variável de foco, jogue e avalie no VOD sem julgar pela vitória.'],
 ['Revisar e descansar','Resuma 1 erro recorrente, 1 acerto reproduzível e o ajuste para a semana seguinte.']
];
function renderPlan(){
 const target=$('studyPlan');target.replaceChildren();const current=$('studyLane').value;state.studyLane=current;persist();
 for(let w=0;w<4;w++){
  const panel=node('article','week-card');
  const head=node('header','week-head');head.append(node('span','eyebrow',weekHeads[w][0]),node('h3','',weekHeads[w][1]),node('p','',weekHeads[w][2]));panel.append(head);
  const ul=node('div','day-list');let count=0;
  for(let d=0;d<7;d++){
   const day=w*7+d+1;const key=current+':'+day;const checked=Boolean(state.days[key]);if(checked)count++;
   const button=node('button','study-day'+(checked?' checked':''));button.type='button';button.setAttribute('aria-pressed',String(checked));
   const tag=node('span','day-count','D'+String(day).padStart(2,'0'));
   const info=node('span','day-text');info.append(node('strong','',dailyPrompts[d][0]),node('small','',dailyPrompts[d][1]));
   button.append(tag,info,node('span','day-check',checked?'✓':'○'));
   button.addEventListener('click',()=>{state.days[key]=!state.days[key];persist();renderPlan();stats()});
   ul.append(button);
  }
  panel.append(node('div','week-progress',count+'/7 dias concluídos'),ul);target.append(panel);
 }
 stats();
}
const diagnosticIds=['aula-pro-02','aula-pro-09','aula-pro-14','aula-pro-19','aula-pro-27','aula-pro-36','aula-pro-39'];
const diagnostic=diagnosticIds.map(id=>LESSONS.find(x=>x.id===id)).filter(Boolean);
function diagnosticRender(){
 const target=$('diagnosticContent');target.replaceChildren();
 if(diagnosticStep>=diagnostic.length){
  const ratio=Math.round(diagnosticScore/diagnostic.length*100);
  target.append(node('span','eyebrow','DIAGNÓSTICO CONCLUÍDO'),node('h3','',ratio+'% DE LEITURA TÁTICA'),node('p','',ratio>=75?'Boa base de decisão em cenários escritos. Agora valide sob pressão em partidas e VOD.':'Seu próximo ganho está em explicitar recursos, custos de wave e informação antes de lutar.'));
  const note=node('p','diagnostic-note','Acertos: '+diagnosticScore+' / '+diagnostic.length+'. Este resultado é um treino, não mede elo nem habilidade real.');
  const start=node('button','action primary','REFAZER DIAGNÓSTICO ↻');start.type='button';start.onclick=()=>{diagnosticStep=0;diagnosticScore=0;diagnosticAnswers=[];diagnosticRender()};target.append(note,start);state.lastScore=ratio;persist();return;
 }
 const x=diagnostic[diagnosticStep];
 target.append(node('span','eyebrow','CASO '+(diagnosticStep+1)+' DE '+diagnostic.length+' · '+labels[x.lane]),node('h3','',x.title),node('p','diagnostic-question',x.question));
 const opts=[...x.options];const offset=diagnosticStep%3;const shuffled=opts.map((_,i)=>opts[(i+offset)%3]);
 const options=node('div','diagnostic-options');const feedback=node('p','diagnostic-feedback');
 for(const opt of shuffled){const button=node('button','',opt);button.type='button';button.addEventListener('click',()=>{
  for(const b of options.querySelectorAll('button')){b.disabled=true;b.classList.add(b.textContent===x.correct?'correct':'wrong')}
  if(opt===x.correct)diagnosticScore++;
  feedback.textContent=(opt===x.correct?'✓ Correto. ':'✕ Reavalie a informação e o custo. ')+x.explanation;
  const next=node('button','action primary',diagnosticStep===diagnostic.length-1?'VER RESULTADO →':'PRÓXIMO CENÁRIO →');next.type='button';next.onclick=()=>{diagnosticStep++;diagnosticRender()};target.append(next);
 },{once:true});options.append(button)}
 target.append(options,feedback);
}
$('search').addEventListener('input',e=>{search=e.target.value;render()});
$('level').addEventListener('change',e=>{level=e.target.value;render()});
$('order').addEventListener('change',e=>{order=e.target.value;render()});
$('showSaved').addEventListener('click',()=>{onlySaved=!onlySaved;$('showSaved').setAttribute('aria-pressed',String(onlySaved));render()});
$('clearFilters').addEventListener('click',()=>{lane='todos';level='todos';search='';order='curadoria';onlySaved=false;$('search').value='';$('level').value='todos';$('order').value=order;$('showSaved').setAttribute('aria-pressed','false');renderFilters();render()});
$('closeDialog').addEventListener('click',closeLesson);
$('lessonDialog').addEventListener('click',e=>{if(e.target===$('lessonDialog'))closeLesson()});
$('lessonDialog').addEventListener('close',()=>{if(location.hash.startsWith('#aula-'))history.replaceState(null,'',location.pathname+location.search+'#biblioteca')});
$('lessonNotes').addEventListener('input',e=>{if(!currentId)return;state.notes[currentId]=e.target.value;persist();$('notesStatus').textContent='✓ Registro salvo neste navegador.'});
$('studyLane').value=state.studyLane||'top';
$('studyLane').addEventListener('change',renderPlan);
$('resetStudy').addEventListener('click',()=>{const prefix=$('studyLane').value+':';if(!confirm('Reiniciar os 28 dias desta função? Suas aulas concluídas e notas serão preservadas.'))return;for(const key of Object.keys(state.days))if(key.startsWith(prefix))delete state.days[key];persist();renderPlan()});
for(const [id,mode] of [['resourcesAll','todos'],['resourcesVideo','video'],['resourcesDjoko','djoko'],['resourcesCourses','courses']])$(id).addEventListener('click',()=>{resourcesFilter=mode;renderResources()});
renderFilters();render();renderResources();renderPlan();diagnosticRender();
if(location.hash.startsWith('#aula-'))openLesson(location.hash.slice(1));
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#aula-'))openLesson(location.hash.slice(1))});
