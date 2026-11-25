
ALTER TABLE public.cmim_reschedule_requests DROP CONSTRAINT cmim_reschedule_requests_status_check;
ALTER TABLE public.cmim_reschedule_requests ADD CONSTRAINT cmim_reschedule_requests_status_check CHECK(status IN('pending','pending_admin','accepted','rejected','cancelled','stale'));
DROP INDEX public.cmim_reschedule_one_pending;
CREATE UNIQUE INDEX cmim_reschedule_one_pending ON public.cmim_reschedule_requests(match_id) WHERE status IN('pending','pending_admin');
DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.cmim_request_reschedule(uuid,timestamptz,text)'::regprocedure) INTO d;
 d:=replace(d,'status=''pending'' AND (old_time','status IN(''pending'',''pending_admin'') AND (old_time');
 EXECUTE d;
 SELECT pg_get_functiondef('public.cmim_answer_reschedule(uuid,text)'::regprocedure) INTO d;
 d:=replace(d,'ELSE UPDATE public.cmim_competition_matches SET scheduled_at=r.proposed_time','ELSIF EXISTS(SELECT 1 FROM public.cmim_competitions WHERE id=m.competition_id AND league_tier=''open'') THEN final_status:=''pending_admin''; ELSE UPDATE public.cmim_competition_matches SET scheduled_at=r.proposed_time');
 EXECUTE d;
END $patch$;
CREATE OR REPLACE FUNCTION public.cmim_confirm_reschedule(p_request uuid,p_accept boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.cmim_reschedule_requests%rowtype; m public.cmim_competition_matches%rowtype; result text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.cmim_is_admin() THEN RAISE EXCEPTION 'Somente ADM.'; END IF;
 SELECT * INTO r FROM public.cmim_reschedule_requests WHERE id=p_request;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação indisponível.'; END IF;
 SELECT * INTO m FROM public.cmim_competition_matches WHERE id=r.match_id FOR UPDATE;
 SELECT * INTO r FROM public.cmim_reschedule_requests WHERE id=p_request FOR UPDATE;
 IF r.status<>'pending_admin' THEN RAISE EXCEPTION 'Solicitação não aguarda ADM.'; END IF;
 result:='rejected';
 IF p_accept THEN
  IF m.status<>'scheduled' OR m.room_id IS NOT NULL OR m.scheduled_at IS DISTINCT FROM r.old_time OR r.proposed_time<=now() OR NOT EXISTS(SELECT 1 FROM public.cmim_competitions WHERE id=m.competition_id AND status IN('closed','live')) THEN result:='stale';
  ELSE UPDATE public.cmim_competition_matches SET scheduled_at=r.proposed_time,updated_at=now() WHERE id=m.id;result:='accepted';END IF;
 END IF;
 UPDATE public.cmim_reschedule_requests SET status=result,resolved_at=now() WHERE id=r.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cmim_confirm_reschedule(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cmim_confirm_reschedule(uuid,boolean) TO authenticated;
UPDATE public.cmim_competitions SET closes_at='2027-01-04 00:00:00-03'::timestamptz WHERE league_tier='open' AND title='CMIM Open' AND structure='liga_mata_mata' AND starts_at::date='2027-01-08' AND closes_at IS NULL;
NOTIFY pgrst,'reload schema';
