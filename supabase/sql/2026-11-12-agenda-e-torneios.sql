-- CMIM / Agenda e Torneios — 12/11/2026
-- Banco: Supabase cmim. Aplicado ao ambiente real em 12/11/2026.
-- GitHub Pages usa /agenda.html; partidas oficiais ficam sincronizadas via triggers.
-- Script repetível para reinstalação/revisão (depende do esquema CMIM de competições).

BEGIN;
ALTER TABLE public.cmim_portal_events
 ADD COLUMN IF NOT EXISTS match_id uuid UNIQUE REFERENCES public.cmim_competition_matches(id) ON DELETE CASCADE,
 ADD COLUMN IF NOT EXISTS ends_at timestamptz,
 ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.cmim_portal_events ALTER COLUMN starts_at DROP NOT NULL;

ALTER TABLE public.cmim_portal_events DROP CONSTRAINT IF EXISTS cmim_portal_events_type_check;
ALTER TABLE public.cmim_portal_events DROP CONSTRAINT IF EXISTS cmim_portal_events_match_date_check;
ALTER TABLE public.cmim_portal_events DROP CONSTRAINT IF EXISTS cmim_portal_events_end_check;
ALTER TABLE public.cmim_portal_events DROP CONSTRAINT IF EXISTS cmim_portal_events_location_check;
ALTER TABLE public.cmim_portal_events
 ADD CONSTRAINT cmim_portal_events_type_check CHECK (length(btrim(type)) BETWEEN 2 AND 45),
 ADD CONSTRAINT cmim_portal_events_match_date_check CHECK (match_id IS NOT NULL OR starts_at IS NOT NULL),
 ADD CONSTRAINT cmim_portal_events_end_check CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at>starts_at)),
 ADD CONSTRAINT cmim_portal_events_location_check CHECK (length(location)<=180);
CREATE INDEX IF NOT EXISTS cmim_portal_events_starts_at_idx ON public.cmim_portal_events(starts_at);

DROP POLICY IF EXISTS cmim_events_read ON public.cmim_portal_events;
CREATE POLICY cmim_events_read ON public.cmim_portal_events
 FOR SELECT TO anon,authenticated
 USING (match_id IS NULL OR public.cmim_is_admin() OR EXISTS(
   SELECT 1 FROM public.cmim_competition_matches m
   JOIN public.cmim_competitions c ON c.id=m.competition_id
   WHERE m.id=match_id AND c.status<>'draft'));

CREATE OR REPLACE FUNCTION cmim_private.cmim_initial_match_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.team_b_id IS NOT NULL AND NEW.round_number=1 AND NEW.scheduled_at IS NULL THEN
   SELECT starts_at INTO NEW.scheduled_at
   FROM public.cmim_competitions WHERE id=NEW.competition_id;
 END IF;
 RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION cmim_private.cmim_sync_match_agenda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c public.cmim_competitions%rowtype; a_name text; b_name text;
BEGIN
  IF NEW.team_b_id IS NULL THEN
    DELETE FROM public.cmim_portal_events WHERE match_id=NEW.id;
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM public.cmim_competitions WHERE id=NEW.competition_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT name INTO a_name FROM public.cmim_squads WHERE id=NEW.team_a_id;
  SELECT name INTO b_name FROM public.cmim_squads WHERE id=NEW.team_b_id;
  INSERT INTO public.cmim_portal_events
    (match_id,title,type,starts_at,description,status,updated_at)
  VALUES
    (NEW.id,
     LEFT(COALESCE(a_name,'A definir')||' x '||COALESCE(b_name,'A definir'),140),
     'MD'||c.series_games,
     NEW.scheduled_at,
     LEFT(c.title||' · Rodada '||NEW.round_number||', jogo '||NEW.match_number,1500),
     CASE WHEN NEW.status='approved' THEN 'completed'
          WHEN NEW.status='live' THEN 'open'
          ELSE 'scheduled' END,
     now())
  ON CONFLICT (match_id) DO UPDATE SET
    title=EXCLUDED.title,type=EXCLUDED.type,starts_at=EXCLUDED.starts_at,
    description=EXCLUDED.description,status=EXCLUDED.status,updated_at=now();
  RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION cmim_private.cmim_guard_competition_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE best_of int; needed int;
