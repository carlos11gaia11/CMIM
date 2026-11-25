CREATE OR REPLACE FUNCTION public.cmim_public_players_page(p_search text DEFAULT '',p_lane text DEFAULT '',p_offset integer DEFAULT 0,p_limit integer DEFAULT 24)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH filtered AS (
 SELECT p.id,p.nick,p.tag,p.avatar_url,coalesce(m.lane,p.lane) AS lane,s.id AS team_id,s.name AS team_name
 FROM public.cmim_profiles p LEFT JOIN public.cmim_squad_members m ON m.user_id=p.id LEFT JOIN public.cmim_squads s ON s.id=m.team_id
 WHERE (coalesce(p_lane,'')='' OR coalesce(m.lane,p.lane)=p_lane)
 AND (coalesce(trim(p_search),'')='' OR strpos(lower(coalesce(p.nick,'')||'#'||coalesce(p.tag,'')||' '||coalesce(s.name,'')),lower(left(trim(p_search),120)))>0)
 ), paged AS (
 SELECT * FROM filtered ORDER BY lower(nick),id OFFSET greatest(0,coalesce(p_offset,0)) LIMIT least(60,greatest(1,coalesce(p_limit,24)))
 )
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'items',coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY lower(nick),id) FROM paged),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.cmim_public_players_page(text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cmim_public_players_page(text,text,integer,integer) TO anon,authenticated;
NOTIFY pgrst,'reload schema';