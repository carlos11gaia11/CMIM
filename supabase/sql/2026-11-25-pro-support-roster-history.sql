CREATE TABLE public.cmim_support_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.cmim_profiles(id) on delete cascade,
 category text not null check(category in ('Conta','Equipe','Campeonato','In-House','Recurso de punição','Outro')),
 subject text not null check(length(trim(subject)) between 4 and 120), message text not null check(length(trim(message)) between 10 and 3000),
 status text not null default 'open' check(status in ('open','in_review','resolved')),
 staff_reply text check(length(staff_reply)<=3000), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
ALTER TABLE public.cmim_support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cmim_support_requests FROM anon,authenticated;
GRANT SELECT,INSERT ON public.cmim_support_requests TO authenticated;
GRANT UPDATE(status,staff_reply,updated_at) ON public.cmim_support_requests TO authenticated;
CREATE POLICY cmim_support_read ON public.cmim_support_requests FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()) OR (SELECT public.cmim_is_admin()));
CREATE POLICY cmim_support_insert ON public.cmim_support_requests FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()) AND status='open' AND staff_reply IS NULL);
CREATE POLICY cmim_support_staff ON public.cmim_support_requests FOR UPDATE TO authenticated USING ((SELECT public.cmim_is_admin())) WITH CHECK ((SELECT public.cmim_is_admin()));
CREATE INDEX cmim_support_owner_idx ON public.cmim_support_requests(user_id,created_at DESC);
CREATE TRIGGER cmim_audit_support AFTER INSERT OR UPDATE ON public.cmim_support_requests FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_record_operation();
CREATE TABLE public.cmim_sanctions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.cmim_profiles(id) on delete cascade,
 title text not null check(length(trim(title)) between 4 and 120), reason text not null check(length(trim(reason)) between 10 and 2000),
 status text not null default 'active' check(status in ('active','revoked','closed')), created_by uuid not null default auth.uid(), created_at timestamptz not null default now()
);
ALTER TABLE public.cmim_sanctions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cmim_sanctions FROM anon,authenticated;
GRANT SELECT,INSERT ON public.cmim_sanctions TO authenticated;
GRANT UPDATE(status) ON public.cmim_sanctions TO authenticated;
CREATE POLICY cmim_sanctions_read ON public.cmim_sanctions FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()) OR (SELECT public.cmim_is_admin()));
CREATE POLICY cmim_sanctions_create ON public.cmim_sanctions FOR INSERT TO authenticated WITH CHECK ((SELECT public.cmim_is_admin()) AND created_by=(SELECT auth.uid()));
CREATE POLICY cmim_sanctions_staff ON public.cmim_sanctions FOR UPDATE TO authenticated USING ((SELECT public.cmim_is_admin())) WITH CHECK ((SELECT public.cmim_is_admin()));
CREATE INDEX cmim_sanctions_owner_idx ON public.cmim_sanctions(user_id,created_at DESC);
CREATE TRIGGER cmim_audit_sanction AFTER INSERT OR UPDATE ON public.cmim_sanctions FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_record_operation();
CREATE TABLE public.cmim_competition_roster_snapshots (
 entry_id uuid primary key references public.cmim_competition_entries(id) on delete cascade,
 captured_at timestamptz not null default now(), roster jsonb not null
);
ALTER TABLE public.cmim_competition_roster_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cmim_competition_roster_snapshots FROM anon,authenticated;
GRANT SELECT ON public.cmim_competition_roster_snapshots TO anon,authenticated;
CREATE POLICY cmim_snapshot_read ON public.cmim_competition_roster_snapshots FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.cmim_competition_entries e WHERE e.id=entry_id AND e.status='approved'));
CREATE OR REPLACE FUNCTION cmim_private.cmim_capture_roster() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='approved' THEN
 INSERT INTO public.cmim_competition_roster_snapshots(entry_id,roster)
 SELECT NEW.id,coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'nick',p.nick,'tag',p.tag,'lane',m.lane,'starter',m.starter,'avatar_url',p.avatar_url,'captain',m.user_id=s.owner_id) ORDER BY m.starter DESC,m.lane),'[]'::jsonb)
 FROM public.cmim_squad_members m JOIN public.cmim_profiles p ON p.id=m.user_id JOIN public.cmim_squads s ON s.id=m.team_id WHERE m.team_id=NEW.team_id
 ON CONFLICT(entry_id) DO NOTHING;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION cmim_private.cmim_capture_roster() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cmim_capture_approved_roster AFTER INSERT OR UPDATE OF status ON public.cmim_competition_entries FOR EACH ROW EXECUTE FUNCTION cmim_private.cmim_capture_roster();
NOTIFY pgrst,'reload schema';