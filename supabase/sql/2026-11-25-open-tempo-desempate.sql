
ALTER TABLE public.cmim_competition_matches ADD COLUMN IF NOT EXISTS is_walkover boolean NOT NULL DEFAULT false;
ALTER TABLE public.cmim_competition_matches ADD CONSTRAINT cmim_walkover_no_duration CHECK(NOT is_walkover OR victory_seconds IS NULL);
CREATE OR REPLACE FUNCTION public.cmim_hybrid_standings(p_competition uuid)
RETURNS TABLE(group_no integer,team_id uuid,wins integer,losses integer,direct_wins integer,tie_order integer,standing_position bigint,unresolved boolean)
LANGUAGE sql STABLE SET search_path TO '' AS $$
WITH config AS (
 SELECT league_tier='open' AS use_duration FROM public.cmim_competitions WHERE id=p_competition AND structure='liga_mata_mata'
), members AS (
 SELECT ((m.match_number-1)/2+1)::int AS grp,t.id
 FROM public.cmim_competition_matches m CROSS JOIN LATERAL (VALUES(m.team_a_id),(m.team_b_id)) t(id)
 WHERE m.competition_id=p_competition AND m.round_number=1 AND t.id IS NOT NULL
), stats AS (
 SELECT x.grp,x.id,count(m.id) FILTER(WHERE m.winner_id=x.id)::int AS w,
 count(m.id) FILTER(WHERE m.winner_id<>x.id)::int AS l
 FROM members x LEFT JOIN public.cmim_competition_matches m ON m.competition_id=p_competition AND m.round_number<=3 AND m.status='approved' AND x.id IN(m.team_a_id,m.team_b_id)
 GROUP BY x.grp,x.id
), mini AS (
 SELECT s.*,coalesce(d.dw,0)::int AS dw,
 CASE WHEN d.valid_wins>0 AND d.missing_times=0 THEN d.avg_seconds END AS avg_seconds,
 e.group_tiebreak AS tb
 FROM stats s LEFT JOIN public.cmim_competition_entries e ON e.competition_id=p_competition AND e.team_id=s.id
 LEFT JOIN LATERAL (
  SELECT count(*) AS dw,count(*) FILTER(WHERE NOT m.is_walkover) AS valid_wins,
  count(*) FILTER(WHERE NOT m.is_walkover AND m.victory_seconds IS NULL) AS missing_times,
  avg(m.victory_seconds) FILTER(WHERE NOT m.is_walkover) AS avg_seconds
  FROM public.cmim_competition_matches m JOIN stats o ON o.id=CASE WHEN m.team_a_id=s.id THEN m.team_b_id ELSE m.team_a_id END
  WHERE m.competition_id=p_competition AND m.round_number<=3 AND m.status='approved' AND m.winner_id=s.id AND o.grp=s.grp AND o.w=s.w
 ) d ON true
), usable AS (
 SELECT m.*,CASE WHEN (SELECT use_duration FROM config) AND count(avg_seconds) OVER(PARTITION BY grp,w,dw)=count(*) OVER(PARTITION BY grp,w,dw) THEN avg_seconds END AS duration_key
 FROM mini m
), ranks AS (
 SELECT u.*,count(*) OVER(PARTITION BY grp,w,dw,duration_key) AS tied,
 count(tb) OVER(PARTITION BY grp,w,dw,duration_key) AS entered,
 count(*) OVER(PARTITION BY grp,w,dw,duration_key,tb) AS duplicate,
 row_number() OVER(PARTITION BY grp ORDER BY w DESC,dw DESC,duration_key ASC NULLS LAST,tb NULLS LAST,id) AS pos
 FROM usable u
)
SELECT grp,id,w,l,dw,tb,pos,(tied>1 AND (entered<>tied OR duplicate>1 OR EXISTS(
 SELECT 1 FROM ranks r2 WHERE r2.grp=ranks.grp AND r2.w=ranks.w AND r2.dw=ranks.dw AND r2.duration_key IS NOT DISTINCT FROM ranks.duration_key AND r2.duplicate>1
))) FROM ranks ORDER BY grp,pos;
$$;

DO $patch$
DECLARE d text; old_text text:='(to_jsonb(NEW)-''scheduled_at''-''updated_at'') IS DISTINCT FROM (to_jsonb(OLD)-''scheduled_at''-''updated_at'')';
BEGIN
 SELECT pg_get_functiondef('cmim_private.cmim_guard_competition_match()'::regprocedure) INTO d;
 IF strpos(d,old_text)=0 THEN RAISE EXCEPTION 'Proteção incompatível'; END IF;
 d:=replace(d,old_text,$new$(to_jsonb(NEW)-'scheduled_at'-'updated_at'-'victory_seconds'-'is_walkover') IS DISTINCT FROM (to_jsonb(OLD)-'scheduled_at'-'updated_at'-'victory_seconds'-'is_walkover')$new$);
 d:=replace(d,' IF NEW.status=''approved'' AND OLD.status<>''approved'' THEN',$new$
 IF (NEW.victory_seconds IS DISTINCT FROM OLD.victory_seconds OR NEW.is_walkover IS DISTINCT FROM OLD.is_walkover) AND (
  NOT public.cmim_is_admin() OR NEW.round_number>3 OR NOT EXISTS(SELECT 1 FROM public.cmim_competitions c WHERE c.id=NEW.competition_id AND c.league_tier='open' AND c.structure='liga_mata_mata') OR EXISTS(SELECT 1 FROM public.cmim_competition_matches m WHERE m.competition_id=NEW.competition_id AND m.round_number>=4)
 ) THEN RAISE EXCEPTION 'Dados de desempate editáveis pelo ADM apenas nos grupos do Open, antes dos playoffs.'; END IF;
 IF NEW.status='approved' AND OLD.status<>'approved' THEN$new$);
 EXECUTE d;
END $patch$;
NOTIFY pgrst,'reload schema';
