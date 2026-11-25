/* CMIM competitive strength from authenticated Riot Solo/Duo snapshots. */
(()=>{'use strict';
const levels=['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER'];
const names=['Ferro','Bronze','Prata','Ouro','Platina','Esmeralda','Diamante','Mestre','Grão-Mestre','Desafiante'];
const divs=['IV','III','II','I'];
function rank(p,s){if(!p||!s||s.riot_id!==p.nick+'#'+p.tag)return null;return s}
function points(s){if(!s||s.rank_tier==='UNRANKED')return null;const i=levels.indexOf(s.rank_tier);if(i<0)return null;const lp=Math.max(0,Number(s.lp)||0);if(i<7){const d=divs.indexOf(s.division);if(d<0)return null;return i*10+d*2.5+Math.min(99,lp)*.025;}return i*10+Math.min(9.9,lp/100);}
function label(s){if(!s)return 'Elo não sincronizado';if(s.rank_tier==='UNRANKED')return 'Sem elo Solo/Duo';const i=levels.indexOf(s.rank_tier);return (names[i]||s.rank_tier)+(i<7?' '+(s.division||''):'')+' · '+s.lp+' PdL';}
function strength(members,profiles,snapshots){const starters=members.filter(m=>m.starter);const values=starters.map(m=>points(rank(profiles.find(p=>p.id===m.user_id),snapshots.find(s=>s.profile_id===m.user_id))));const known=values.filter(v=>v!==null);return {value:starters.length===5&&known.length===5?Math.round(known.reduce((a,b)=>a+b,0)/5):null,known:known.length,total:starters.length};}
window.CMIMStrength={rank,points,label,strength};
})();