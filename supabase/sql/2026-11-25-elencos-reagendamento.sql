
ALTER TABLE public.cmim_squad_members ADD COLUMN IF NOT EXISTS starter boolean NOT NULL DEFAULT true;
ALTER TABLE public.cmim_squad_members DROP CONSTRAINT cmim_squad_members_team_id_lane_key;
CREATE UNIQUE INDEX cmim_one_starter_per_lane ON public.cmim_squad_members(team_id,lane) WHERE starter;
CREATE OR REPLACE FUNCTION public.cmim_set_starter(p_team uuid,p_player uuid,p_starter boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE l text;
BEGIN
 PERFORM 1 FROM public.cmim_squads WHERE id=p_team AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Somente o capitão.'; END IF;
 IF EXISTS(SELECT 1 FROM public.cmim_competition_matches WHERE p_team IN(team_a_id,team_b_id) AND room_id IS NOT NULL AND status<>'approved') THEN RAISE EXCEPTION 'Finalize a seleção em andamento antes de alterar titulares.'; END IF;
 SELECT lane INTO l FROM public.cmim_squad_members WHERE team_id=p_team AND user_id=p_player;
 IF NOT FOUND THEN RAISE EXCEPTION 'Jogador não pertence ao time.'; END IF;
 IF p_starter THEN UPDATE public.cmim_squad_members SET starter=false WHERE team_id=p_team AND lane=l AND starter AND user_id<>p_player; END IF;
 UPDATE public.cmim_squad_members SET starter=p_starter WHERE team_id=p_team AND user_id=p_player;
END $$;
REVOKE ALL ON FUNCTION public.cmim_set_starter(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cmim_set_starter(uuid,uuid,boolean) TO authenticated;

CREATE POLICY cmim_teamlogo_owner_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='cmim-team-logos' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE OR REPLACE FUNCTION cmim_private.cmim_require_team_images() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.logo_url IS DISTINCT FROM OLD.logo_url THEN
  IF NEW.logo_url IS NULL OR NEW.logo_url NOT LIKE 'https://klpvidxhzofbwstvvxib.supabase.co/storage/v1/object/public/cmim-team-logos/'||NEW.owner_id::text||'/%' OR NOT EXISTS(
   SELECT 1 FROM storage.objects o WHERE o.bucket_id='cmim-team-logos' AND o.name=split_part(split_part(NEW.logo_url,'/cmim-team-logos/',2),'?',1)
  ) THEN RAISE EXCEPTION 'Envie a logo do time.'; END IF;
 END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM public.cmim_profiles WHERE id=NEW.owner_id AND nullif(trim(avatar_url),'') IS NOT NULL) THEN RAISE EXCEPTION 'Envie sua foto de jogador antes de criar o time.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cmim_require_team_images BEFORE INSERT OR UPDATE OF logo_url ON public.cmim_squads FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_require_team_images();

DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.cmim_invite_player(uuid,uuid,text)'::regprocedure) INTO d;
 d:=replace(d,'>=5','>=10');
 d:=replace(d,'if exists(select 1 from public.cmim_squad_members where team_id=p_team and lane=p_lane) then raise exception ''Lane ocupada'';end if;','');
 EXECUTE d;
 SELECT pg_get_functiondef('public.cmim_answer_invite(uuid,boolean)'::regprocedure) INTO d;
 d:=replace(d,'>=5','>=10');
 d:=replace(d,'insert into public.cmim_squad_members(team_id,user_id,lane) values(i.team_id,auth.uid(),i.lane);',
 'if not exists(select 1 from public.cmim_profiles where id=auth.uid() and nullif(trim(avatar_url),'''') is not null) then raise exception ''Envie sua foto antes de aceitar o convite.'';end if;
 insert into public.cmim_squad_members(team_id,user_id,lane,starter) values(i.team_id,auth.uid(),i.lane,not exists(select 1 from public.cmim_squad_members where team_id=i.team_id and lane=i.lane and starter));');
 EXECUTE d;
 SELECT pg_get_functiondef('public.cmim_register_competition(uuid,uuid)'::regprocedure) INTO d;
 d:=replace(d,'where team_id=p_team)<>5','where team_id=p_team and starter)<>5');
 d:=replace(d,'if (select count(*) from public.cmim_competition_entries','if not exists(select 1 from public.cmim_squads where id=p_team and nullif(trim(logo_url),'''') is not null) or exists(select 1 from public.cmim_squad_members m join public.cmim_profiles p on p.id=m.user_id where m.team_id=p_team and nullif(trim(p.avatar_url),'''') is null) then raise exception ''Logo e fotos obrigatórias.'';end if;
 if (select count(*) from public.cmim_competition_entries');
 EXECUTE d;
 SELECT pg_get_functiondef('public.cmim_competition_link_room(uuid,uuid)'::regprocedure) INTO d;
 d:=replace(d,'where x.team_id=squad','where x.team_id=squad and x.starter');
 d:=replace(d,'where team_id=squad)<>5','where team_id=squad and starter)<>5');
 EXECUTE d;
END $patch$;

CREATE TABLE public.cmim_reschedule_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),match_id uuid NOT NULL REFERENCES public.cmim_competition_matches(id) ON DELETE CASCADE,
 requester_team_id uuid NOT NULL REFERENCES public.cmim_squads(id), recipient_team_id uuid NOT NULL REFERENCES public.cmim_squads(id),
 old_time timestamptz, proposed_time timestamptz NOT NULL, reason text NOT NULL DEFAULT '' CHECK(length(reason)<=500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected','cancelled','stale')),
 created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 CHECK(requester_team_id<>recipient_team_id));
CREATE UNIQUE INDEX cmim_reschedule_one_pending ON public.cmim_reschedule_requests(match_id) WHERE status='pending';
ALTER TABLE public.cmim_reschedule_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cmim_reschedule_requests TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.cmim_reschedule_requests FROM anon,authenticated;
CREATE POLICY cmim_reschedule_read ON public.cmim_reschedule_requests FOR SELECT TO authenticated USING(
 public.cmim_is_admin() OR EXISTS(SELECT 1 FROM public.cmim_squads s WHERE s.id IN(requester_team_id,recipient_team_id) AND s.owner_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.cmim_request_reschedule(p_match uuid,p_time timestamptz,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE m public.cmim_competition_matches%rowtype; own_id uuid; other_id uuid; result uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.'; END IF;
 SELECT * INTO m FROM public.cmim_competition_matches WHERE id=p_match FOR UPDATE;
 IF NOT FOUND OR m.status<>'scheduled' OR m.room_id IS NOT NULL OR m.team_b_id IS NULL THEN RAISE EXCEPTION 'Confronto indisponível para reagendamento.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cmim_competitions WHERE id=m.competition_id AND status IN('closed','live')) THEN RAISE EXCEPTION 'Competição indisponível.'; END IF;
 SELECT id INTO own_id FROM public.cmim_squads WHERE id IN(m.team_a_id,m.team_b_id) AND owner_id=auth.uid();
 IF own_id IS NULL THEN RAISE EXCEPTION 'Somente um dos capitães pode solicitar.'; END IF;
 IF p_time IS NULL OR p_time<=now() OR p_time IS NOT DISTINCT FROM m.scheduled_at THEN RAISE EXCEPTION 'Informe nova data futura.'; END IF;
 other_id:=CASE WHEN own_id=m.team_a_id THEN m.team_b_id ELSE m.team_a_id END;
 UPDATE public.cmim_reschedule_requests SET status='stale',resolved_at=now() WHERE match_id=m.id AND status='pending' AND (old_time IS DISTINCT FROM m.scheduled_at OR proposed_time<=now());
 INSERT INTO public.cmim_reschedule_requests(match_id,requester_team_id,recipient_team_id,old_time,proposed_time,reason) VALUES(m.id,own_id,other_id,m.scheduled_at,p_time,left(coalesce(p_reason,''),500)) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.cmim_answer_reschedule(p_request uuid,p_action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.cmim_reschedule_requests%rowtype; m public.cmim_competition_matches%rowtype; own_id uuid; final_status text;
BEGIN
 IF auth.uid() IS NULL OR p_action NOT IN('accepted','rejected','cancelled') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
 SELECT * INTO r FROM public.cmim_reschedule_requests WHERE id=p_request;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação indisponível.'; END IF;
 SELECT * INTO m FROM public.cmim_competition_matches WHERE id=r.match_id FOR UPDATE;
 SELECT * INTO r FROM public.cmim_reschedule_requests WHERE id=p_request FOR UPDATE;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'Solicitação já respondida.'; END IF;
 own_id:=CASE WHEN p_action='cancelled' THEN r.requester_team_id ELSE r.recipient_team_id END;
 IF NOT EXISTS(SELECT 1 FROM public.cmim_squads WHERE id=own_id AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Somente o capitão autorizado pode responder.'; END IF;
 final_status:=p_action;
 IF p_action='accepted' THEN
  IF m.status<>'scheduled' OR m.room_id IS NOT NULL OR m.scheduled_at IS DISTINCT FROM r.old_time OR r.proposed_time<=now() OR NOT EXISTS(SELECT 1 FROM public.cmim_competitions WHERE id=m.competition_id AND status IN('closed','live')) THEN final_status:='stale';
  ELSE UPDATE public.cmim_competition_matches SET scheduled_at=r.proposed_time,updated_at=now() WHERE id=m.id; END IF;
 END IF;
 UPDATE public.cmim_reschedule_requests SET status=final_status,resolved_at=now() WHERE id=r.id;
 RETURN final_status;
END $$;
REVOKE ALL ON FUNCTION public.cmim_request_reschedule(uuid,timestamptz,text),public.cmim_answer_reschedule(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cmim_request_reschedule(uuid,timestamptz,text),public.cmim_answer_reschedule(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
