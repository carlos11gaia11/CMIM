
ALTER TABLE public.cmim_competitions DROP CONSTRAINT cmim_comp_structure_ck;
ALTER TABLE public.cmim_competitions ADD CONSTRAINT cmim_comp_structure_ck CHECK (structure IN ('copa','liga','suico','liga_mata_mata'));
ALTER TABLE public.cmim_competitions ADD CONSTRAINT cmim_hybrid_config_ck CHECK (structure <> 'liga_mata_mata' OR (max_teams=16 AND series_games=1));
ALTER TABLE public.cmim_competition_entries ADD COLUMN IF NOT EXISTS group_tiebreak integer CHECK (group_tiebreak BETWEEN 1 AND 4);
CREATE OR REPLACE FUNCTION public.cmim_match_best_of(p_structure text,p_default integer,p_round integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
 SELECT CASE WHEN p_structure='liga_mata_mata' THEN CASE WHEN p_round<=3 THEN 1 WHEN p_round<=5 THEN 3 ELSE 5 END ELSE p_default END;
$$;
CREATE OR REPLACE FUNCTION public.cmim_hybrid_standings(p_competition uuid)
RETURNS TABLE(group_no integer,team_id uuid,wins integer,losses integer,direct_wins integer,tie_order integer,standing_position bigint,unresolved boolean)
LANGUAGE sql STABLE SET search_path TO '' AS $$
 WITH members AS (
  SELECT ((m.match_number-1)/2+1)::int AS grp, t.id
  FROM public.cmim_competition_matches m CROSS JOIN LATERAL (VALUES(m.team_a_id),(m.team_b_id)) t(id)
  WHERE m.competition_id=p_competition AND m.round_number=1
 ), stats AS (
  SELECT x.grp,x.id,count(m.id) FILTER(WHERE m.winner_id=x.id)::int AS w,
   count(m.id) FILTER(WHERE m.winner_id<>x.id)::int AS l
  FROM members x LEFT JOIN public.cmim_competition_matches m ON m.competition_id=p_competition AND m.round_number<=3 AND m.status='approved' AND x.id IN(m.team_a_id,m.team_b_id)
  GROUP BY x.grp,x.id
 ), mini AS (
  SELECT s.*, (SELECT count(*)::int FROM public.cmim_competition_matches m JOIN stats o ON o.id=CASE WHEN m.team_a_id=s.id THEN m.team_b_id ELSE m.team_a_id END
    WHERE m.competition_id=p_competition AND m.round_number<=3 AND m.status='approved' AND m.winner_id=s.id AND o.grp=s.grp AND o.w=s.w) AS dw,
    e.group_tiebreak AS tb
  FROM stats s LEFT JOIN public.cmim_competition_entries e ON e.competition_id=p_competition AND e.team_id=s.id
 ), ranks AS (
  SELECT m.*,count(*) OVER(PARTITION BY grp,w,dw) AS tied,
    count(tb) OVER(PARTITION BY grp,w,dw) AS entered,
    count(*) OVER(PARTITION BY grp,w,dw,tb) AS duplicate,
    row_number() OVER(PARTITION BY grp ORDER BY w DESC,dw DESC,tb NULLS LAST,id) AS pos
  FROM mini m
 )
 SELECT grp,id,w,l,dw,tb,pos,(tied>1 AND (entered<>tied OR duplicate>1 OR EXISTS(
  SELECT 1 FROM ranks r2 WHERE r2.grp=ranks.grp AND r2.w=ranks.w AND r2.dw=ranks.dw AND r2.duplicate>1
 ))) FROM ranks ORDER BY grp,pos;
$$;
REVOKE ALL ON FUNCTION public.cmim_hybrid_standings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cmim_hybrid_standings(uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.cmim_hybrid_generate_round(p_competition uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE c public.cmim_competitions%rowtype; ids uuid[]; arr uuid[]; qualifiers uuid[];
 last_round int; rnd int; g int; j int; created int:=0; a uuid; b uuid; pairs int[];
BEGIN
 IF auth.uid() IS NULL OR NOT public.cmim_is_admin() THEN RAISE EXCEPTION 'ADM obrigatório.'; END IF;
 SELECT * INTO c FROM public.cmim_competitions WHERE id=p_competition FOR UPDATE;
 IF NOT FOUND OR c.structure<>'liga_mata_mata' OR c.status NOT IN ('closed','live') THEN RAISE EXCEPTION 'Encerre as inscrições primeiro.'; END IF;
 IF EXISTS(SELECT 1 FROM public.cmim_competition_entries WHERE competition_id=c.id AND status='pending') THEN RAISE EXCEPTION 'Analise todas as inscrições pendentes.'; END IF;
 IF (SELECT count(*) FROM public.cmim_competition_entries WHERE competition_id=c.id AND status='approved')<>16 THEN RAISE EXCEPTION 'São necessários exatamente 16 times aprovados.'; END IF;
 SELECT coalesce(max(round_number),0) INTO last_round FROM public.cmim_competition_matches WHERE competition_id=c.id;
 IF EXISTS(SELECT 1 FROM public.cmim_competition_matches WHERE competition_id=c.id AND status<>'approved') THEN RAISE EXCEPTION 'Homologue todos os confrontos anteriores.'; END IF;
 IF last_round>=6 THEN RAISE EXCEPTION 'A competição já tem campeão.'; END IF;
 rnd:=last_round+1;
 IF rnd<=3 THEN
  IF rnd=1 THEN SELECT array_agg(team_id ORDER BY random()) INTO ids FROM public.cmim_competition_entries WHERE competition_id=c.id AND status='approved';
  ELSE SELECT array_agg(t.id ORDER BY m.match_number,t.side) INTO ids FROM public.cmim_competition_matches m CROSS JOIN LATERAL (VALUES(m.team_a_id,1),(m.team_b_id,2)) t(id,side) WHERE m.competition_id=c.id AND m.round_number=1;
  END IF;
  pairs:=CASE rnd WHEN 1 THEN ARRAY[1,2,3,4] WHEN 2 THEN ARRAY[1,3,2,4] ELSE ARRAY[1,4,2,3] END;
  FOR g IN 0..3 LOOP FOR j IN 0..1 LOOP
    a:=ids[g*4+pairs[j*2+1]]; b:=ids[g*4+pairs[j*2+2]]; created:=created+1;
    INSERT INTO public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id) VALUES(c.id,rnd,created,a,b);
  END LOOP; END LOOP;
 ELSIF rnd=4 THEN
  IF EXISTS(SELECT 1 FROM public.cmim_hybrid_standings(c.id) s WHERE s.standing_position<=2 AND s.unresolved) THEN RAISE EXCEPTION 'Desempate circular: registre a ordem de desempate dos times empatados antes das quartas.'; END IF;
  SELECT array_agg(s.team_id ORDER BY s.group_no,s.standing_position) INTO qualifiers FROM public.cmim_hybrid_standings(c.id) s WHERE s.standing_position<=2;
  IF cardinality(qualifiers)<>8 THEN RAISE EXCEPTION 'Classificação incompleta.'; END IF;
  pairs:=ARRAY[1,4,5,8,3,2,7,6];
  FOR j IN 0..3 LOOP
   INSERT INTO public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id) VALUES(c.id,rnd,j+1,qualifiers[pairs[j*2+1]],qualifiers[pairs[j*2+2]]);
   created:=created+1;
  END LOOP;
 ELSE
  SELECT array_agg(winner_id ORDER BY match_number) INTO arr FROM public.cmim_competition_matches WHERE competition_id=c.id AND round_number=last_round;
  FOR j IN 1..(cardinality(arr)/2) LOOP
   INSERT INTO public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id) VALUES(c.id,rnd,j,arr[j*2-1],arr[j*2]); created:=created+1;
  END LOOP;
 END IF;
 UPDATE public.cmim_competitions SET status='live' WHERE id=c.id AND status='closed';
 RETURN jsonb_build_object('ok',true,'round',rnd,'matchesCreated',created,'format',c.structure);
