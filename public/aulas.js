import {LESSONS as BASIC_LESSONS} from './aulas-data.js';
import {ADVANCED_LESSONS} from './aulas-avancadas.js';
import {RESOURCES} from './aulas-recursos.js?v=20261111-videos2';

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
let lane='todos',level='todos',search='',order='curadoria',onlySaved=false,currentId=null,visible=[],resourcesFilter='todos',resourceLane='todos',resourceQuery='';
let diagnosticStep=0,diagnosticScore=0,diagnosticAnswers=[];
const diagramOf=x=>x.visual||(/wave|freeze|farm|recall|crash|troca/i.test(x.title)?'waves':x.lane==='equipe'?'draft':/teamfight|engage|peel|posicionamento|trading/i.test(x.title)?'fight':'map');
const diagramPaths={waves:'./assets/academy/waves.svg',map:'./assets/academy/map.svg',fight:'./assets/academy/fight.svg',draft:'./assets/academy/draft.svg'};
const specialCases={
 'aula-01':{question:'Seu time vence uma luta em 23 minutos, mas os adversários têm ondas chegando às torres laterais, o Barão está vivo e seu jungler tem pouca vida. Qual é a melhor avaliação?',options:['Organizar mid, recursos e o tempo dos inimigos antes de escolher Barão ou estruturas.','Forçar Barão sem wave nem vida porque houve ace.','Perseguir o último inimigo no mapa mesmo sem waves.'],explanation:'Avalie tempo disponível, DPS, vida, rotas e pressão antes de escolher a conversão.'},
 'aula-02':{question:'Você perde vida aos 4 minutos e vê uma wave grande chegando à sua torre. O suporte rival sumiu e seu jungle está longe. O que preserva mais valor?',options:['Coletar XP e CS defensáveis e controlar o risco de dive antes de tentar responder.','Avançar pela kill para recuperar o ouro gasto.','Abandonar a wave e seguir o inimigo no rio sem visão.'],explanation:'Sobrevivência e experiência da wave sustentam economia mais que um all-in desesperado.'},
 'aula-03':{question:'Você quer resetar, mas a wave adversária ainda está fora do alcance da torre rival e o inimigo chega com TP. Qual é a melhor decisão?',options:['Avaliar se consegue completar crash ou pedir ajuda antes de resetar.','Recall instantâneo e aceitar freeze adversário por duas waves.','Fingir roam sem gerir o estado da wave.'],explanation:'Recall é parte de uma sequência wave–compra–retorno.'},
 'aula-04':{question:'Faltam 45 segundos para o dragão, mid está empurrada contra sua equipe e você tem só uma sentinela. Qual é a melhor entrada?',options:['Recuperar a wave e ocupar uma linha de visão que sua equipe consegue defender.','Ir sozinho ao fundo da selva inimiga antes de empurrar mid.','Gastar a ward dentro do pit e esperar sem entrada coberta.'],explanation:'Sem pressão de lane, visão profunda fica indefensável.'}
};
Object.assign(specialCases,{
 "aula-05": {
  "question": "Seu rival gastou mobilidade para farmar, mas possui uma wave com seis minions a mais e jungle inimigo sumiu há 20s. Qual troca faz sentido?",
  "correct": "Punir espaço e farm, sem assumir all-in na wave adversária até ter informação.",
  "options": [
   "Punir espaço e farm, sem assumir all-in na wave adversária até ter informação.",
   "All-in total porque a principal mobilidade está em cooldown.",
   "Correr para o rio em busca do jungler rival sozinho."
  ],
  "explanation": "Cooldown é apenas uma variável: números de minions e ausência de informação podem inverter a troca."
 },
 "aula-06": {
  "question": "Você estabeleceu freeze no top, mas o adversário trouxe o jungler e seu mid está sem prioridade. Como proteger o ganho anterior?",
  "correct": "Afinar a wave e aceitar quebra controlada do freeze em vez de perder vida ou morrer para defendê-lo.",
  "options": [
   "Afinar a wave e aceitar quebra controlada do freeze em vez de perder vida ou morrer para defendê-lo.",
   "Manter freeze mesmo com ameaça de dive em dupla.",
   "Abandonar lane e fazer TP agressivo em bot sem planejar a wave."
  ],
  "explanation": "Freeze só vale quando pode ser mantido com custo aceitável."
 },
 "aula-07": {
  "question": "Você tem TP e side empurrando, o rival mostra três no mid e seu time não consegue pressionar estrutura. Qual conduta?",
  "correct": "Segurar a pressão em zona segura e sincronizar a próxima wave com o time antes de avançar.",
  "options": [
   "Segurar a pressão em zona segura e sincronizar a próxima wave com o time antes de avançar.",
   "Avançar contra T2 no escuro porque o TP está pronto.",
   "Teleportar sem necessidade para apenas agrupar cinco mid."
  ],
  "explanation": "TP e pressão lateral dependem de informação e ameaça complementar."
 },
 "aula-08": {
  "question": "Seu plano era terminar o clear para gankar bot, mas bot perdeu prioridade e o suporte aliado está sem vida. Qual adaptação?",
  "correct": "Redesenhar seu ciclo para conservar XP e buscar crossmap ou resposta ao provável jungler rival.",
  "options": [
   "Redesenhar seu ciclo para conservar XP e buscar crossmap ou resposta ao provável jungler rival.",
   "Forçar gank mesmo com pouca vida e sem wave favorável.",
   "Esperar escondido dois minutos até bot voltar a ter prioridade."
  ],
  "explanation": "O caminho é contingente: uma condição que desapareceu exige nova avaliação."
 },
 "aula-09": {
  "question": "O jungler rival começou bot, sumiu e seu mid tem prio. Uma wave grande top será empurrada em breve. Como rastrear o risco?",
  "correct": "Tratar topside como hipótese relevante e ajustar ward, wave e resposta ao provável countergank.",
  "options": [
   "Tratar topside como hipótese relevante e ajustar ward, wave e resposta ao provável countergank.",
   "Afirmar com certeza que ele ainda está bot.",
   "Invadir sozinho o primeiro buff sem acompanhar informação."
  ],
  "explanation": "Hipóteses devem ser revisadas com tempo de deslocamento e wave."
 },
 "aula-10": {
  "question": "Seu time tem dois jogadores sem ultimate, mid sem prioridade e o próximo dragão não é alma. Qual plano?",
  "correct": "Negociar concessão e executar uma troca de mapa com menor risco após limpar as waves.",
  "options": [
   "Negociar concessão e executar uma troca de mapa com menor risco após limpar as waves.",
   "Forçar contestação de 3v5 porque o objetivo está vivo.",
   "Mandar todos para o pit sem reset e esperar por um roubo."
  ],
  "explanation": "Valor de objetivo deve ser comparado ao custo de contestar."
 },
 "aula-11": {
  "question": "Você limpa mid e vê um alvo bot a pouca vida, mas o suporte rival desapareceu e sua wave volta em 20s. Qual roam?",
  "correct": "Ameaçar movimentação pelo corredor seguro, medir a janela e voltar se a chance real não existir.",
  "options": [
   "Ameaçar movimentação pelo corredor seguro, medir a janela e voltar se a chance real não existir.",
   "Entrar no rio sozinho pelo caminho sem visão.",
   "Perseguir até a T2 bot mesmo perdendo a próxima wave."
  ],
  "explanation": "Roam eficaz contabiliza retorno, visão e possibilidade de seguir a jogada."
 },
 "aula-12": {
  "question": "Você guarda sentinela no rio inferior, mas se posiciona no lado superior do mid com o jungler rival sem informação. Como ajustar?",
  "correct": "Alinhar posição corporal ao lado com visão e apoio, cedendo alcance de trade no lado cego.",
  "options": [
   "Alinhar posição corporal ao lado com visão e apoio, cedendo alcance de trade no lado cego.",
   "Manter a ward embaixo e pressionar no bush de cima.",
   "Invadir o lado de cima sozinho para confirmar localização do rival."
  ],
  "explanation": "Ward só protege a ameaça alinhada à sua posição."
 },
 "aula-13": {
  "question": "Faltam 40 segundos para dragão, uma wave mid vem contra sua torre e seu suporte entrou na selva rival. Qual decisão?",
  "correct": "Garantir limpeza central e reagrupar antes de ampliar a linha de visão.",
  "options": [
   "Garantir limpeza central e reagrupar antes de ampliar a linha de visão.",
   "Entrar imediatamente no pit e deixar a torre receber a wave.",
   "Perseguir o suporte rival em outra metade do mapa."
  ],
  "explanation": "Controle de rio exige mid prioridade e rotas de acesso seguras."
 },
 "aula-14": {
  "question": "O ADC rival está a uma tela de distância, mas o bruiser inimigo ameaça flanco e tem engage disponível. Como maximizar DPS?",
  "correct": "Atacar alvos seguros, preservar deslocamento defensivo e reposicionar quando a ameaça gastar engage.",
  "options": [
   "Atacar alvos seguros, preservar deslocamento defensivo e reposicionar quando a ameaça gastar engage.",
   "Atravessar a frontline para atingir carry rival primeiro.",
   "Usar mobilidade ofensiva para abrir mais alcance imediatamente."
  ],
  "explanation": "DPS sustentável supera dano potencial quando há risco de morte precoce."
 },
 "aula-15": {
  "question": "Você e seu suporte têm poder de all-in, mas a wave rival é duas vezes maior e o jungler inimigo pode chegar. Qual decisão?",
  "correct": "Afinar a wave e identificar cooldown antes de investir no all-in com cobertura.",
  "options": [
   "Afinar a wave e identificar cooldown antes de investir no all-in com cobertura.",
   "Forçar engage imediato usando apenas vantagem de champion.",
   "Dar flash agressivo dentro da wave grande porque há dano de sobra."
  ],
  "explanation": "A wave e o tempo de chegada alteram o 2v2 antes da primeira habilidade."
 },
 "aula-16": {
  "question": "Você derrubou T1 bot, tem vantagem de item e vê mid ocupada por três aliados enquanto as sides acumulam minions. O que negociar?",
  "correct": "Distribuir coleta e ocupar lane central segura para ADC, liberando solos para sides conforme ameaça.",
  "options": [
   "Distribuir coleta e ocupar lane central segura para ADC, liberando solos para sides conforme ameaça.",
   "Juntar os cinco mid e ignorar duas waves laterais.",
   "Continuar bot sozinho até a segunda torre sem visão."
  ],
  "explanation": "Rotação ótima busca ouro seguro e presença nas lutas importantes."
 },
 "aula-17": {
  "question": "Barão em 60 segundos, seu time perdeu mid T1 e o jungler aliado está base. Onde começar a visão?",
  "correct": "Defender acessos próximos, recuperar a mid e só então avançar a linha com cobertura.",
  "options": [
   "Defender acessos próximos, recuperar a mid e só então avançar a linha com cobertura.",
   "Wardar o fundo da jungle inimiga sozinho antes de empurrar mid.",
   "Guardar todas as wards para colocá-las dentro do pit."
  ],
  "explanation": "A linha de visão acompanha a posição defensável do time."
 },
 "aula-18": {
  "question": "Sua bot wave foi presa em freeze adversário, ADC não tem flash e o mid pede roam. Qual sequência?",
  "correct": "Ajudar a quebrar a wave ou garantir que o ADC possa coletar antes de sair da lane.",
  "options": [
   "Ajudar a quebrar a wave ou garantir que o ADC possa coletar antes de sair da lane.",
   "Deixar o ADC 1v2 sob risco de dive sem avisar.",
   "Começar roam de base até top mesmo sem tempo para retornar."
  ],
  "explanation": "Um roam é bom apenas após contabilizar o custo do companheiro."
 },
 "aula-19": {
  "question": "Sua composição tem dois carries imóveis, e o rival tem dois campeões de dive. Você joga de suporte de engage. Qual função principal?",
  "correct": "Guardar CC para negar acesso aos carries até a ameaça ser gasta e buscar engage quando houver espaço.",
  "options": [
   "Guardar CC para negar acesso aos carries até a ameaça ser gasta e buscar engage quando houver espaço.",
   "Sempre iniciar no tanque rival independentemente do estado.",
   "Abandonar os carries e procurar um flank sem visão a qualquer custo."
  ],
  "explanation": "A função tática muda com a condição de vitória da composição."
 },
 "aula-20": {
  "question": "Barão em 45 segundos, o mid fala para resetar e o jungle quer entrar na selva rival apesar de wave sob sua T2. Qual call organiza melhor?",
  "correct": "Comunicar falta de wave e propor reset mais limpeza central antes do primeiro avanço conjunto.",
  "options": [
   "Comunicar falta de wave e propor reset mais limpeza central antes do primeiro avanço conjunto.",
   "Seguir o jungler imediatamente porque é quem faz o objetivo.",
   "Deixar três pessoas resetarem e duas invadirem sem plano."
  ],
  "explanation": "A call eficiente traz estado, proposta e condição de execução."
 },
 "aula-21": {
  "question": "Sua composição tem poke e disengage, mas o adversário tem engage de longo alcance. O que aumenta sua chance antes da luta?",
  "correct": "Criar visão defensável, desgastar a aproximação e preservar recursos para negar a entrada rival.",
  "options": [
   "Criar visão defensável, desgastar a aproximação e preservar recursos para negar a entrada rival.",
   "Forçar combate corpo a corpo de cinco jogadores em corredor estreito.",
   "Esperar o engage rival sem controle de flancos."
  ],
  "explanation": "Win condition não é só draft: exige espaço e configuração das waves."
 },
 "aula-22": {
  "question": "Barão em 50 segundos, mid e top estão pressionadas contra seu time e jungle aliado está sem cargas de ward. O que priorizar?",
  "correct": "Reset, limpeza e avanço conjunto de visão com waves sincronizadas antes de decidir se contesta.",
  "options": [
   "Reset, limpeza e avanço conjunto de visão com waves sincronizadas antes de decidir se contesta.",
   "Correr ao pit e iniciar sem prioridade.",
   "Separar o time em quatro caminhos de jungle para procurar informação."
  ],
  "explanation": "Setup começa por waves e recursos; sem eles a visão vira armadilha."
 }
});
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
const isStalePatch=r=>Boolean(r.patchSensitive&&r.status!=='historico'&&r.publishedAt&&
 Date.now()-new Date(r.publishedAt+'T00:00:00Z').getTime()>14*24*60*60*1000);
