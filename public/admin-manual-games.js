/* CMIM / jogo manual em serie pendente: nenhum resultado é publicado sem aprovacao ADM. */
document.addEventListener('DOMContentLoaded',()=>{
'use strict';
const $=id=>document.getElementById(id),E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const bridge=window.CMIMReviewBridge;
if(!bridge||!$('review-manual-dialog'))return;
let room=null,busy=false;
const getGroup=()=>bridge.getGroups().find(g=>g.id===room);
const feedback=msg=>{const node=$('review-manual-error');if(node)node.textContent=msg};
function renderFields(){
 const g=getGroup();if(!g)return;
 const blue=$('review-manual-blue').value;
 const teams=g.games[0].teams;
 const reordered=blue===g.teamA?[teams[0],teams[1]]:[teams[1],teams[0]];
 $('review-manual-picks').innerHTML=reordered.map((team,i)=>(team.players||[]).map((nick,j)=>
  '<label class="review-manual-pick"><span class="manual-lane">'+(i?'🔴 RED':'🔵 BLUE')+' · '+['TOP','JG','MID','ADC','SUP'][j]+'</span>'+
  '<strong>'+E(nick)+'</strong><input data-manual-pick="'+(i*5+j)+'" maxlength="45" pattern="[A-Za-z0-9]{2,45}" placeholder="Campeão (opcional)" autocomplete="off"></label>'
 ).join('')).join('');
 $('review-manual-bans').innerHTML=Array.from({length:10},(_,i)=>
  '<label class="review-manual-pick"><span class="manual-lane">'+(i<5?'🔵 BLUE':'🔴 RED')+
  ' · BAN '+(i%5+1)+'</span><input data-manual-ban="'+i+
  '" maxlength="45" pattern="[A-Za-z0-9]{2,45}" placeholder="Ban (opcional)" autocomplete="off"></label>'
 ).join('');
}
function open(id){
 const g=bridge.getGroups().find(g=>g.id===id);
 if(!bridge.isAdmin()||bridge.isBusy()||!g||g.status!=='pending'||g.complete||g.games.length>=g.seriesGames)return;
 room=id;$('review-manual-form').reset();
 $('review-manual-title').textContent='Registrar jogo '+(g.games.length+1)+' · MD'+g.seriesGames;
 const opts=[g.teamA,g.teamB].map(name=>'<option value="'+E(name)+'">'+E(name)+'</option>').join('');
 $('review-manual-blue').innerHTML=opts;
 $('review-manual-winner').innerHTML=opts;
 $('review-manual-blue').value=g.games[g.games.length-1]?.teams?.[0]?.name||g.teamA;
 $('review-manual-winner').value=g.teamA;
 $('review-manual-date').value='';
 feedback('');renderFields();$('review-manual-dialog').showModal();
}
async function submit(e){
 e.preventDefault();
 if(busy||!room||!bridge.isAdmin())return;
 const data=getGroup(),dialog=$('review-manual-dialog');
 if(!data||data.status!=='pending'||data.complete)return feedback('A série não está mais disponível.');
 const picks=Array.from({length:10},(_,i)=>dialog.querySelector('[data-manual-pick="'+i+'"]')?.value.trim()||'');
 const bans=Array.from({length:10},(_,i)=>dialog.querySelector('[data-manual-ban="'+i+'"]')?.value.trim()||'');
 const reason=$('review-manual-reason').value.trim();
 if(reason.length<8)return feedback('Informe a fonte do resultado e o motivo do registro (mínimo 8 caracteres).');
 let playedAt=null;
 try{if($('review-manual-date').value){
   playedAt=new Date($('review-manual-date').value).toISOString();
   if(!Number.isFinite(Date.parse(playedAt)))throw Error('Data inválida');
 }}catch{return feedback('Informe uma data válida ou deixe o campo vazio.')}
 if(!confirm('Registrar o jogo '+(data.games.length+1)+' de MD'+data.seriesGames+' fora do site?\\n\\nVencedor: '+$('review-manual-winner').value+
  '\\nBlue Side: '+$('review-manual-blue').value+
  '\\n\\nO registro ficará PENDENTE e precisará de aprovação posterior do ADM.'))return;
 busy=true;const button=$('review-manual-save');button.disabled=true;
 feedback('Registrando jogo no Supabase...');
 try{
  const result=await bridge.fetch('/rest/v1/rpc/cmim_admin_add_series_game',{
   method:'POST',body:JSON.stringify({
    p_room:room,p_winner_team:$('review-manual-winner').value,p_blue_team:$('review-manual-blue').value,
    p_picks:picks,p_bans:bans,p_reason:reason,p_played_at:playedAt
   })
  });
  dialog.close();room=null;
  await bridge.refresh();
  const status=$('review-status');if(status)status.textContent='✓ Jogo '+result.game+' registrado manualmente. Revise e aprove a série quando terminar.';
 }catch(err){feedback('Não foi possível registrar: '+err.message)}
 finally{busy=false;button.disabled=false}
}
$('review-list').addEventListener('click',event=>{
 const b=event.target.closest('[data-manual-room]');if(b)open(b.dataset.manualRoom);
});
$('review-manual-blue').addEventListener('change',renderFields);
$('review-manual-form').addEventListener('submit',submit);
for(const id of ['review-manual-close','review-manual-cancel'])$(id).addEventListener('click',()=>$('review-manual-dialog').close());
$('review-manual-dialog').addEventListener('close',()=>{room=null;feedback('')});
});