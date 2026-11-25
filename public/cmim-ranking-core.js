/* Official CMIM ranking calculation, shared by In-House and Ranking. */
(()=>{'use strict';
const fields={games:'Jogos',wins:'Vitórias',losses:'Derrotas',md3:'Bônus de série',mvp:'MVP',bagre:'Bagres',first:'1º lugar',second:'2º lugar',third:'3º lugar',fourth:'4º lugar',penalties:'Penalidades',adjustment:'Ajuste de pontos'};
const weights={games:.5,wins:2,losses:-3,md3:3,mvp:2,bagre:-2,first:10,second:7,third:4,fourth:-4,penalties:-1,adjustment:1};

function score(s){return Object.entries(weights).reduce((n,[k,v])=>n+(Number(s[k])||0)*v,0)}
function standings(state,sea,cutoff=Infinity){if(!sea)return[];let ps=state.players.filter(p=>sea.roster.includes(p.id)&&Date.parse(sea.joinedAt?.[p.id]||p.createdAt||0)<=cutoff).map(p=>({...p,stats:Object.fromEntries(Object.keys(fields).map(k=>[k,0]))}));let map=new Map(ps.map(p=>[p.id,p]));state.events.filter(e=>e.seasonId===sea.id&&Date.parse(e.at)<=cutoff).forEach(e=>e.deltas.forEach(d=>{let p=map.get(d.playerId);if(p)Object.keys(fields).forEach(k=>p.stats[k]+=Number(d[k]||0))}));return ps.map(p=>({...p,points:score(p.stats)})).sort((a,b)=>b.points-a.points||b.stats.wins-a.stats.wins||b.stats.first-a.stats.first||(a.nick<b.nick?-1:a.nick>b.nick?1:a.id.localeCompare(b.id))).map((p,i)=>({...p,rank:i+1}))}
window.CMIMRanking={fields,weights,score,standings};
})();