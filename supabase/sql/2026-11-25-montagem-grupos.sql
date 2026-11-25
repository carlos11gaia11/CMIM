
ALTER TABLE public.cmim_competitions ADD COLUMN IF NOT EXISTS group_team_order uuid[];
ALTER TABLE public.cmim_competitions ADD CONSTRAINT cmim_group_team_order_ck CHECK (group_team_order IS NULL OR (structure='liga_mata_mata' AND cardinality(group_team_order)=16 AND array_ndims(group_team_order)=1 AND array_lower(group_team_order,1)=1));
CREATE OR REPLACE FUNCTION cmim_private.cmim_group_order_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.group_team_order IS NOT DISTINCT FROM OLD.group_team_order THEN RETURN NEW; END IF;
 END IF;
 IF NOT public.cmim_is_admin() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Somente o ADM pode montar grupos.'; END IF;
 IF EXISTS(SELECT 1 FROM public.cmim_competition_matches WHERE competition_id=NEW.id) THEN RAISE EXCEPTION 'Grupos bloqueados após gerar a primeira rodada.'; END IF;
 IF NEW.group_team_order IS NOT NULL THEN
  IF (SELECT count(x) FROM unnest(NEW.group_team_order) x)<>(SELECT count(DISTINCT x) FROM unnest(NEW.group_team_order) x) THEN RAISE EXCEPTION 'Uma equipe não pode ocupar duas vagas.'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(NEW.group_team_order) x WHERE x IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cmim_competition_entries e WHERE e.competition_id=NEW.id AND e.team_id=x AND e.status='approved')) THEN RAISE EXCEPTION 'Selecione apenas equipes aprovadas.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cmim_group_order_guard BEFORE INSERT OR UPDATE OF group_team_order ON public.cmim_competitions FOR EACH ROW WHEN (NEW.group_team_order IS NOT NULL) EXECUTE FUNCTION cmim_private.cmim_group_order_guard();
CREATE TRIGGER cmim_group_order_clear_guard BEFORE UPDATE OF group_team_order ON public.cmim_competitions FOR EACH ROW WHEN (OLD.group_team_order IS NOT NULL AND NEW.group_team_order IS NULL) EXECUTE FUNCTION cmim_private.cmim_group_order_guard();
DO $patch$
DECLARE d text; old_text text:='IF rnd=1 THEN SELECT array_agg(team_id ORDER BY random()) INTO ids FROM public.cmim_competition_entries WHERE competition_id=c.id AND status=''approved'';';
BEGIN
 SELECT pg_get_functiondef('public.cmim_hybrid_generate_round(uuid)'::regprocedure) INTO d;
 IF strpos(d,old_text)=0 THEN RAISE EXCEPTION 'Gerador incompatível'; END IF;
 d:=replace(d,old_text,$new$IF rnd=1 THEN
   ids:=c.group_team_order;
   IF ids IS NULL OR cardinality(ids)<>16 OR array_position(ids,NULL::uuid) IS NOT NULL
      OR (SELECT count(DISTINCT x) FROM unnest(ids) x)<>16
      OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.cmim_competition_entries e WHERE e.competition_id=c.id AND e.team_id=x AND e.status='approved'))
   THEN RAISE EXCEPTION 'Monte ou sorteie e salve os quatro grupos completos antes da primeira rodada.'; END IF;$new$);
 EXECUTE d;
END $patch$;
NOTIFY pgrst,'reload schema';
