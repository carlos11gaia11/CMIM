
CREATE TABLE public.cmim_riot_rank_snapshots(
 profile_id uuid PRIMARY KEY REFERENCES public.cmim_profiles(id) ON DELETE CASCADE,
 rank_tier text NOT NULL CHECK(rank_tier IN ('IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER','UNRANKED')),
 division text, lp integer NOT NULL DEFAULT 0 CHECK(lp>=0), synced_at timestamptz NOT NULL DEFAULT now(),
 riot_id text NOT NULL);
ALTER TABLE public.cmim_riot_rank_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cmim_riot_rank_snapshots TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cmim_riot_rank_snapshots TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.cmim_riot_rank_snapshots FROM anon,authenticated;
CREATE POLICY cmim_riot_rank_read ON public.cmim_riot_rank_snapshots FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY cmim_competition_cover_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='cmim-team-logos' AND (storage.foldername(name))[1]=auth.uid()::text AND public.cmim_is_admin());
ALTER TABLE public.cmim_competition_matches ADD COLUMN IF NOT EXISTS victory_seconds integer CHECK(victory_seconds BETWEEN 1 AND 21600);
DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('cmim_private.cmim_initial_match_schedule()'::regprocedure) INTO d;
 d:=replace(d,'WHERE id=NEW.competition_id;','WHERE id=NEW.competition_id AND league_tier IS DISTINCT FROM ''open'';');
 EXECUTE d;
 SELECT pg_get_functiondef('cmim_private.cmim_sync_match_agenda()'::regprocedure) INTO d;
 d:=replace(d,'c.title||'' · Rodada ''','coalesce(''CMIM ''||upper(c.league_tier)||'' · '','''')||c.title||'' · Rodada ''');
 EXECUTE d;
END $patch$;
INSERT INTO public.cmim_portal_events(match_id,title,type,starts_at,description,status,updated_at)
SELECT m.id,left(a.name||' x '||b.name,140),'MD'||public.cmim_match_best_of(c.structure,c.series_games,m.round_number),m.scheduled_at,left(coalesce('CMIM '||upper(c.league_tier)||' · ','')||c.title||' · Rodada '||m.round_number||', jogo '||m.match_number,1500),CASE WHEN m.status='approved' THEN 'completed' WHEN m.status='live' THEN 'open' ELSE 'scheduled' END,now()
FROM public.cmim_competition_matches m JOIN public.cmim_competitions c ON c.id=m.competition_id JOIN public.cmim_squads a ON a.id=m.team_a_id JOIN public.cmim_squads b ON b.id=m.team_b_id
ON CONFLICT(match_id) DO UPDATE SET title=excluded.title,type=excluded.type,starts_at=excluded.starts_at,description=excluded.description,status=excluded.status,updated_at=now();
NOTIFY pgrst,'reload schema';
