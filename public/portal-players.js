/* CMIM Portal — lista pública baseada no ranking real do Supabase. */
(() => {
  'use strict';
  const API = 'https://klpvidxhzofbwstvvxib.supabase.co';
  const PUBLISHABLE = 'sb_publishable_B5WMdyJBIdYhauVepUIOZw_hnvXs4Xn';
  const scoring = {games:.5,wins:2,losses:-3,md3:3,mvp:2,bagre:-2,first:10,second:7,third:4,fourth:-4,penalties:-1,adjustment:1};
  const colors = {S:'#f6d462',A:'#c58ce9',B:'#83c6ff',C:'#7ce1ab',D:'#f4b27b',E:'#adb5bf',F:'#ef9195'};
  const state = {players:[],loaded:false,error:false,season:null,status:'active'};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
  const number = value => Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:1});
  const get = async (path) => {
    const response = await fetch(API+path,{headers:{apikey:PUBLISHABLE},cache:'no-store'});
    if (!response.ok) throw Error('Erro HTTP '+response.status+' ao consultar o ranking.');
    return response.json();
  };
  function computePlacement(data,season) {
    if(!season) return new Map();
    const registered = new Set(season.roster || []);
    const participants=(data.players||[]).filter(p=>registered.has(p.id)).map(p=>({...p,stats:{}}));
    const byId=new Map(participants.map(p=>[p.id,p]));
    for(const event of data.events || []) {
      if(event.seasonId!==season.id) continue;
      for(const delta of event.deltas || []){
        const player=byId.get(delta.playerId);
        if(!player) continue;
        for(const field of Object.keys(scoring)) player.stats[field]=(player.stats[field]||0)+Number(delta[field]||0);
      }
    }
    const result=participants.map(p=>{
      const total=Object.keys(scoring).reduce((sum,k)=>sum+(Number(p.stats[k])||0)*scoring[k],0);
      return {...p,points:total,wins:Number(p.stats.wins||0),first:Number(p.stats.first||0)};
    }).sort((a,b)=>b.points-a.points||b.wins-a.wins||b.first-a.first||String(a.nick).localeCompare(String(b.nick),'pt-BR')||String(a.id).localeCompare(String(b.id)));
    return new Map(result.map((p,index)=>[p.id,{position:index+1,points:p.points}]));
  }
  function profileFor(player,byId,byNick){
    if(byId.has(player.id))return byId.get(player.id);
    return byNick.get(slug(player.nick))||null;
  }
  function sanitizeAvatar(value){
    if(typeof value!=='string')return '';
    try {const url=new URL(value);return url.protocol==='https:'&&value.length<1000?url.href:'';}
    catch{return ''}
  }
  async function loadPlayers(){
    const status=$('players-status'),counter=$('total-players');
    if(status) status.textContent='Consultando histórico do ranking...';
    try{
      const rankRows=await get('/rest/v1/cmim_rank?id=eq.1&select=data,version');
      const data=rankRows?.[0]?.data;
      if(!data || !Array.isArray(data.players))throw Error('O histórico do ranking ainda não está disponível.');
      let profiles=[], playerMeta=[];
      try{
        const response=await get('/rest/v1/cmim_profiles?select=nick,tag,lane,tier,avatar_url,rank_player_id&limit=1000');
        profiles=Array.isArray(response)?response:[];
      }catch{ /* A classificação pública continua disponível mesmo sem perfis. */ }
      try{
        const response=await get('/rest/v1/cmim_player_meta?select=rank_player_id,tier,lane,riot_tag,champion_tags,player_tags&limit=1000');
        playerMeta=Array.isArray(response)?response:[];
      }catch{ /* Legacy rankings remain visible if metadata is unavailable. */ }
      const seasons=[...(data.seasons||[])].sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
      // Sempre preferir o último campeonato encerrado ao falar em colocação final.
      const lastClosed=seasons.find(s=>s.status==='closed');
      const season=lastClosed||seasons[0]||null;
      const complete=Boolean(lastClosed);
      const placements=computePlacement(data,season);
      const byId=new Map(profiles.filter(p=>p.rank_player_id).map(p=>[p.rank_player_id,p]));
      const metaById=new Map(playerMeta.map(p=>[String(p.rank_player_id),p]));
      const byNick=new Map(profiles.map(p=>[slug(p.nick),p]));
      state.players=data.players.filter(p=>p&&p.id&&p.nick).map(p=>{
        const profile=profileFor(p,byId,byNick),meta=metaById.get(String(p.id)),placement=placements.get(p.id);
        const tierCandidate=meta?.tier||profile?.tier;
        const tier=['S','A','B','C','D','E','F'].includes(tierCandidate)?tierCandidate:null;
        const tagCandidate=meta?.riot_tag||profile?.tag;
        const tag=/^[A-Za-z0-9]{3,6}$/.test(String(tagCandidate||''))?tagCandidate:null;
        const laneCandidate=meta?.lane||profile?.lane;
        const lane=['TOP','JG','MID','ADC','SUP'].includes(laneCandidate)?laneCandidate:null;
        const champions=Array.isArray(meta?.champion_tags)?meta.champion_tags.filter(x=>typeof x==='string'&&x.length<=24).slice(0,5):[];
        return {id:p.id,nick:p.nick,tier,tag,lane,champions,playerTags:Array.isArray(meta?.player_tags)?meta.player_tags.slice(0,12):[],avatar:sanitizeAvatar(profile?.avatar_url),position:placement?.position||null,points:placement?.points??null};
      });
      state.loaded=true;state.error=false;state.season=season;state.status=complete?'closed':'active';
      if(counter)counter.textContent=state.players.length;
      const count=$('playersTotal');if(count)count.textContent=state.players.length;
      const participants=$('playersRanked');if(participants)participants.textContent=state.players.filter(p=>p.position).length;
      const seasonEl=$('playersSeason');
      if(seasonEl)seasonEl.textContent=season?(complete?'Último ranking encerrado: ':'Classificação parcial: ')+season.name:'Nenhuma temporada disponível';
      const sort=$('players-sort');
      if(sort)sort.options[0].textContent=complete?'Colocação no último ranking':'Posição atual';
      if(status)status.textContent=complete?'Posições finais confirmadas pela última temporada encerrada.':'Temporada ainda em andamento: as posições podem mudar. Jogadores de outras temporadas aparecem sem colocação atual.';
      renderPlayers();
    }catch(error){
      state.loaded=false;state.error=true;
      if(status)status.textContent='Não foi possível atualizar os jogadores agora. '+String(error?.message||'Confira a conexão.');
      const table=$('players-body');
      if(table)table.innerHTML='<tr><td colspan="5" class="roster-empty">Erro de conexão. Use o botão “Tentar novamente” para carregar os dados reais.</td></tr>';
      if(counter)counter.textContent='—';
    }
  }
  function renderPlayers(){
    const target=$('players-body');
    if(!target||!state.loaded)return;
    const query=slug($('players-search')?.value||'');
    const tierFilter=$('players-tier')?.value||'all';
    const scope=$('players-scope')?.value||'all';
    const sort=$('players-sort')?.value||'rank';
    let list=state.players.filter(p=>
      (!query||slug(p.nick+' '+(p.tag||'')+' '+(p.lane||'')+' '+(p.playerTags||[]).join(' ')).includes(query))&&
      (tierFilter==='all'||p.tier===tierFilter)&&
      (scope==='all'||scope==='ranked'&&!!p.position||scope==='unranked'&&!p.position||scope==='tagged'&&!!p.tag)
    );
    if(sort==='nick')list.sort((a,b)=>a.nick.localeCompare(b.nick,'pt-BR'));
    else if(sort==='tier')list.sort((a,b)=>(a.tier||'Z').localeCompare(b.tier||'Z')||a.nick.localeCompare(b.nick,'pt-BR'));
    else list.sort((a,b)=>(a.position||9999)-(b.position||9999)||a.nick.localeCompare(b.nick,'pt-BR'));
    $('players-count').textContent=list.length+' de '+state.players.length+' jogadores';
    const isFinal=state.status==='closed';
    if(!list.length){
      target.innerHTML='<tr><td colspan="5" class="roster-empty">Nenhum jogador encontrado com esses filtros.</td></tr>';
      return;
    }
    target.innerHTML=list.map((p,i)=>{
      const avatar=p.avatar?'<img src="'+esc(p.avatar)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span>'+esc(p.nick.slice(0,2).toUpperCase())+'</span>';
      const badge=p.tier?'<span class="tier-pill" style="--tier-color:'+colors[p.tier]+'">'+esc(p.tier)+'</span>':'<span class="tier-pill unknown">A definir</span>';
      const champHtml=p.champions?.length?'<span class="champion-list">'+p.champions.map(c=>'<span class="champion-chip">'+esc(c)+'</span>').join('')+'</span>':'';
      const tag=p.tag?'<span class="riot-tag">#'+esc(p.tag)+'</span>':'<span class="riot-tag subtle">Sem tag vinculada</span>';
      const personalTags=(p.playerTags||[]).map(x=>'<span class="champion-chip" style="border-color:#9d8344;color:#ffefa4">'+esc(x)+'</span>').join('');
      const lane=p.lane?'<span class="lane-pill">'+esc(p.lane)+'</span>':'<span class="unspecified">Não informada</span>';
      const position=p.position?'<strong class="ranking-place '+(p.position<=3?'place-top':'')+'">'+p.position+'º</strong><small>'+(isFinal?'Posição final':'Posição parcial')+' · '+number(p.points)+' pts</small>':'<strong class="ranking-place none">—</strong><small>Sem posição nesta temporada</small>';
      return '<tr><td class="roster-index">'+String(i+1).padStart(2,'0')+'</td><td><div class="player-cell"><div class="player-avatar">'+avatar+'</div><div><b>'+esc(p.nick)+'</b>'+tag+champHtml+personalTags+'</div></div></td><td>'+badge+'</td><td>'+lane+'</td><td class="position-cell">'+position+'</td></tr>';
    }).join('');
  }
  for(const key of ['players-search','players-tier','players-scope','players-sort'])$(key)?.addEventListener(key==='players-search'?'input':'change',renderPlayers);
  $('players-retry')?.addEventListener('click',loadPlayers);
  window.CMIMPortalPlayers={reload:loadPlayers,getPlayers:()=>state.players.map(p=>({...p})),getSeason:()=>state.season};
  document.addEventListener('DOMContentLoaded',loadPlayers,{once:true});
})();