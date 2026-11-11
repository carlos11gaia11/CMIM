import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';

const read = path => readFileSync(join(import.meta.dirname, '..', path), 'utf8');

test('Comp Maker é acessível a partir do portal do CMIM',()=>{
 const home=read('index.html');
 assert.match(home, /href="\.\/comp-maker\.html"/);
 assert.match(home, /COMP<\/h3>|COMP<br>MAKER/);
});

test('Comp Maker preserva draft, counters, composição e plano de jogo',()=>{
 const html=read('public/comp-maker.html');
 assert.match(html, /id="slotsBlue"/);
 assert.match(html, /id="slotsRed"/);
 assert.match(html, /id="counterContent"/);
 assert.match(html, /id="compareChart"/);
 assert.match(html, /id="strategyContent"/);
 assert.match(html, /id="statsFile"/);
 assert.match(html, /href="\.\/" aria-label="Voltar ao portal CMIM"/);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 new Script(scripts[0][1]);
});

test('Comp Maker distingue notas heurísticas de dados estatísticos reais',()=>{
 const html=read('public/comp-maker.html');
 assert.match(html,/Sem win rates inventadas/);
 assert.match(html,/Nenhum site externo é consultado automaticamente/);
});


test('Comp Maker usa a identidade visual escura, amarelo CMIM e brasão oficial',()=>{
 const html=read('public/comp-maker.html');
 const theme=read('public/comp-maker-theme.css');
 assert.ok(html.includes('comp-maker-theme.css?v=20261111'));
 assert.ok(html.includes('content="#0b0d0c"'));
 assert.ok(html.includes('src="./assets/branding/cmim-main.webp"'));
 for(const color of ['--base: #0b0d0c','--gold: #ffe03b','--green: #a4e2a7']){
  assert.ok(theme.includes(color),'A identidade CMIM precisa preservar '+color);
 }
 assert.ok(theme.includes('.team-card.red .team-card-header'));
 assert.ok(theme.includes('.team-card-header'));
 assert.ok(theme.includes('.counter-card.best'));
 assert.ok(theme.includes('.modal'));
 assert.ok(theme.includes('@media(max-width:690px)'));
 assert.equal(theme.split('{').length,theme.split('}').length);
});