const isArchived=r=>r.status==='historico'||isStalePatch(r);
const isActive=r=>!isArchived(r);
function lessonResources(x){
 const candidates=RESOURCES.filter(r=>r.lanes.includes(x.lane)&&isActive(r));
 const rank=r=>(r.type==='video'?100:r.type==='busca-video'?50:r.type==='oficial'?20:10)
  +(7-r.lanes.length)*7+(r.patchSensitive?-30:0)
  +(diagramOf(x)==='waves'&&/wave|freeze|push/i.test(r.topic)?12:0);
 const sorted=candidates.sort((a,b)=>rank(b)-rank(a));
 const selected=[...sorted.filter(r=>r.type==='video').slice(0,2),...sorted.filter(r=>r.type==='busca-video').slice(0,1),...sorted.filter(r=>!['video','busca-video'].includes(r.type)).slice(0,1)];
 return selected.length?selected:sorted.slice(0,4);
}
function renderMedia(x){
 const target=$('dialogMedia');target.replaceChildren();
 for(const r of lessonResources(x)){
  const a=node('a','media-item');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';
  if(r.videoId){const img=document.createElement('img');img.src='https://img.youtube.com/vi/'+r.videoId+'/hqdefault.jpg';img.alt='Miniatura do vídeo '+r.title;img.loading='lazy';a.append(img)}
  const b=node('div','');b.append(node('span','eyebrow',r.type==='video'?'VÍDEO 2026':r.type==='busca-video'?'BUSCA TEMÁTICA · CONFIRA PATCH':'REFERÊNCIA EXTERNA'),node('strong','',r.title),node('small','',r.author+' · '+r.era));
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
 const a=node('a','resource-card'+(isArchived(r)?' resource-archived':''));a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';
 if(r.videoId){const img=document.createElement('img');img.src='https://img.youtube.com/vi/'+r.videoId+'/hqdefault.jpg';img.alt='Miniatura de vídeo '+r.title;img.loading='lazy';a.append(img)}
 else{const img=node('div','resource-icon',r.type==='curso'||r.type==='escola'?'ACADEMIA ↗':r.type==='oficial'?'RIOT ↗':r.type==='busca-video'?'PESQUISAR ↗':'GUIA ↗');a.append(img)}
 const b=node('div','resource-body');
 const label=isArchived(r)?'ARQUIVO · NÃO APLICAR COMO META ATUAL':r.type==='video'?'VÍDEO DIRETO · 2026':r.type==='busca-video'?'BUSCA · RESULTADOS NÃO VERIFICADOS':r.free?'FONTE EXTERNA':'PODE SER PAGO';
 const badge=node('span','resource-status'+(isArchived(r)?' archived':r.type==='busca-video'?' search':''),label);
 b.append(badge,node('span','eyebrow',r.author),node('h3','',r.title),node('p','',r.topic),
  node('small','',r.era+' · '+r.note));
 if(r.type==='video'&&!isArchived(r))b.append(node('small','', 'Metadados conferidos em '+(r.reviewedAt||'2026-11-11')+'; vídeo não auditado integralmente.'));
 b.append(node('strong','resource-cta',r.type==='busca-video'?'PESQUISAR NO YOUTUBE ↗':isArchived(r)?'ABRIR ARQUIVO HISTÓRICO ↗':'ABRIR FONTE EXTERNA ↗'));
 a.append(b);return a;
}
function renderResources(){
 const grid=$('resourceGrid');grid.replaceChildren();
 const match=RESOURCES.filter(r=>{
  const archived=isArchived(r);
  if(resourcesFilter==='archive')return archived;
  if(archived)return false;
  if(resourcesFilter==='video'&&r.type!=='video')return false;
  if(resourcesFilter==='djoko'&&!r.author.toLowerCase().includes('djoko'))return false;
  if(resourcesFilter==='search'&&r.type!=='busca-video')return false;
  if(resourcesFilter==='courses'&&!['curso','escola','artigo','biblioteca','oficial','canal'].includes(r.type))return false;
  return true;
 }).filter(r=>resourceLane==='todos'||r.lanes.includes(resourceLane))
 .filter(r=>!resourceQuery||safeNormalize([r.title,r.author,r.topic,r.note].join(' ')).includes(safeNormalize(resourceQuery)));
 const rank=r=>r.type==='video'?0:r.type==='busca-video'?1:r.type==='oficial'?2:3;
 match.sort((a,b)=>rank(a)-rank(b)||(b.publishedAt||'').localeCompare(a.publishedAt||''));
 for(const r of match)grid.append(resourceCard(r));
 $('resourceCount').textContent=match.length+' '+(match.length===1?'RECURSO ENCONTRADO':'RECURSOS ENCONTRADOS');
 $('resourceEmpty').hidden=match.length!==0;
 const buttonMap={todos:'resourcesAll',video:'resourcesVideo',djoko:'resourcesDjoko',search:'resourcesSearch',courses:'resourcesCourses',archive:'resourcesArchive'};
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
for(const [id,mode] of [['resourcesAll','todos'],['resourcesVideo','video'],['resourcesDjoko','djoko'],['resourcesSearch','search'],['resourcesCourses','courses'],['resourcesArchive','archive']])$(id).addEventListener('click',()=>{resourcesFilter=mode;renderResources()});
$('resourceLane').addEventListener('change',e=>{resourceLane=e.target.value;renderResources()});
$('resourceSearch').addEventListener('input',e=>{resourceQuery=e.target.value;renderResources()});
renderFilters();render();renderResources();renderPlan();diagnosticRender();
if(location.hash.startsWith('#aula-'))openLesson(location.hash.slice(1));
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#aula-'))openLesson(location.hash.slice(1))});
