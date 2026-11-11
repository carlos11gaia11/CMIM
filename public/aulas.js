import {LESSONS} from './aulas-data.js';
const lanes=[['todos','TODAS'],['fundamentos','FUNDAMENTOS'],['top','TOP'],['jg','JUNGLE'],['mid','MID'],['adc','ADC'],['sup','SUPORTE'],['equipe','EQUIPES']];
const labels=Object.fromEntries(lanes);
const $=id=>document.getElementById(id);
let lane='todos',level='todos',search='',currentId=null,visible=[];
function node(tag,className,text){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(text!==undefined)el.textContent=text;
 return el;
}
function filtered(){
 const query=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return LESSONS.filter(x=>(lane==='todos'||x.lane===lane)&&(level==='todos'||x.level===level)&&
 [x.title,x.summary,x.application,x.mistake,x.exercise,labels[x.lane]].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));
}
function renderFilters(){
 const container=$('laneFilters');container.replaceChildren();
 for(const [id,label] of lanes){
  const b=node('button','lane-button',label);b.type='button';b.setAttribute('aria-pressed',String(id===lane));
  b.addEventListener('click',()=>{lane=id;renderFilters();render()});container.append(b);
 }
}
function render(){
 visible=filtered();const grid=$('lessonGrid');grid.replaceChildren();
 $('resultCount').textContent=visible.length+' '+(visible.length===1?'AULA ENCONTRADA':'AULAS ENCONTRADAS');
 $('emptyState').hidden=visible.length!==0;
 for(const lesson of visible){
  const card=node('button','lesson-card');card.type='button';card.setAttribute('aria-label','Abrir aula: '+lesson.title);
  const meta=node('div','lesson-meta');meta.append(node('span','lesson-tag',labels[lesson.lane]),node('span','lesson-tag level',lesson.level));
  card.append(meta,node('h3','',lesson.title),node('p','',lesson.summary),node('div','lesson-foot','ESTUDAR AULA →'));
  card.addEventListener('click',()=>openLesson(lesson.id));grid.append(card);
 }
}
function openLesson(id){
 const lesson=LESSONS.find(x=>x.id===id);if(!lesson)return;currentId=id;
 $('dialogCategory').textContent=labels[lesson.lane]+' / '+lesson.level;
 $('dialogTitle').textContent=lesson.title;
 $('dialogSummary').textContent=lesson.summary;
 $('dialogApplication').textContent=lesson.application;
 $('dialogMistake').textContent=lesson.mistake;
 $('dialogExercise').textContent=lesson.exercise;
 $('quizQuestion').textContent=lesson.question;
 $('dialogSource').href=lesson.source;
 $('quizFeedback').textContent='';
 const choices=$('quizAnswers');choices.replaceChildren();
 const order=(LESSONS.indexOf(lesson)%2===0)?[lesson.correct,lesson.wrong]:[lesson.wrong,lesson.correct];
 for(const answer of order){
  const b=node('button','',answer);b.type='button';
  b.addEventListener('click',()=>{
   for(const btn of choices.querySelectorAll('button')){btn.disabled=true;btn.classList.add(btn.textContent===lesson.correct?'correct':'wrong');}
   $('quizFeedback').textContent=answer===lesson.correct?'✓ Correto! Agora coloque esse conceito em prática.':'Essa não é a melhor decisão. Observe a alternativa destacada em verde.';
  });
  choices.append(b);
 }
 const dialog=$('lessonDialog');
 if(!dialog.open)dialog.showModal();
 dialog.querySelector('.dialog-scroll').scrollTop=0;
 const next=LESSONS[(LESSONS.indexOf(lesson)+1)%LESSONS.length];
 $('nextLesson').textContent='PRÓXIMA AULA →';
 $('nextLesson').onclick=()=>openLesson(next.id);
 if(location.hash!=='#'+id)history.replaceState(null,'','#'+id);
}
function closeLesson(){
 $('lessonDialog').close();
 if(location.hash.startsWith('#aula-'))history.replaceState(null,'',location.pathname+location.search+'#biblioteca');
}
$('search').addEventListener('input',e=>{search=e.target.value;render()});
$('level').addEventListener('change',e=>{level=e.target.value;render()});
$('clearFilters').addEventListener('click',()=>{lane='todos';level='todos';search='';$('search').value='';$('level').value='todos';renderFilters();render()});
$('closeDialog').addEventListener('click',closeLesson);
$('lessonDialog').addEventListener('click',e=>{if(e.target===$('lessonDialog'))closeLesson()});
$('lessonDialog').addEventListener('close',()=>{if(location.hash.startsWith('#aula-'))history.replaceState(null,'',location.pathname+location.search+'#biblioteca')});
renderFilters();render();
if(location.hash.startsWith('#aula-'))openLesson(location.hash.slice(1));
