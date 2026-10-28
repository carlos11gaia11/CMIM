/* Central administrativa CMIM: mesma autenticação e autorização do Ranking CMIM. */
(() => {
  'use strict';
  const API='https://klpvidxhzofbwstvvxib.supabase.co';
  const KEY='sb_publishable_B5WMdyJBIdYhauVepUIOZw_hnvXs4Xn';
  const SESSION='cmim_session';
  const $=id=>document.getElementById(id);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const state={session:null,admin:false,rank:null,version:null,metadata:[],news:[],reports:[],loading:false,reviewBusy:false};
  try{state.session=JSON.parse(sessionStorage.getItem(SESSION)||'null')}catch{}
  const tierList=['S','A','B','C','D','E','F'];
  const laneList=['TOP','JG','MID','ADC','SUP'];

  function flash(message,bad=false){
    const el=$('portal-flash');if(!el)return;
    el.textContent=message;el.className=bad?'portal-flash bad':'portal-flash good';
    el.hidden=false;
    clearTimeout(flash.timer);flash.timer=setTimeout(()=>{el.hidden=true;},6500);
  }
  async function jsonFetch(path,options={}){
    const {secured=false,...opts}=options;
    if(secured)await ensureSession();
    const response=await fetch(API+path,{
      ...opts,
      cache:'no-store',
      headers:{apikey:KEY,'Content-Type':'application/json',...(secured?{Authorization:'Bearer '+state.session.access_token}:{}),...opts.headers}
    });
    let data=null;try{data=await response.json()}catch{}
    if(!response.ok)throw Error(data?.message||data?.error_description||data?.msg||data?.details||data?.error||'Falha na comunicação com o Supabase ('+response.status+').');
    return data;
  }
  async function refreshSession(){
    if(!state.session?.refresh_token)throw Error('Sessão expirada. Entre novamente.');
    const response=await fetch(API+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:state.session.refresh_token})
    });
    const fresh=await response.json().catch(()=>null);
    if(!response.ok||!fresh?.access_token)throw Error('Sessão expirada. Entre novamente.');
    state.session=fresh;
    sessionStorage.setItem(SESSION,JSON.stringify(fresh));
  }
  async function ensureSession(){
    if(!state.session?.access_token)throw Error('Faça login como administrador.');
    if(!state.session.expires_at||state.session.expires_at<Date.now()/1000+60)await refreshSession();
    return state.session;
  }
  function hasAdminClaim(user){return user?.app_metadata?.cmim_admin===true;}
  async function verifySession(){
    try{
      const data=await jsonFetch('/auth/v1/user',{secured:true});
      if(!hasAdminClaim(data))throw Error('Conta sem permissão administrativa.');
      state.admin=true;return true;
    }catch{
      state.admin=false;state.session=null;sessionStorage.removeItem(SESSION);return false;
    }
  }
  function showLogin(){
    $('admin-login-view').hidden=false;$('admin-management-view').hidden=true;
    const button=$('portal-admin-button');if(button)button.textContent='⚙ ACESSO ADMIN';
    $('admin-login-error').textContent='';
  }
  function showManager(){
    $('admin-login-view').hidden=true;$('admin-management-view').hidden=false;
    const button=$('portal-admin-button');if(button)button.textContent='⚙ PAINEL ADMIN';
  }
  async function openAdmin(){
    const popup=$('portal-admin-dialog');
    if(popup)popup.showModal();
    if(state.admin){showManager();await loadAdminData().catch(e=>flash(e.message,true));}
    else showLogin();
  }
  async function login(event){
    event.preventDefault();
    const form=event.currentTarget;
    const error=$('admin-login-error'),button=form.querySelector('button[type=submit]');
    error.textContent='';button.disabled=true;
    try{
      const data=new FormData(form);
      const response=await fetch(API+'/auth/v1/token?grant_type=password',{
        method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},
        body:JSON.stringify({email:String(data.get('email')).trim(),password:String(data.get('password'))})
      });
      const session=await response.json();
      if(!response.ok||!session.access_token)throw Error('E-mail ou senha inválidos.');
      if(!hasAdminClaim(session.user)){
        // O token recebido não concede acesso ao painel.
        await fetch(API+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}}).catch(()=>{});
        throw Error('Este usuário não tem permissão de administrador do CMIM.');
      }
      state.session=session;sessionStorage.setItem(SESSION,JSON.stringify(session));
      if(!await verifySession())throw Error('Não foi possível validar as permissões deste administrador.');
      form.reset();showManager();
      await loadAdminData();flash('Acesso administrativo autorizado.');
    }catch(e){error.textContent=String(e.message||e);}
    finally{button.disabled=false;}
  }
  async function logout(){
    const token=state.session?.access_token;
    state.session=null;state.admin=false;sessionStorage.removeItem(SESSION);
    if(token)await fetch(API+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token}}).catch(()=>{});
    showLogin();flash('Sessão administrativa encerrada.');
  }
  const metaFor=id=>state.metadata.find(m=>m.rank_player_id===id)||null;
  async function loadAdminData(){
    if(!state.admin)return;
    const [rows,metadata,news,reports]=await Promise.all([
      jsonFetch('/rest/v1/cmim_rank?id=eq.1&select=data,version',{secured:true}),
      jsonFetch('/rest/v1/cmim_player_meta?select=rank_player_id,tier,lane,riot_tag,champion_tags&limit=1000',{secured:true}),
      jsonFetch('/rest/v1/cmim_portal_news?select=id,title,category,published,created_at&order=created_at.desc&limit=50',{secured:true}),
      jsonFetch('/rest/v1/cmim_draft_game_reports?select=room_id,game,season_id,season_name,mode,winner_side,winner_team,teams,picks,bans,confirmed_at,review_status,review_note,reviewed_at&order=confirmed_at.desc&limit=1000',{secured:true})
    ]);
    state.rank=rows?.[0]?.data||{players:[],seasons:[]};state.version=rows?.[0]?.version??0;
    state.metadata=Array.isArray(metadata)?metadata:[];
    state.news=Array.isArray(news)?news:[];
    state.reports=Array.isArray(reports)?reports:[];
    renderAdminPlayerOptions();renderNewsManager();renderReviewQueue();
  }
  function renderAdminPlayerOptions(){
    const select=$('admin-player-select'),existing=$('admin-existing-player');
    const selected=select.value;
    const roster=state.rank?.players||[];
    select.innerHTML='<option value="">Selecione um jogador...</option>'+roster
      .slice().sort((a,b)=>a.nick.localeCompare(b.nick,'pt-BR'))
      .map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nick)+'</option>').join('');
    if(roster.some(p=>p.id===selected))select.value=selected;
    const season=activeSeason(),current=new Set(season?.roster||[]);
    const available=roster.filter(p=>!current.has(p.id));
    existing.innerHTML='<option value="">Selecione um jogador do histórico...</option>'+available
      .map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nick)+'</option>').join('');
    existing.disabled=!available.length||!season;
    $('admin-season-name').textContent=season?.name||'Nenhuma temporada ativa';
    $('admin-player-count').textContent=roster.length+' jogadores cadastrados';
    showSelectedMetadata();
  }
  function activeSeason(){return (state.rank?.seasons||[]).find(s=>s.status==='active')||null;}
  function showSelectedMetadata(){
    const id=$('admin-player-select').value,form=$('admin-player-form');
    if(!id){form.hidden=true;return;}
    form.hidden=false;
    const player=state.rank?.players?.find(p=>p.id===id),meta=metaFor(id);
    $('admin-player-name').textContent=player?.nick||'Jogador';
    $('admin-tier').value=meta?.tier||'';
    $('admin-lane').value=meta?.lane||'';
    $('admin-riot-tag').value=meta?.riot_tag||'';
    $('admin-champions').value=Array.isArray(meta?.champion_tags)?meta.champion_tags.join(', '):'';
    $('admin-player-feedback').textContent='';
  }
  async function saveMetadata(event){
    event.preventDefault();
    if(!state.admin)return;
    const form=event.currentTarget,button=form.querySelector('button[type=submit]');
    const id=$('admin-player-select').value,tag=$('admin-riot-tag').value.trim().replace(/^#/,'');
    const champions=$('admin-champions').value.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
    const tier=$('admin-tier').value||null,lane=$('admin-lane').value||null;
    if(!state.rank?.players?.some(p=>p.id===id)){flash('Selecione um jogador do ranking.',true);return;}
    if(tag&&!/^[A-Za-z0-9]{3,6}$/.test(tag)){flash('Tag Riot: use de 3 a 6 letras ou números, sem #.',true);return;}
    if(!tierList.includes(tier)&&tier!==null){flash('Tier inválido.',true);return;}
    if(!laneList.includes(lane)&&lane!==null){flash('Lane inválida.',true);return;}
    if(champions.length>5||champions.some(c=>c.length>24)){flash('Informe até cinco campeões, com no máximo 24 caracteres cada.',true);return;}
    button.disabled=true;
    try{
      await jsonFetch('/rest/v1/cmim_player_meta?on_conflict=rank_player_id',{
        secured:true,method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({
          rank_player_id:id,tier,lane,riot_tag:tag||null,
          champion_tags:[...new Set(champions)],updated_at:new Date().toISOString(),updated_by:state.session.user.id
        })
      });
      $('admin-player-feedback').textContent='✓ Dados salvos com sucesso.';
      await loadAdminData();
      $('admin-player-select').value=id;showSelectedMetadata();
      $('admin-player-feedback').textContent='✓ Tier, tags e lane atualizados.';
      await window.CMIMPortalPlayers?.reload();
      flash('Ficha do jogador atualizada no portal.');
    }catch(e){flash('Não foi possível salvar: '+e.message,true);}
    finally{button.disabled=false;}
  }
  async function applyRanking(args){
    if(!activeSeason())throw Error('Crie uma temporada ativa no Ranking CMIM antes de cadastrar.');
    const result=await jsonFetch('/rest/v1/rpc/cmim_apply',{
      secured:true,method:'POST',
      body:JSON.stringify({action:'player_add',args:{seasonId:activeSeason().id,...args},expected_version:state.version})
    });
    state.rank=result.data;state.version=result.version;
    await loadAdminData();await window.CMIMPortalPlayers?.reload();
  }
  async function createPlayer(event){
    event.preventDefault();
    const form=event.currentTarget,nick=String(new FormData(form).get('nick')||'').trim(),button=form.querySelector('button[type=submit]');
    if(nick.length<2||nick.length>32){flash('Nick precisa ter entre 2 e 32 caracteres.',true);return;}
    button.disabled=true;
    try{
      await applyRanking({nick});
      form.reset();flash('Jogador cadastrado e inscrito na temporada ativa.');
    }catch(e){
      const message=String(e.message||'Falha ao cadastrar');
      if(message.includes('Nick parecido')){
        const answer=prompt('Existe um nick parecido. Se conferiu e deseja cadastrar outro jogador, DIGITE novamente o nick exato:');
        if(answer===nick){try{await applyRanking({nick,confirmNick:nick});form.reset();flash('Jogador cadastrado.');}
          catch(e2){flash(e2.message,true);}}
      }else flash(message,true);
    }finally{button.disabled=false;}
  }
  async function enrollPlayer(event){
    event.preventDefault();
    const id=$('admin-existing-player').value;
    if(!id)return flash('Selecione um jogador do histórico.',true);
    const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
    try{await applyRanking({playerId:id});flash('Jogador inscrito na temporada ativa.');}
    catch(e){flash(e.message,true);}
    finally{button.disabled=false;}
  }

  function reviewGroups(){
    const groups=new Map();
    for(const row of state.reports){
      const id=row.room_id;
      if(!groups.has(id))groups.set(id,{id,games:[]});
      groups.get(id).games.push(row);
    }
    return [...groups.values()].map(group=>{
      group.games.sort((a,b)=>a.game-b.game);
      const first=group.games[0],teams=first?.teams||[];
      const teamA=String(teams[0]?.name||'Equipe A'),teamB=String(teams[1]?.name||'Equipe B');
      const aw=group.games.filter(g=>g.winner_team===teamA).length,
            bw=group.games.filter(g=>g.winner_team===teamB).length;
      group.teamA=teamA;group.teamB=teamB;group.aw=aw;group.bw=bw;
      group.season=first?.season_name||'Temporada não vinculada';
      group.seasonId=first?.season_id||null;
      group.status=group.games.some(g=>g.review_status==='rejected')?'rejected':
        group.games.every(g=>g.review_status==='approved')?'approved':'pending';
      group.complete=group.games.length>=2&&group.games.length<=3&&
        group.games.every((g,index)=>g.game===index+1)&&Math.max(aw,bw)===2&&
        (group.games.length===2?Math.min(aw,bw)===0:Math.min(aw,bw)===1);
      group.reason=group.games.find(g=>g.review_note)?.review_note||'';
      group.date=group.games[0]?.confirmed_at||null;
      return group;
    }).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  }
  function renderReviewQueue(){
    const box=$('review-list');if(!box)return;
    const groups=reviewGroups();
    const counts={pending:0,approved:0,rejected:0};
    for(const g of groups)counts[g.status]++;
    $('review-pending-count').textContent=counts.pending;
    $('review-approved-count').textContent=counts.approved;
    $('review-rejected-count').textContent=counts.rejected;
    const badge=$('review-nav-badge');
    if(badge){badge.textContent=String(counts.pending);badge.hidden=counts.pending===0;}
    const filter=$('review-filter')?.value||'pending';
    const list=groups.filter(g=>filter==='all'||g.status===filter);
    $('review-status').textContent=list.length+' série(s) exibida(s) · '+counts.pending+' aguardando decisão.';
    if(!list.length){
      box.innerHTML='<div class="review-empty">'+(filter==='pending'?
        'Tudo em dia! Nenhuma série aguardando aprovação. As próximas MD3 aparecerão aqui quando os capitães registrarem os resultados.':
        'Não há partidas nessa categoria.')+'</div>';
      return;
    }
    box.innerHTML=list.map(g=>{
      const label=g.status==='approved'?'✓ APROVADA':g.status==='rejected'?'✕ REJEITADA':
        g.complete?'● AGUARDANDO ADM':'◷ SÉRIE EM ANDAMENTO';
      const teamA=esc(g.teamA),teamB=esc(g.teamB);
      const games=g.games.map(game=>{
        const banNames=(game.bans||[]).map(b=>b.champion).filter(Boolean);
        const picks=(game.picks||[]).map(p=>[p.nick,p.champion].filter(Boolean).join(' · '));
        return '<div class="review-game"><div class="review-game-heading"><b>Jogo '+Number(game.game)+'</b><span>Vencedor: '+esc(game.winner_team)+'</span></div>'+
          '<details><summary>Conferir picks, bans e jogadores</summary><div class="review-game-details"><div><b>PICKS / NICKS</b><p>'+esc(picks.join(' | '))+'</p></div>'+
          '<div><b>BANS</b><p>'+esc(banNames.join(', '))+'</p></div></div></details></div>';
      }).join('');
      const players=(g.games[0]?.teams||[]).map(team=>'<div><b>'+esc(team.name)+'</b><p>'+esc((team.players||[]).join(' · '))+'</p></div>').join('');
      let actions='';
      if(g.status==='pending')actions='<button class="review-approve admin-main-button" type="button" data-review-room="'+esc(g.id)+'" '+
        (!g.complete||state.reviewBusy?'disabled':'')+'>✓ APROVAR MD3 E LANÇAR PONTOS</button>'+
        '<button class="review-reject" type="button" data-reject-room="'+esc(g.id)+'">Rejeitar partidas</button>';
      if(g.status==='rejected')actions='<button class="review-reopen" type="button" data-reopen-room="'+esc(g.id)+'">Reabrir análise</button>';
      if(g.status==='approved')actions='<span class="review-approved-note">✓ Contabilizada no ranking e nas estatísticas.</span>';
      const note=g.status==='rejected'?'Motivo da rejeição: '+esc(g.reason):
        !g.complete?'A aprovação será liberada quando a MD3 terminar em 2×0 ou 2×1.':
        'MD3 concluída e pronta para a conferência do administrador.';
      return '<article class="review-series '+g.status+'"><div class="review-series-top">'+
        '<div><span class="admin-eyebrow">MD3 · '+esc(g.season)+'</span><h3>'+teamA+' <span>×</span> '+teamB+'</h3>'+
        '<p>Confirmados: '+g.games.length+' jogo(s) · Sala: '+esc(g.id.slice(0,8))+'…</p></div>'+
        '<span class="review-badge '+g.status+'">'+label+'</span></div>'+
        '<div class="review-score"><span>'+teamA+'</span><strong>'+g.aw+' × '+g.bw+'</strong><span>'+teamB+'</span></div>'+
        '<div class="review-roster">'+players+'</div>'+
        '<div class="review-games">'+games+'</div>'+
        '<div class="review-note">'+note+'</div>'+
        '<div class="review-actions">'+actions+'<a href="./relatorios.html?room='+encodeURIComponent(g.id)+'" target="_blank" rel="noopener noreferrer">↗ Abrir relatórios TXT</a></div></article>';
    }).join('');
    box.querySelectorAll('[data-review-room]').forEach(button=>button.addEventListener('click',()=>approveRoom(button.dataset.reviewRoom)));
    box.querySelectorAll('[data-reject-room]').forEach(button=>button.addEventListener('click',()=>reviewRoom(button.dataset.rejectRoom,'reject')));
    box.querySelectorAll('[data-reopen-room]').forEach(button=>button.addEventListener('click',()=>reviewRoom(button.dataset.reopenRoom,'reopen')));
  }
  async function approveRoom(room){
    if(!state.admin||state.reviewBusy)return;
    const group=reviewGroups().find(g=>g.id===room);
    if(!group||group.status!=='pending'||!group.complete)return flash('A MD3 precisa estar concluída e pendente.',true);
    if(!confirm('APROVAR A MD3 '+group.aw+'×'+group.bw+'?\\n\\n'+group.teamA+' x '+group.teamB+
      '\\nEsta ação atribuirá os pontos no ranking oficial e liberará picks/bans/win rate nas estatísticas. Não é possível aprovar novamente.'))return;
    state.reviewBusy=true;renderReviewQueue();
    $('review-status').textContent='Validando elenco e lançando a pontuação no banco...';
    try{
      const result=await jsonFetch('/rest/v1/rpc/cmim_pilot_publish',{
        secured:true,method:'POST',body:JSON.stringify({p_room:room,p_expected_version:state.version})
      });
      await loadAdminData();
      flash('✓ MD3 '+result.score+' aprovada! Pontuação e estatísticas oficiais atualizadas.');
    }catch(error){
      flash('Não foi possível aprovar: '+error.message+'. Confira se os dez nicks estão inscritos na temporada.',true);
    }finally{state.reviewBusy=false;renderReviewQueue();}
  }
  async function reviewRoom(room,decision){
    if(!state.admin||state.reviewBusy)return;
    const group=reviewGroups().find(g=>g.id===room);
    if(!group||!['reject','reopen'].includes(decision))return;
    let reason=null;
    if(decision==='reject'){
      reason=prompt('Por que a MD3 será rejeitada? Informe o motivo (obrigatório, até 400 caracteres).');
      if(reason===null)return;
      reason=reason.trim();
      if(!reason)return flash('A rejeição precisa de um motivo.',true);
    }else if(!confirm('Reabrir esta MD3 para análise? Ela continuará fora das estatísticas até ser aprovada.'))return;
    state.reviewBusy=true;renderReviewQueue();
    try{
      await jsonFetch('/rest/v1/rpc/cmim_review_draft_series',{
        secured:true,method:'POST',
        body:JSON.stringify({p_room:room,p_action:decision,p_reason:reason})
      });
      await loadAdminData();
      flash(decision==='reject'?'A série foi rejeitada e não contará no ranking.':'A série voltou à fila de análise.');
    }catch(error){flash('Erro ao revisar: '+error.message,true);}
    finally{state.reviewBusy=false;renderReviewQueue();}
  }

  function renderNewsManager(){
    const target=$('admin-news-list');if(!target)return;
    target.innerHTML=state.news.length?state.news.map(n=>
      '<div class="admin-news-row"><div><b>'+esc(n.title)+'</b><small>'+esc(n.category)+' · '+(n.published?'Publicado':'Rascunho')+'</small></div>'+
      '<button type="button" data-news-id="'+esc(n.id)+'">'+(n.published?'Tirar do ar':'Publicar')+'</button></div>'
    ).join(''):'<p class="portal-muted">Ainda não há edições cadastradas.</p>';
    target.querySelectorAll('[data-news-id]').forEach(btn=>btn.addEventListener('click',()=>toggleNews(btn.dataset.newsId)));
  }
  function newsSafeUrl(value){
    if(!value)return null;
    try{const url=new URL(value);return url.protocol==='https:'&&value.length<1500?url.href:null;}catch{return null;}
  }
  async function createNews(event){
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('button[type=submit]');
    const fd=new FormData(form),title=String(fd.get('title')||'').trim(),
      excerpt=String(fd.get('excerpt')||'').trim(),
      body=String(fd.get('body')||'').trim(),
      category=String(fd.get('category')||'Comunicado'),
      imageValue=String(fd.get('image_url')||'').trim(),
      published=fd.has('published');
    if(title.length<5||title.length>140||excerpt.length<3||excerpt.length>280||body.length<3||body.length>25000)
      return flash('Confira o título, resumo e conteúdo da notícia.',true);
    if(imageValue&&!newsSafeUrl(imageValue))return flash('Imagem deve ser um endereço HTTPS válido.',true);
    button.disabled=true;
    try{
      await jsonFetch('/rest/v1/cmim_portal_news',{
        secured:true,method:'POST',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({title,excerpt,body,category,image_url:newsSafeUrl(imageValue),published,published_at:published?new Date().toISOString():null})
      });
      form.reset();await loadAdminData();await loadNews();flash(published?'Edição do CMIM News publicada.':'Rascunho de notícia salvo.');
    }catch(e){flash('Erro ao salvar notícia: '+e.message,true);}
    finally{button.disabled=false;}
  }
  async function toggleNews(id){
    const n=state.news.find(x=>x.id===id);if(!n)return;
    try{
      await jsonFetch('/rest/v1/cmim_portal_news?id=eq.'+encodeURIComponent(id),{
        secured:true,method:'PATCH',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({published:!n.published,published_at:n.published?null:new Date().toISOString()})
      });
      await loadAdminData();await loadNews();flash('Status de publicação atualizado.');
    }catch(e){flash(e.message,true);}
  }
  let newsCache=[];
  async function loadNews(){
    const box=$('cmim-news-grid');if(!box)return;
    try{
      const news=await jsonFetch('/rest/v1/cmim_portal_news?select=id,title,excerpt,body,category,image_url,published_at&published=eq.true&order=published_at.desc&limit=6');
      newsCache=Array.isArray(news)?news:[];
      if(!newsCache.length){
        box.innerHTML='<article class="news-empty"><span class="mini yellow">EDIÇÃO ZERO · CMIM NEWS</span><h3>AS PRÓXIMAS HISTÓRIAS SERÃO CONTADAS AQUI.</h3><p>O jornal oficial da comunidade vai reunir reportagens, resultados de MD3, entrevistas, polêmicas do Rift e destaques da in-house. A primeira edição ainda não foi publicada.</p><a href="#redes">ACOMPANHAR A COMUNIDADE →</a></article>';
        return;
      }
      box.innerHTML=newsCache.map((n,i)=>{
        const date=n.published_at?new Date(n.published_at).toLocaleDateString('pt-BR'):'CMIM News';
        const img=newsSafeUrl(n.image_url);
        return '<article class="news-card">'+(img?'<img src="'+esc(img)+'" alt="" loading="lazy">':'<div class="news-card-art">CMIM<span>NEWS</span></div>')+
          '<div class="news-card-content"><small>'+esc(n.category)+' · '+esc(date)+'</small><h3>'+esc(n.title)+'</h3><p>'+esc(n.excerpt)+'</p>'+
          '<button type="button" data-read-news="'+i+'">LER REPORTAGEM →</button></div></article>';
      }).join('');
      box.querySelectorAll('[data-read-news]').forEach(btn=>btn.addEventListener('click',()=>{
        const n=newsCache[Number(btn.dataset.readNews)];
        const reader=$('cmim-news-reader');$('news-reader-category').textContent=n.category||'CMIM News';
        $('news-reader-title').textContent=n.title;$('news-reader-body').textContent=n.body;reader.showModal();
      }));
    }catch{
      box.innerHTML='<div class="news-empty"><h3>CMIM NEWS</h3><p>Não foi possível consultar as edições agora. Tente atualizar a página.</p></div>';
    }
  }
  // No portal o link leva a uma pagina completa; o antigo modal nao e usado.
  $('review-filter')?.addEventListener('change',renderReviewQueue);
  $('review-refresh')?.addEventListener('click',()=>{
    loadAdminData().then(()=>flash('Fila de partidas atualizada.')).catch(e=>flash('Erro ao atualizar: '+e.message,true));
  });
  $('portal-admin-button')?.addEventListener('click',event=>{
    event.preventDefault();location.href='./admin.html';
  });
  $('portal-admin-close')?.addEventListener('click',()=>$('portal-admin-dialog').close());
  $('portal-login')?.addEventListener('submit',login);
  $('portal-logout')?.addEventListener('click',logout);
  $('admin-player-select')?.addEventListener('change',showSelectedMetadata);
  $('admin-player-form')?.addEventListener('submit',saveMetadata);
  $('admin-create-player')?.addEventListener('submit',createPlayer);
  $('admin-enroll-player')?.addEventListener('submit',enrollPlayer);
  $('admin-create-news')?.addEventListener('submit',createNews);
  $('news-reader-close')?.addEventListener('click',()=>$('cmim-news-reader').close());
  loadNews();
  // O dashboard abre sozinho ao carregar, sem misturar formularios ao portal.
  if($('admin-management-view')){
    if(state.session){
      verifySession().then(ok=>{
        if(ok){showManager();return loadAdminData().catch(e=>flash(e.message,true));}
        showLogin();
      });
    }else showLogin();
  }
})();