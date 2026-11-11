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
 for(const id of ['laneFilters','lessonGrid','search','level','lessonDialog','quizAnswers','quizFeedback','dialogSource','nextLesson'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('aulas.js?v=20261111'));
 assert.ok(html.includes('aulas.css?v=20261111'));
 assert.ok(css.includes('--yellow:#ffe03b'));
 assert.ok(css.includes('cmim-industrial-background.webp'));
 assert.ok(js.includes('textContent=lesson.title'));
 assert.ok(js.includes('aria-pressed'));
 new Script(js.replace(/^import .*;\n/,''));
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