END $$;
REVOKE ALL ON FUNCTION public.cmim_hybrid_generate_round(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cmim_hybrid_generate_round(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION cmim_private.cmim_hybrid_entry_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE cid uuid;
BEGIN
 cid:=CASE WHEN TG_OP='INSERT' THEN NEW.competition_id ELSE OLD.competition_id END;
 IF EXISTS(SELECT 1 FROM public.cmim_competitions WHERE id=cid AND structure='liga_mata_mata')
 AND EXISTS(SELECT 1 FROM public.cmim_competition_matches WHERE competition_id=cid) THEN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Inscrições bloqueadas após o sorteio.'; END IF;
  IF (to_jsonb(NEW)-'group_tiebreak') IS DISTINCT FROM (to_jsonb(OLD)-'group_tiebreak') THEN RAISE EXCEPTION 'Inscrições bloqueadas após o sorteio.'; END IF;
  IF NOT public.cmim_is_admin() OR EXISTS(SELECT 1 FROM public.cmim_competition_matches WHERE competition_id=cid AND round_number>=4)
  OR (SELECT count(*) FROM public.cmim_competition_matches WHERE competition_id=cid AND round_number<=3 AND status='approved')<>24
  THEN RAISE EXCEPTION 'Desempate só pode ser editado pelo ADM após os grupos e antes das quartas.'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER cmim_hybrid_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cmim_competition_entries FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_hybrid_entry_guard();
DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.cmim_competition_generate_round(uuid)'::regprocedure) INTO d;
 IF position('if not found or c.status' in d)=0 THEN RAISE EXCEPTION 'Gerador incompatível'; END IF;
 d:=replace(d,'if not found or c.status','if c.structure=''liga_mata_mata'' then return public.cmim_hybrid_generate_round(p_competition);end if; if not found or c.status');
 EXECUTE d;
 SELECT pg_get_functiondef('public.cmim_competition_link_room(uuid,uuid)'::regprocedure) INTO d;
 IF position('c.series_games' in d)=0 THEN RAISE EXCEPTION 'Vínculo incompatível'; END IF;
 EXECUTE replace(d,'c.series_games','public.cmim_match_best_of(c.structure,c.series_games,m.round_number)');
 SELECT pg_get_functiondef('cmim_private.cmim_guard_competition_match()'::regprocedure) INTO d;
 IF position('SELECT c.series_games INTO best_of' in d)=0 THEN RAISE EXCEPTION 'Validação incompatível'; END IF;
 EXECUTE replace(d,'SELECT c.series_games INTO best_of','SELECT public.cmim_match_best_of(c.structure,c.series_games,NEW.round_number) INTO best_of');
 SELECT pg_get_functiondef('cmim_private.cmim_sync_match_agenda()'::regprocedure) INTO d;
 IF position('c.series_games' in d)=0 THEN RAISE EXCEPTION 'Agenda incompatível'; END IF;
 EXECUTE replace(d,'c.series_games','public.cmim_match_best_of(c.structure,c.series_games,NEW.round_number)');
END $patch$;
NOTIFY pgrst,'reload schema';
