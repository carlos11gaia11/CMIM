import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const adminHtml=read('public/admin.html');
const accountHtml=read('public/conta.html');
const adminJs=read('public/admin-users.js');
const authJs=read('public/cmim-auth.js');
const sql=read('supabase/sql/2026-11-13-tag-com-espacos-cmim.sql');
function inputPattern(html,id){
 const match=html.match(new RegExp('<input[^>]*'+id+'[^>]*>'));
 assert.ok(match,'Campo não encontrado: '+id);
 const pattern=match[0].match(/pattern="([^"]+)"/);
 assert.ok(pattern,'Pattern não encontrado em '+id);
 return {input:match[0],regex:new RegExp('^(?:'+pattern[1]+')$','u')};
}
test('editar usuário permite tag com espaço interno e # opcional',()=>{
 for(const id of ['registered-edit-tag','manage-user-tag']){
  const {regex,input}=inputPattern(adminHtml,id);
  for(const valid of ['L 9','#L 9','BR1','#BR1','A BC','L 99'])assert.equal(regex.test(valid),true,valid);
  for(const invalid of [' A9','A9 ','##L 9','A#9','AB','', 'AB CDEF'])assert.equal(regex.test(invalid),false,invalid);
  assert.match(input,/maxlength="7"/);
 }
});
test('cadastro novo também permite espaços no identificador interno',()=>{
 const {regex}=inputPattern(accountHtml,'name="riot_id"');
 assert.equal(regex.test('Gaia#L 9'),true);
 assert.equal(regex.test('Gaia#BR1'),true);
 assert.equal(regex.test('Gaia# L9'),false);
 assert.equal(regex.test('Gaia#L9 '),false);
 assert.match(authJs,/\[A-Za-z0-9 \]/);
 assert.match(authJs,/nickTag\[2\]\.toUpperCase\(\)/);
});
test('edição normaliza # inicial e preserva espaço, sem afetar os vínculos',()=>{
 const helper=adminJs.match(/const normalizeTag=.*?;/);
 assert.ok(helper);
 const normalize=new Function(helper[0]+' return normalizeTag;')();
 assert.equal(normalize('#L 9'),'L 9');
 assert.equal(normalize('  #l 9  '),'L 9');
 assert.equal(normalize(' BR1 '),'BR1');
 assert.equal((adminJs.match(/p_tag:normalizeTag\(/g)||[]).length,2);
 assert.equal((adminJs.match(/tag:normalizeTag\(/g)||[]).length,2);
});
test('migração atualiza somente validação de tag, preservando ranking',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.cmim_admin_update_player/i);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.cmim_profile_signup/i);
 assert.match(sql,/regexp_replace\(/);
 assert.match(sql,/\[A-Z0-9 \]\{1,4\}/);
 assert.doesNotMatch(sql,/\b(?:delete|update|truncate)\s+(?:from\s+)?(?:public\.)?cmim_rank\b/i);
 assert.doesNotMatch(sql,/\bdelete\s+from\s+auth\.users\b/i);
 assert.doesNotThrow(()=>new vm.Script(adminJs));
 assert.doesNotThrow(()=>new vm.Script(authJs));
});
