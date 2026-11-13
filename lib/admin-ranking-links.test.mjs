import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/admin-users.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/admin.html', import.meta.url),'utf8');
const start=source.indexOf('const rankCollator=');
const end=source.indexOf('const status=',start);
assert.ok(start>=0&&end>start,'Função de ordenação/vínculo não encontrada');
const helper=source.slice(start,end);

function mockSelect(){
 let options=[],markup='',selected='';
 return {
  set innerHTML(s){
    markup=s;
    options=[...s.matchAll(/<option value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g)]
      .map(m=>({value:m[1],attrs:m[2],label:m[3]}));
    selected=options[0]?.value||'';
  },
  get innerHTML(){return markup},
  get options(){return options},
  set value(v){selected=options.some(o=>o.value===v)?v:''},
  get value(){return selected}
 };
}
function setup(){
 const players=[{id:'p65',nick:'Açaí'},{id:'p02',nick:'Zelda'},{id:'p03',nick:'Aizen'}];
 for(let i=1;i<=62;i++)players.push({id:'p'+(i+100),nick:'Jogador '+i});
 players.reverse();
 const select=mockSelect();
 const fields={
  'registered-edit-rank':select,
  'registered-rank-search':{value:''},
  'registered-rank-count':{textContent:''}
 };
 const ctx={
  state:{rank:players,profiles:[{id:'user-1',nick:'Aizen',tag:'BR1',rank_player_id:'p03'},
      {id:'user-2',nick:'Zelda',tag:'BR1',rank_player_id:'p02'}]},
  $:id=>fields[id],
  esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  Intl
 };
 vm.runInNewContext(helper+'\nthis.fillRankSelector=fillRankSelector;',ctx);
 return {ctx,fields,select};
}
test('vínculo mostra os 65 jogadores históricos, com nick em ordem alfabética',()=>{
 const {ctx,fields,select}=setup();
 ctx.fillRankSelector('registered','','user-1');
 assert.equal(select.options.length,66); // 65 nomes + opção sem vínculo
 assert.equal(select.options[1].label,'Açaí');
 assert.equal(select.options[2].label,'Aizen · vínculo atual');
 assert.match(fields['registered-rank-count'].textContent,/65 de 65 jogadores/);
});
test('vínculo ocupado por outra conta aparece, mas não pode ser escolhido',()=>{
 const {ctx,select}=setup();
 ctx.fillRankSelector('registered','p03','user-1');
 const own=select.options.find(x=>x.value==='p03');
 const other=select.options.find(x=>x.value==='p02');
 assert.ok(own&&!own.attrs.includes('disabled'));
 assert.ok(other&&other.attrs.includes('disabled'));
 assert.match(other.label,/já vinculado a Zelda#BR1/);
 assert.equal(select.value,'p03');
});
test('buscar nick ignora acentos e mantém vínculo selecionado ao filtrar',()=>{
 const {ctx,fields,select}=setup();
 fields['registered-rank-search'].value='acai';
 ctx.fillRankSelector('registered','p03','user-1');
 assert.equal(select.value,'p03');
 assert.equal(select.options.length,3); // opção vazia + vínculo atual + resultado Açaí
 assert.match(fields['registered-rank-count'].textContent,/1 de 65 jogadores/);
 assert.match(select.innerHTML,/Açaí/);
});
test('ambos formulários administrativos possuem busca e opções completas',()=>{
 for(const name of ['registered','manage']){
  assert.match(html,new RegExp('id="'+name+'-rank-search"'));
  assert.match(html,new RegExp('id="'+name+'-rank-count"'));
 }
 assert.match(source,/rankRows\?\.\[0\]\?\.data\?\.players/);
 assert.match(source,/Array\.isArray\(allRankPlayers\)/);
 assert.match(source,/fillRankSelector\('manage'/);
 assert.match(source,/fillRankSelector\('registered'/);
 assert.doesNotThrow(()=>new vm.Script(source));
});
