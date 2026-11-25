window.CMIMPro={confirm(message){return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='pro-dialog';const title=document.createElement('h2');title.textContent='Confirmar operação';const p=document.createElement('p');p.textContent=String(message);const form=document.createElement('form');form.method='dialog';form.className='pro-dialog-actions';for(const [v,t] of [['no','Cancelar'],['yes','Confirmar']]){const b=document.createElement('button');b.value=v;b.textContent=t;form.append(b)}dialog.append(title,p,form);document.body.append(dialog);dialog.addEventListener('close',()=>{const yes=dialog.returnValue==='yes';dialog.remove();resolve(yes)},{once:true});dialog.showModal()})}};
document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id);
 const here=location.pathname.split('/').pop()||'index.html';
 const tabs=(navId,ids,aliases={})=>{const nav=$(navId);if(!nav)return;const select=()=>{let k=location.hash.slice(1);k=aliases[k]||k;if(!ids.includes(k))k=ids[0];for(const id of ids){const section=$(id);if(section)section.hidden=id!==k}nav.querySelectorAll('[data-pro-tab]').forEach(x=>{if(x.dataset.proTab===k)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')})};window.addEventListener('hashchange',select);select()};
 tabs('pro-inhouse-tabs',['como-funciona','ranking-geral','divisoes','regras','torneio','estatisticas']);
 tabs('pro-team-tabs',['equipes','minhas-inscricoes','reagendamentos'],{convites:'equipes','my-invites':'equipes','my-teams':'equipes'});
 if(document.body.classList.contains('cmim-homepage')){
  const quick=document.querySelector('.cmim-quick-doors'),news=$('news');if(quick&&news)news.before(quick);
  const groupBox=document.createElement('section');groupBox.className='wrap pro-home-resources';groupBox.setAttribute('aria-label','Informações e recursos da comunidade');const groupTitle=document.createElement('h2');groupTitle.textContent='Explore a comunidade';groupBox.append(groupTitle);if(news)news.after(groupBox);
  const groups=[['ferramentas','Ferramentas e treinamento'],['divisoes','Divisões do In-House'],['sobre','Sobre a comunidade'],['jogadores','Jogadores da comunidade'],['novidades-regras','Novidades do regulamento'],['regras','Regras e mandamentos'],['historia','Nossa história'],['em-breve','Próximas novidades']];
  for(const [id,label] of groups){const el=$(id);if(!el)continue;const d=document.createElement('details');d.className='wrap pro-home-fold';const summary=document.createElement('summary');summary.textContent=label;if(news)groupBox.append(d);else el.before(d);d.append(summary,el)}
  const reveal=()=>{const el=$(location.hash.slice(1));const d=el?.closest('details');if(d){d.open=true;requestAnimationFrame(()=>el.scrollIntoView({block:'start'}))}};window.addEventListener('hashchange',reveal);reveal();
 }
 const main=document.querySelector('main');if(main&&!main.id)main.id='cmim-main-content';
 if(main&&!document.querySelector('.pro-skip')){const skip=document.createElement('a');skip.className='pro-skip';skip.href='#'+main.id;skip.textContent='Pular para o conteúdo';document.body.prepend(skip)}
});
if('serviceWorker' in navigator&&location.protocol==='https:'){window.addEventListener('load',()=>navigator.serviceWorker.register('./cmim-sw.js').catch(()=>{}),{once:true})}
