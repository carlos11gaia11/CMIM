import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';

const root=join(import.meta.dirname,'..');
const file=path=>readFileSync(join(root,path),'utf8');

test('páginas públicas por liga e equipe incluem identidade CMIM e dados reais',()=>{
 for(const path of ['public/liga.html','public/equipe.html']){
  const html=file(path);
  assert.match(html,/cmim-competitive-details\.js/);
  assert.match(html,/cmim-competitive-details\.css/);
  assert.match(html,/cmim-auth\.js/);
  assert.match(html,/detail-hero/);
  assert.match(html,/detail-metrics/);
  assert.match(html,/detail-results/);
  assert.doesNotMatch(html,/data-cmim-protected="1"/);
 }
});
test('detalhes competitivos usam partidas, perfis e inscrições homologadas',()=>{
 const source=file('public/cmim-competitive-details.js');
 new Script(source);
 for(const table of ['cmim_squads','cmim_squad_members','cmim_profiles','cmim_competitions','cmim_competition_matches','cmim_competition_entries']){
  assert.ok(source.includes(table),table+' precisa ser consultada');
 }
 assert.match(source,/e\.status==='approved'/);
 assert.match(source,/m\.status==='approved'/);
 assert.match(source,/Horário a definir/);
});
test('portal mantém dez jogadores visíveis por página, preservando filtros e histórico',()=>{
 const html=file('index.html');
 const source=file('public/portal-players.js');
 new Script(source);
 assert.match(html,/id="players-pagination"/);
 assert.match(source,/PAGE_SIZE = 10/);
 assert.match(source,/list\.slice\(start,start\+PAGE_SIZE\)/);
 assert.match(source,/state\.page=1;renderPlayers/);
 assert.match(source,/players-search/);
 assert.match(source,/players-tier/);
});
test('todos os cartões das ligas levam às páginas individuais',()=>{
 const portal=file('index.html');
 const hub=file('public/ligas.html');
 for(const name of ['open','academy','major']){
  assert.ok(portal.includes('liga.html?liga='+name));
  assert.ok(hub.includes('liga.html?liga='+name));
  assert.ok(existsSync(join(root,'public/assets/branding/cmim-'+name+'.webp')));
 }
});
test('listagem competitiva oferece navegação para as equipes cadastradas',()=>{
 const source=file('public/campeonatos.js');
 new Script(source);
 assert.match(source,/equipe\.html\?id=/);
 assert.match(source,/teamLink/);
 assert.match(source,/dateTime/);
});


test('edição administrativa valida campos, confirma escrita e mantém retorno visível',()=>{
 const html=file('public/admin.html');
 const source=file('public/admin-users.js');
 new Script(source);
 assert.ok(html.includes('id="registered-tier-form"'));
 assert.ok(html.includes('id="manage-user-form"'));
 assert.ok(html.includes('admin-users.js?v='));
 assert.ok(html.includes('id="registered-edit-name" maxlength="90" placeholder="Nome real não informado"'));
 assert.ok(html.includes('id="manage-user-name" maxlength="90" placeholder="Nome real não informado"'));
 assert.ok(source.includes("addEventListener('invalid'"));
 assert.ok(source.includes('fetchData({throwOnError:true})'));
 assert.ok(source.includes('Object.entries(expected)'));
 assert.ok(source.includes('cmim-user-save-toast'));
});
