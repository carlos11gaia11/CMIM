CREATE TABLE IF NOT EXISTS public.cmim_operations_audit (
 id bigint generated always as identity primary key,
 actor_id uuid, entity text not null, action text not null, entity_key text,
 details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
ALTER TABLE public.cmim_operations_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cmim_operations_audit FROM anon,authenticated;
GRANT SELECT ON public.cmim_operations_audit TO authenticated;
CREATE POLICY cmim_operations_audit_admin ON public.cmim_operations_audit FOR SELECT TO authenticated USING ((SELECT public.cmim_is_admin()));
CREATE OR REPLACE FUNCTION cmim_private.cmim_record_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_row jsonb; after_row jsonb; item jsonb; key_value text;
BEGIN
 before_row:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 after_row:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 IF before_row=after_row THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 item:=CASE WHEN TG_OP='DELETE' THEN before_row ELSE after_row END;
 key_value:=coalesce(item->>'id',item->>'entry_id',item->>'room_id',item->>'team_id');
 INSERT INTO public.cmim_operations_audit(actor_id,entity,action,entity_key,details)
 VALUES(auth.uid(),TG_TABLE_NAME,TG_OP,key_value,jsonb_strip_nulls(jsonb_build_object('old_status',coalesce(before_row->>'status',before_row->>'review_status',before_row->>'review_state'),'new_status',coalesce(after_row->>'status',after_row->>'review_status',after_row->>'review_state'),'team_id',item->>'team_id','player_id',item->>'user_id','old_owner',before_row->>'owner_id','new_owner',after_row->>'owner_id','game',item->>'game')));
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION cmim_private.cmim_record_operation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cmim_audit_entry AFTER INSERT OR UPDATE ON public.cmim_competition_entries FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_record_operation();
CREATE TRIGGER cmim_audit_review AFTER INSERT OR UPDATE ON public.cmim_entry_reviews FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_record_operation();
CREATE TRIGGER cmim_audit_match AFTER INSERT OR UPDATE ON public.cmim_competition_matches FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_record_operation();
CREATE TRIGGER cmim_audit_report AFTER INSERT OR UPDATE ON public.cmim_draft_game_reports FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_record_operation();
CREATE TRIGGER cmim_audit_roster AFTER INSERT OR UPDATE OR DELETE ON public.cmim_squad_members FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_record_operation();
CREATE TRIGGER cmim_audit_captain AFTER UPDATE OF owner_id ON public.cmim_squads FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_record_operation();
CREATE OR REPLACE FUNCTION cmim_private.cmim_roster_action(p_team uuid,p_player uuid,p_action text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); owner uuid; lane_value text;
BEGIN
 IF actor IS NULL OR p_action IS NULL OR p_action NOT IN ('leave','remove','captain') OR p_player IS NULL OR p_team IS NULL THEN RAISE EXCEPTION 'Operação inválida.'; END IF;
 SELECT owner_id INTO owner FROM public.cmim_squads WHERE id=p_team FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Equipe não encontrada.'; END IF;
 IF p_action='leave' THEN
   IF actor<>p_player OR actor=owner THEN RAISE EXCEPTION 'O capitão deve transferir a capitania antes de sair.'; END IF;
 ELSE
   IF actor<>owner OR p_player=owner THEN RAISE EXCEPTION 'Operação exclusiva do capitão sobre outro integrante.'; END IF;
 END IF;
 SELECT lane INTO lane_value FROM public.cmim_squad_members WHERE team_id=p_team AND user_id=p_player FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Jogador não pertence ao elenco.'; END IF;
 IF EXISTS(SELECT 1 FROM public.cmim_competition_entries e JOIN public.cmim_competitions c ON c.id=e.competition_id WHERE e.team_id=p_team AND e.status='approved' AND c.lock_roster_at_close AND c.closes_at<=now() AND c.status IN ('open','closed','live')) THEN RAISE EXCEPTION 'Elenco bloqueado após o prazo de inscrição. Fale com a organização.'; END IF;
 IF EXISTS(SELECT 1 FROM public.cmim_competition_matches WHERE p_team IN(team_a_id,team_b_id) AND room_id IS NOT NULL AND status<>'approved') THEN RAISE EXCEPTION 'Finalize a seleção antes de alterar o elenco.'; END IF;
 IF p_action='captain' THEN UPDATE public.cmim_squads SET owner_id=p_player,captain_lane=lane_value WHERE id=p_team;
 ELSE DELETE FROM public.cmim_squad_members WHERE team_id=p_team AND user_id=p_player; END IF;
 RETURN p_action;
END $$;
REVOKE ALL ON FUNCTION cmim_private.cmim_roster_action(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA cmim_private TO authenticated;
GRANT EXECUTE ON FUNCTION cmim_private.cmim_roster_action(uuid,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.cmim_roster_action(p_team uuid,p_player uuid,p_action text) RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT cmim_private.cmim_roster_action(p_team,p_player,p_action) $$;
REVOKE ALL ON FUNCTION public.cmim_roster_action(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cmim_roster_action(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';