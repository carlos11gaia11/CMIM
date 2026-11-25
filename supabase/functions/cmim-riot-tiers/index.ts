
const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLISHABLE = Deno.env.get("SUPABASE_ANON_KEY") ??
  JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? "";
const RIOT_KEY = Deno.env.get("RIOT_API_KEY") ?? "";
const PLATFORM = (Deno.env.get("RIOT_PLATFORM") ?? "br1").toLowerCase();
const ELOS: Record<string, [string, string]> = {
  CHALLENGER: ["DESAFIANTE", "S"],
  GRANDMASTER: ["GRAO_MESTRE", "S"],
  MASTER: ["MESTRE", "S"],
  DIAMOND: ["DIAMANTE", "A"],
  EMERALD: ["ESMERALDA", "B"],
  PLATINUM: ["PLATINA", "C"],
  GOLD: ["OURO", "D"],
  SILVER: ["PRATA", "E"],
  BRONZE: ["BRONZE", "F"],
  IRON: ["FERRO", "F"],
};
const ORIGIN = "https://carlos11gaia11.github.io";
function cors(req: Request) {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin === ORIGIN ? ORIGIN : ORIGIN,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
}
function respond(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: cors(req) });
}
async function parseJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return null; }
}
async function riotGet(url: string) {
  const response = await fetch(url, {
    headers: { "X-Riot-Token": RIOT_KEY, "Accept": "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  return {
    status: response.status,
    data: response.ok ? await parseJson(response) : null,
    retryAfter: response.headers.get("Retry-After"),
  };
}
type Profile = { id: string; nick: string; tag: string; current_elo: string | null; tier: string | null };
type Update = { profile: Profile; elo: string; tier: string; division: string | null; lp: number; wins: number; losses: number };
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: cors(req)});
  if (req.method !== "POST") return respond(req, 405, {error:"Método não permitido."});
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return respond(req, 401, {error:"Entre na conta administrativa."});
  if (!URL_BASE || !PUBLISHABLE || !SERVICE) return respond(req, 503, {error:"Credenciais do Supabase indisponíveis."});

  const meRes = await fetch(URL_BASE + "/auth/v1/user", {
    headers: { "apikey": PUBLISHABLE, "Authorization": "Bearer " + jwt },
  });
  const me = meRes.ok ? await parseJson(meRes) : null;
  if (!meRes.ok || me?.app_metadata?.cmim_admin !== true)
    return respond(req, 403, {error:"Somente administradores CMIM podem sincronizar tiers."});
  if (!RIOT_KEY) return respond(req, 503, {error:"Configure o secret RIOT_API_KEY nas Edge Functions do Supabase."});
  if (!/^[a-z0-9]+$/.test(PLATFORM)) return respond(req, 500, {error:"RIOT_PLATFORM inválida."});

  let apply = false;
  let teamsOnly = false;
  let offset=0;
  try {
    const body = await req.json();
    apply = body?.apply === true;
    teamsOnly=body?.teamsOnly===true;
    offset=Math.max(0,Math.min(1000,Number(body?.offset)||0));
  } catch {
    return respond(req, 400, {error:"Envie um JSON com apply true ou false."});
  }

  const adminHeaders = {
    "apikey": SERVICE, "Authorization": "Bearer " + SERVICE,
    "Content-Type": "application/json",
  };
  const rows = await fetch(URL_BASE + "/rest/v1/cmim_profiles?select=id,nick,tag,current_elo,tier&limit=1000", {
    headers: adminHeaders, signal: AbortSignal.timeout(10000),
  });
  if (!rows.ok) return respond(req, 502, {error:"Não foi possível consultar perfis do CMIM."});
  let profiles = await parseJson(rows) as Profile[];
  if (!Array.isArray(profiles)) return respond(req, 502, {error:"Formato inválido dos perfis."});

  if(teamsOnly){const m=await fetch(URL_BASE+'/rest/v1/cmim_squad_members?select=user_id&limit=2500',{headers:adminHeaders});if(!m.ok)return respond(req,502,{error:'Não foi possível consultar elencos.'});const ids=new Set((await parseJson(m)).map((x:any)=>x.user_id));profiles=profiles.filter(p=>ids.has(p.id)).sort((a,b)=>a.id.localeCompare(b.id));}
  const total=profiles.length;
  if(teamsOnly)profiles=profiles.slice(offset,offset+5);
  const snapshots:any[]=[];
  const updates: Update[] = [];
  const notFound: string[] = [];
  const withoutSolo: string[] = [];
  const failure: string[] = [];
  try {
    for (const p of profiles) {
      if (!p.nick || !p.tag) continue;
      const gameId = p.nick + "#" + p.tag;
      const account = await riotGet(
        "https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/" +
        encodeURIComponent(p.nick) + "/" + encodeURIComponent(p.tag)
      );
      if (account.status === 404) { notFound.push(gameId); continue; }
      if (account.status === 401 || account.status === 403)
        return respond(req, 502, {error:"A chave da API Riot não está autorizada ou expirou. Atualize o secret RIOT_API_KEY.", processed: updates.length, applied: 0});
      if (account.status === 429)
        return respond(req, 429, {error:"Limite de requisições da Riot. Tente depois.", retryAfter: account.retryAfter, applied:0});
      if (account.status !== 200 || !account.data?.puuid) {
        failure.push(gameId + " (conta HTTP " + account.status + ")");
        continue;
      }

      const league = await riotGet(
        "https://" + PLATFORM + ".api.riotgames.com/lol/league/v4/entries/by-puuid/" +
        encodeURIComponent(account.data.puuid)
      );
      if (league.status === 401 || league.status === 403)
        return respond(req, 502, {error:"A chave Riot não está autorizada para consultar as ligas.", applied:0});
      if (league.status === 429)
        return respond(req, 429, {error:"Limite de requisições da Riot. Tente depois.", retryAfter: league.retryAfter, applied:0});
      if (league.status !== 200 || !Array.isArray(league.data)) {
        failure.push(gameId + " (liga HTTP " + league.status + ")");
        continue;
      }
      const solo = league.data.find((entry:any) => entry.queueType === "RANKED_SOLO_5x5");
      if (!solo || !ELOS[solo.tier]) { withoutSolo.push(gameId); snapshots.push({profile_id:p.id,riot_id:gameId,rank_tier:'UNRANKED',division:null,lp:0,synced_at:new Date().toISOString()}); continue; }
      snapshots.push({profile_id:p.id,riot_id:gameId,rank_tier:solo.tier,division:solo.rank??null,lp:Math.max(0,Number(solo.leaguePoints??0)),synced_at:new Date().toISOString()});
      const [elo, tier] = ELOS[solo.tier];
      updates.push({
        profile:p, elo, tier, division:solo.rank ?? null,
        lp:Number(solo.leaguePoints ?? 0), wins:Number(solo.wins ?? 0), losses:Number(solo.losses ?? 0),
      });
    }
  } catch (e) {
    return respond(req, 502, {error:"Falha de conexão com a Riot; nenhuma alteração foi feita.", details:String(e).slice(0,150), applied:0});
  }

  let changed = 0;
  if(apply && snapshots.length){const response=await fetch(URL_BASE+'/rest/v1/cmim_riot_rank_snapshots?on_conflict=profile_id',{method:'POST',headers:{...adminHeaders,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(snapshots)});if(!response.ok)return respond(req,502,{error:'Falha ao salvar elos oficiais.'});}
  if (apply && !teamsOnly) {
    for (const u of updates) {
      if (u.profile.current_elo === u.elo && u.profile.tier === u.tier) continue;
      const response = await fetch(URL_BASE + "/rest/v1/cmim_profiles?id=eq." + encodeURIComponent(u.profile.id), {
        method:"PATCH",
        headers:{...adminHeaders, "Prefer":"return=minimal"},
        body:JSON.stringify({current_elo:u.elo, tier:u.tier, updated_at:new Date().toISOString()}),
      });
      if (!response.ok) {
        return respond(req, 502, {error:"Não foi possível salvar todos os tiers; parte das alterações pode ter sido aplicada.", changed, profile:u.profile.nick});
      }
      changed++;
    }
  }

  return respond(req, 200, {
    apply, totalProfiles:total, rankedSolo:updates.length, snapshots:snapshots.length,nextOffset:teamsOnly&&offset+5<total?offset+5:null,
    changed, noSolo:withoutSolo, notFound, failed:failure,
    classifications:updates.map(u => ({
      riotId:u.profile.nick + "#" + u.profile.tag, previousElo:u.profile.current_elo,
      previousTier:u.profile.tier, elo:u.elo, tier:u.tier, division:u.division,
      lp:u.lp, wins:u.wins, losses:u.losses,
      changed: u.profile.current_elo !== u.elo || u.profile.tier !== u.tier,
    })),
    note:"Somente Solo/Duo BR1. initial_tier, vínculos e resultados não foram alterados."
  });
});
