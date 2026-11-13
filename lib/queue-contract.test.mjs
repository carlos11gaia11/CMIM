import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(resolve(root, file), 'utf8');
const sql = read('supabase/sql/2026-11-13-fila-site.sql');

test('sistema novo fica separado do draft manual e acessível pelo portal', () => {
  assert.match(read('index.html'), /href="\.\/fila\.html"/);
  assert.match(read('public/admin.html'), /href="\.\/admin-fila\.html"/);
  assert.match(read('public/fila.html'), /href="\.\/draft\.html\?jogar=1"/);
});
test('scripts de fila e administração são JavaScript válido', () => {
  for (const file of ['public/fila.js','public/admin-fila.js','public/admin-fila-lab.js']) {
    assert.doesNotThrow(() => new vm.Script(read(file), {filename: file}));
  }
});
test('botões de fila usam RPC e não escrita direta nas tabelas', () => {
  const js = read('public/fila.js');
  for (const fn of ['cmim_q_join_lane','cmim_q_confirm','cmim_q_leave','cmim_q_pick','cmim_q_report']) {
    assert.ok(js.includes(fn), 'RPC ausente: ' + fn);
  }
  assert.doesNotMatch(js, /method:\s*['"](?:PATCH|DELETE|PUT)['"]/);
});
test('tabelas novas têm RLS e não permitem gravação direta a jogadores', () => {
  for (const table of ['rooms','entries','picks','reports','audit','settings']) {
    assert.ok(sql.includes('public.cmim_queue_' + table), 'Tabela ausente: ' + table);
    assert.ok(sql.includes('public.cmim_queue_' + table + ' enable row level security'));
  }
  assert.match(sql, /revoke all on public\.cmim_queue_rooms/);
  assert.match(sql, /from anon,authenticated;/);
});
test('migração aditiva não apaga ranking, logins ou perfis', () => {
  assert.doesNotMatch(sql, /(?:update|delete\s+from|truncate|drop\s+table|alter\s+table)\s+(?:public\.)?cmim_rank\b/i);
  assert.doesNotMatch(sql, /(?:delete\s+from|truncate|drop\s+table)\s+(?:auth\.)?users\b/i);
  assert.doesNotMatch(sql, /(?:delete\s+from|truncate|drop\s+table)\s+(?:public\.)?cmim_profiles\b/i);
});
test('autoseleção de capitães e oito escolhas alternadas estão no SQL', () => {
  assert.match(sql, /md5\(p_room::text\|\|user_id::text\)/);
  assert.match(sql, /r\.pick_number%2=1 then 'A' else 'B'/);
  assert.match(sql, /r\.pick_number=8 then 'finished'/);
});

test('botão Jogar vai para a fila e há entrada de sala pronta separada',()=>{
  const portal=read('index.html');
  assert.match(portal,/href="\.\/fila\.html" class="play-nav-link">▶ JOGAR · FILA/);
  assert.match(portal,/href="\.\/draft\.html\?jogar=1" class="play-nav-link">ENTRAR EM SALA PRONTA/);
  assert.match(read('public/cmim-auth.js'),/\['▶','Jogar','\.\/fila\.html'\]/);
});

test('lane é selecionável por sala e segue em RPC autorizado',()=>{
  const html=read('public/fila.html'),js=read('public/fila.js');
  assert.match(html,/id="laneChoice"/);
  for(const lane of ['TOP','JG','MID','ADC','SUP']) assert.ok(html.includes('<option value="'+lane+'">'+lane+'</option>'));
  assert.match(js,/cmim_q_join_lane/);
  assert.match(js,/p_lane:\$\('laneChoice'\)\.value/);
  const migration=read('supabase/sql/2026-11-13-fila-lanes-tier-b.sql');
  assert.match(migration,/public\.cmim_q_join_lane\(p_room uuid, p_lane text\)/);
  assert.match(migration,/else 'B' end;/);
  assert.match(migration,/revoke all on function public\.cmim_q_join_lane/);
});

test('admin só edita lane por RPC que verifica permissão e registra auditoria',()=>{
  const sql=read('supabase/sql/2026-11-13-fila-admin-lanes.sql');
  assert.match(sql,/cmim_internal\.is_admin\(\)/);
  assert.match(sql,/cmim_queue_audit/);
  assert.match(sql,/revoke all on function public\.cmim_q_admin_set_lane/);
  assert.match(read('public/admin-fila.js'),/cmim_q_admin_set_lane/);
});

test('laboratório simbólico não grava no Supabase',()=>{
  const sandbox=read('public/admin-fila-lab.js');
  assert.match(sandbox,/Simulado 01/);
  assert.match(sandbox,/Simulado 10/);
  assert.match(sandbox,/cmim_admin/);
  assert.doesNotMatch(sandbox,/fetch\(|\/rest\/v1\/|supabase\.from\(|\.call\('/);
  assert.match(sandbox,/state\.picks\.length===8/);
});

test('tier B default preserva ranking e tiers cadastrados',()=>{
  const sql=read('supabase/sql/2026-11-13-tier-b-perfil-padrao.sql');
  assert.match(sql,/alter column tier set default 'B'/i);
  assert.match(sql,/where tier is null and initial_tier is null/i);
  assert.doesNotMatch(sql,/update\s+public\.cmim_rank\b/i);
});

test('fila renovada exibe progresso e duas vagas por lane',()=>{
  const html=read('public/fila.html');
  const css=read('public/fila.css');
  for(const id of ['confirmedCount','confirmedBar','laneBoard','participants','roomStatus','laneChoice','nextStage']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(css,/\.lane-board/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(read('public/fila.js'),/status==='finished'/);
});
test('capacidade de duas vagas por lane é garantida pelo banco transacional',()=>{
  const migration=read('supabase/sql/2026-11-13-fila-limite-duas-vagas-lane.sql');
  assert.match(migration,/before insert or update of room_id, lane, status/i);
  assert.match(migration,/for update/i);
  assert.match(migration,/existing_count >= 2/i);
  assert.match(migration,/new\.status not in \('queued','confirmed'\)/i);
  assert.match(migration,/drop trigger if exists cmim_queue_lane_capacity/i);
  assert.doesNotMatch(migration,/update\s+public\.cmim_rank\b/i);
  const js=read('public/fila.js');
  assert.match(js,/membersFor\(lane\)/);
  assert.match(js,/option\.disabled/);
});


test('ADM pode escolher entre sala normal e torneio com 4 times',()=>{
 const html=read('public/admin-fila.html'),js=read('public/admin-fila.js');
 assert.match(html,/id="roomTeamCount"/);
 assert.match(html,/id="captainLaneCreate"/);
 assert.match(html,/id="captainLaneEdit"/);
 assert.match(js,/cmim_q_admin_create_tournament/);
 assert.match(js,/cmim_q_admin_tournament_lane/);
 assert.match(js,/cmim_q_admin_undo_tournament/);
 assert.match(js,/cmim_q_admin_captain_tournament/);
});
test('SQL do torneio espelha o snake draft manual com 20 jogadores e capitães pela lane',()=>{
 const sql=read('supabase/sql/2026-11-13-fila-torneio-quatro-times.sql');
 const manual=read('public/draft.html');
 assert.match(manual,/A, B, C, D, D, C, B, A/);
 assert.match(sql,/team_count in \(2,4\)/);
 assert.match(sql,/r\.team_count\*5/);
 assert.match(sql,/captain_lane/);
 assert.match(sql,/array\['A','B','C','D','D','C','B','A'\]/);
 assert.match(sql,/assigned_count=20/);
 assert.match(sql,/cmim_q_pick_tournament/);
 assert.match(sql,/cmim_queue_picks_pick_number_check check \(pick_number between 1 and 16\)/);
 assert.doesNotMatch(sql,/update\s+public\.cmim_rank\b/i);
 assert.doesNotMatch(sql,/delete\s+from\s+auth\.users\b/i);
});
test('UI de fila representa 10 ou 20 jogadores e impõe lotação dinâmica',()=>{
 const js=read('public/fila.js'),html=read('public/fila.html');
 for(const id of ['heroPlayerCount','heroLaneCapacity','heroFormat','heroRule','capacitySubtitle','pickHistory']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/totalPlayers\(r\)/);
 assert.match(js,/teamCount\(r\)/);
 assert.match(js,/cmim_q_pick_tournament/);
 assert.match(js,/FOUR_ORDER/);
 assert.match(js,/teamLanes/);
});
test('laboratório ADM de 20 jogadores é local e separado de dados reais',()=>{
 const html=read('public/admin-fila.html'),js=read('public/admin-fila-torneio-lab.js');
 assert.match(html,/admin-fila-torneio-lab\.js/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/Array\.from\(\{length:4\}/);
 assert.match(js,/LANES/);
 assert.match(js,/ORDER/);
 assert.match(js,/cmim_admin/);
 assert.doesNotMatch(js,/\/rest\/v1\/|supabase\.from\(/);
});
test('troca dos capitães do torneio preserva a lane original',()=>{
 const sql=read('supabase/sql/2026-11-13-fila-torneio-trocar-capitaes.sql');
 assert.match(sql,/cmim_internal\.is_admin\(\)/);
 assert.match(sql,/current_side/);
 assert.match(sql,/e\.lane=r\.captain_lane/);
 assert.match(sql,/tournament_captains_swapped/);
});


test('somente ADM pode excluir fila e a chamada confere o nome da sala',()=>{
 const sql=read('supabase/sql/2026-11-13-admin-excluir-fila.sql');
 const js=read('public/admin-fila.js');
 const html=read('public/admin-fila.html');
 assert.match(sql,/cmim_internal\.is_admin\(\)/);
 assert.match(sql,/auth\.uid\(\) is null/);
 assert.match(sql,/p_expected_title is distinct from r\.title/);
 assert.match(sql,/revoke all on function public\.cmim_q_admin_delete_room/);
 assert.match(sql,/delete from public\.cmim_queue_rooms where id = p_room/);
 assert.match(sql,/delete from public\.cmim_queue_audit where room_id = p_room/);
 assert.match(sql,/room_deleted/);
 assert.doesNotMatch(sql,/(?:delete from|truncate|drop table|update)\s+(?:public\.)?cmim_rank\b/i);
 assert.doesNotMatch(sql,/delete from\s+auth\.users\b/i);
 assert.match(js,/cmim_q_admin_delete_room/);
 assert.match(js,/typed!==roomTitle/);
 assert.match(js,/window\.confirm/);
 assert.match(html,/id="deleteRoomZone"/);
 assert.match(html,/id="deleteRoom"/);
});