BEGIN
 IF OLD.status='approved' AND NEW IS DISTINCT FROM OLD THEN
   IF NOT public.cmim_is_admin()
      OR (to_jsonb(NEW)-'scheduled_at'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'scheduled_at'-'updated_at') THEN
      RAISE EXCEPTION 'Confronto homologado: só o dia e o horário podem ser corrigidos pelo ADM.';
   END IF;
 END IF;
 IF NEW.status='approved' AND OLD.status<>'approved' THEN
   IF NEW.team_b_id IS NULL THEN RAISE EXCEPTION 'Folga só pode ser gerada pelo sistema do campeonato.'; END IF;
   SELECT c.series_games INTO best_of FROM public.cmim_competitions c WHERE c.id=NEW.competition_id;
   needed:=(best_of+1)/2;
   IF GREATEST(NEW.score_a,NEW.score_b)<>needed
      OR LEAST(NEW.score_a,NEW.score_b)>=needed
      OR NEW.winner_id IS DISTINCT FROM
         (CASE WHEN NEW.score_a>NEW.score_b THEN NEW.team_a_id ELSE NEW.team_b_id END) THEN
     RAISE EXCEPTION 'Placar da MD% inválido ou vencedor divergente.',best_of;
   END IF;
   IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
     RAISE EXCEPTION 'É obrigatório registrar o ADM responsável pela homologação.';
   END IF;
   IF NEW.room_id IS NULL AND length(trim(coalesce(NEW.manual_result_reason,'')))<8 THEN
     RAISE EXCEPTION 'Resultados fora da seleção exigem justificativa de pelo menos 8 caracteres.';
   END IF;
   IF NEW.room_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM public.cmim_pilot_rank_sync s WHERE s.room_id=NEW.room_id
   ) THEN
     RAISE EXCEPTION 'A sala precisa estar homologada no Ranking antes do confronto.';
   END IF;
 END IF;
 RETURN NEW;
END $function$


DROP TRIGGER IF EXISTS cmim_initial_match_schedule ON public.cmim_competition_matches;
CREATE TRIGGER cmim_initial_match_schedule BEFORE INSERT ON public.cmim_competition_matches
 FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_initial_match_schedule();
DROP TRIGGER IF EXISTS cmim_sync_match_agenda ON public.cmim_competition_matches;
CREATE TRIGGER cmim_sync_match_agenda
 AFTER INSERT OR UPDATE OF scheduled_at,status,team_a_id,team_b_id,competition_id,round_number,match_number
 ON public.cmim_competition_matches
 FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_sync_match_agenda();

INSERT INTO public.cmim_portal_events(match_id,title,type,starts_at,description,status)
SELECT m.id,LEFT(COALESCE(a.name,'A definir')||' x '||COALESCE(b.name,'A definir'),140),
 'MD'||c.series_games,m.scheduled_at,
 LEFT(c.title||' · Rodada '||m.round_number||', jogo '||m.match_number,1500),
 CASE WHEN m.status='approved' THEN 'completed' WHEN m.status='live' THEN 'open' ELSE 'scheduled' END
FROM public.cmim_competition_matches m
JOIN public.cmim_competitions c ON c.id=m.competition_id
LEFT JOIN public.cmim_squads a ON a.id=m.team_a_id
LEFT JOIN public.cmim_squads b ON b.id=m.team_b_id
WHERE m.team_b_id IS NOT NULL
ON CONFLICT(match_id) DO NOTHING;

COMMENT ON COLUMN public.cmim_portal_events.match_id IS
 'Partidas oficiais são sincronizadas automaticamente; editar cmim_competition_matches.scheduled_at para remarcar.';
COMMIT;
