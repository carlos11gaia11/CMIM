import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/cmim-auth.js',import.meta.url),'utf8');
const account={id:'test-player',app_metadata:{cmim_admin:false}};
const token=(o={})=>({access_token:'access',refresh_token:'refresh',expires_at:Date.now()/1000+3600,user:account,...o});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});
function setup(initial,handler,legacy=null){
 const map=new Map(initial?[['cmim_player_session',JSON.stringify(initial)]]:[]);
 const old=new Map(legacy?[['cmim_session',JSON.stringify(legacy)]]:[]);
 const storage=m=>({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const document={readyState:'loading',body:{setAttribute(){}},addEventListener(){},dispatchEvent(){},getElementById:()=>null,querySelectorAll:()=>[]};
 const context={window:{},document,localStorage:storage(map),sessionStorage:storage(old),navigator:{},CustomEvent:class{},Blob:class{},fetch:handler,Date};
 vm.runInNewContext(source,context);
 return {a:context.window.CMIMAuth,map,old};
}
test('sem sessão: convidado',async()=>{
 const {a}=setup(null,async()=>{throw Error('unexpected request')});assert.equal(await a.user(),null);assert.equal(a.authState().status,'guest');
});
test('verificação concorrente de sessão válida',async()=>{
 let calls=0;const {a}=setup(token(),async()=>{calls++;return response(account)});
 const results=await Promise.all([a.user(),a.user(),a.user()]);assert.equal(calls,1);assert.equal(results[0].id,account.id);assert.equal(a.authState().status,'authenticated');
 await a.user();assert.equal(calls,1);
});
test('falha temporária preserva login e reconecta',async()=>{
 let online=false;const {a,map}=setup(token(),async()=>{if(!online)throw Error('offline');return response(account)});
 assert.equal(await a.user(),null);assert.equal(a.authState().status,'offline');assert.ok(map.has('cmim_player_session'));online=true;assert.equal((await a.user()).id,account.id);
});
test('token revogado encerra sessão',async()=>{
 const {a,map}=setup(token(),async()=>response({message:'Invalid JWT'},401));assert.equal(await a.user(),null);assert.equal(a.authState().status,'guest');assert.equal(map.has('cmim_player_session'),false);
});
test('renovação concorrente acontece uma vez',async()=>{
 let refresh=0,verify=0;const {a,map}=setup(token({expires_at:0}),async url=>{if(url.includes('grant_type=refresh_token')){refresh++;return response(token({access_token:'fresh',refresh_token:'new'}))}verify++;return response(account)});
 const result=await Promise.all([a.user(),a.current(),a.current()]);assert.equal(refresh,1);assert.equal(verify,1);assert.equal(result[0].id,account.id);assert.equal(result[1].access_token,'fresh');assert.equal(JSON.parse(map.get('cmim_player_session')).access_token,'fresh');
});
test('falha de renovação temporária preserva token; rejeição definitiva remove',async()=>{
 let online=false;const {a,map}=setup(token({expires_at:0}),async()=>{if(!online)throw Error('offline');return response({message:'refresh invalid'},400)});
 assert.equal(await a.current(),null);assert.equal(a.authState().status,'offline');assert.ok(map.has('cmim_player_session'));online=true;assert.equal(await a.current(),null);assert.equal(a.authState().status,'guest');assert.equal(map.has('cmim_player_session'),false);
});
test('migração do login antigo e precedência da sessão nova',()=>{
 const legacy=token({access_token:'old'});const fresh=token({access_token:'new'});
 const first=setup(null,async()=>response(account),legacy);assert.equal(first.a.session().access_token,'old');assert.ok(first.map.has('cmim_player_session'));assert.equal(first.old.size,0);
 const second=setup(fresh,async()=>response(account),legacy);assert.equal(second.a.session().access_token,'new');assert.equal(second.old.size,0);
});
test('logout limpa sessão mesmo sem rede',async()=>{
 const {a,map}=setup(token(),async()=>{throw Error('offline')});await a.logout();assert.equal(a.session(),null);assert.equal(map.size,0);assert.equal(a.authState().status,'guest');
});
test('verificação antiga não autentica nova conta',async()=>{
 let resolve;const other={id:'other',app_metadata:{cmim_admin:false}};let calls=0;const {a}=setup(token(),async()=>{calls++;if(calls===1)return new Promise(r=>{resolve=r});return response(other)});
 const pending=a.user();for(let i=0;i<10&&!resolve;i++)await Promise.resolve();assert.ok(resolve);
 a.save(token({user:other,access_token:'other'}));const verified=await a.user();resolve(response(account));assert.equal(await pending,null);assert.equal(verified.id,other.id);assert.equal(a.authState().user.id,other.id);
});
