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
  assert.match(read('public/fila.html'), /href="\.\/draft\.html"/);
});
test('scripts de fila e administração são JavaScript válido', () => {
  for (const file of ['public/fila.js','public/admin-fila.js']) {
    assert.doesNotThrow(() => new vm.Script(read(file), {filename: file}));
  }
});
test('botões de fila usam RPC e não escrita direta nas tabelas', () => {
  const js = read('public/fila.js');
  for (const fn of ['cmim_q_join','cmim_q_confirm','cmim_q_leave','cmim_q_pick','cmim_q_report']) {
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
