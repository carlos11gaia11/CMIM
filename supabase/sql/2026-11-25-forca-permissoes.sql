REVOKE ALL ON public.cmim_riot_rank_snapshots FROM anon,authenticated;
GRANT SELECT ON public.cmim_riot_rank_snapshots TO anon,authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.cmim_reschedule_requests FROM anon,authenticated;
NOTIFY pgrst,'reload schema';