import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';
import {pathToFileURL} from 'node:url';

const read=p=>readFileSync(join(import.meta.dirname,'..',p),'utf8');

test('CMIM Academy integra o menu e a central de ferramentas',()=>{
 const home=read('index.html');
 const comp=read('public/comp-maker.html');
 assert.ok(home.includes('href="./aulas.html"'));
 assert.ok(home.includes('ACADEMY<br>AULAS E DICAS'));
 assert.ok(comp.includes('href="./aulas.html"'));
});

test('Aulas possui filtros, modal, pesquisa, testes e links de referência',()=>{
 const html=read('public/aulas.html');
 const js=read('public/aulas.js');
 const css=read('public/aulas.css');
 for(const id of ['laneFilters','lessonGrid','search','level','lessonDialog','quizAnswers','quizFeedback','dialogSource','nextLesson','diagnosticContent','studyPlan','resourceGrid','lessonNotes','markComplete','bookmarkLesson','order'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('aulas.js?v=20261111'));
 assert.ok(html.includes('aulas.css?v=20261111'));
 assert.ok(css.includes('--yellow:#ffe03b'));
 assert.ok(css.includes('cmim-industrial-background.webp'));
 assert.ok(js.includes("$('dialogTitle').textContent=x.title"));
 assert.ok(js.includes('aria-pressed'));
 new Script(js.replace(/^import .*;\r?\n/gm,''));
});

test('Aulas têm conteúdo editorial por todas as rotas, quizzes e fontes',async()=>{
 const data=await import(pathToFileURL(join(import.meta.dirname,'..','public','aulas-data.js')).href);
 assert.equal(data.LESSONS.length,22);
 const lanes=new Set(data.LESSONS.map(x=>x.lane));
 for(const lane of ['fundamentos','top','jg','mid','adc','sup','equipe'])assert.ok(lanes.has(lane));
 const ids=new Set();
 for(const x of data.LESSONS){
  assert.ok(!ids.has(x.id));ids.add(x.id);
  for(const k of ['title','summary','application','mistake','exercise','question','correct','wrong'])assert.ok(x[k]?.length>10,x.id+' '+k);
  assert.ok(x.source.startsWith('https://'));
  assert.notEqual(x.correct,x.wrong);
 }
});

test('Academy avançada possui 63 aulas, casos com três opções, vídeos e progressão',async()=>{
 const root=join(import.meta.dirname,'..','public');
 const basic=(await import(pathToFileURL(join(root,'aulas-data.js')).href)).LESSONS;
 const advanced=(await import(pathToFileURL(join(root,'aulas-avancadas.js')).href)).ADVANCED_LESSONS;
 const resources=(await import(pathToFileURL(join(root,'aulas-recursos.js')).href)).RESOURCES;
 const html=read('public/aulas.html'),js=read('public/aulas.js');
 assert.equal(basic.length,22);
 assert.equal(advanced.length,41);
 assert.equal(new Set([...basic,...advanced].map(x=>x.id)).size,63);
 for(const x of advanced){
  assert.equal(x.options.length,3,x.id);
  assert.ok(x.options.includes(x.correct),x.id);
  assert.ok(x.explanation.length>30,x.id);
  for(const k of ['title','summary','application','mistake','exercise','question'])assert.ok(x[k].length>35,x.id+' '+k);
  assert.ok(x.source.startsWith('https://'));
 }
 const lanes=new Set(advanced.map(x=>x.lane));
 for(const lane of ['fundamentos','top','jg','mid','adc','sup','equipe'])assert.ok(lanes.has(lane));
 assert.ok(resources.some(x=>x.author.includes('Djoko')));
 assert.ok(resources.some(x=>x.videoId==='4DOnLAoNTBY'));
 for(const x of resources)assert.ok(x.url.startsWith('https://'));
 for(const visual of ['waves','map','fight','draft'])assert.ok(read('public/assets/academy/'+visual+'.svg').includes('<svg'));
 for(const id of ['diagnostico','plano','recursos'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(js.includes('localStorage'));
 assert.ok(js.includes('renderPlan()'));
 assert.ok(js.includes('diagnosticRender()'));
});
