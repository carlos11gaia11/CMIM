-- CMIM | Evolution: soundtrack, captain tags, game reviews, divisions
-- This script is a REFERENCE of the deployed schema. Safe to review before use.
-- New seasons store division; historical seasons without this field display Misto.
-- Only pending games can be corrected; edits leave an audit trail.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('cmim-soundtrack','cmim-soundtrack',true,12582912,array['audio/mpeg','audio/mp3'])
 on conflict(id) do update set public=true,file_size_limit=12582912,allowed_mime_types=array['audio/mpeg','audio/mp3'];
drop policy if exists cmim_soundtrack_public_read on storage.objects;
create policy cmim_soundtrack_public_read on storage.objects for select to anon,authenticated
 using(bucket_id='cmim-soundtrack');
drop policy if exists cmim_soundtrack_admin_upload on storage.objects;
create policy cmim_soundtrack_admin_upload on storage.objects for insert to authenticated
 with check(bucket_id='cmim-soundtrack' and name='worlds-2026.mp3' and (select public.cmim_is_admin()));
drop policy if exists cmim_soundtrack_admin_update on storage.objects;
create policy cmim_soundtrack_admin_update on storage.objects for update to authenticated
 using(bucket_id='cmim-soundtrack' and name='worlds-2026.mp3' and (select public.cmim_is_admin()))
 with check(bucket_id='cmim-soundtrack' and name='worlds-2026.mp3' and (select public.cmim_is_admin()));

alter table public.cmim_player_meta add column if not exists player_tags text[] not null default '{}';
grant select on public.cmim_player_meta to anon,authenticated;
grant update(player_tags) on public.cmim_player_meta to authenticated;

create table if not exists public.cmim_draft_game_edits (
 id bigint generated always as identity primary key,
 room_id uuid not null,game integer not null,
 edited_by uuid not null references auth.users(id),edited_at timestamptz not null default now(),
 previous_winner_side text not null,new_winner_side text not null,
 previous_picks jsonb not null,new_picks jsonb not null);
alter table public.cmim_draft_game_edits enable row level security;
grant select,insert on public.cmim_draft_game_edits to authenticated;
grant usage,select on sequence public.cmim_draft_game_edits_id_seq to authenticated;
drop policy if exists cmim_draft_edit_admin_read on public.cmim_draft_game_edits;
create policy cmim_draft_edit_admin_read on public.cmim_draft_game_edits for select to authenticated
 using ((select public.cmim_is_admin()));
drop policy if exists cmim_draft_edit_admin_insert on public.cmim_draft_game_edits;
create policy cmim_draft_edit_admin_insert on public.cmim_draft_game_edits for insert to authenticated
 with check((select public.cmim_is_admin()) and edited_by=(select auth.uid()));
grant update(winner_side,winner_team,picks,report_txt) on public.cmim_draft_game_reports to authenticated;

CREATE OR REPLACE FUNCTION public.cmim_apply(action text, args jsonb, expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb; ver bigint; sea jsonb; sid text; pid text; roster jsonb; delta jsonb:='[]'; d jsonb; totals jsonb; ids text[]; teams jsonb; x text; k text; n text; nk text; idx int; j int; a int; b int; v numeric; old numeric;
 keys text[]:=array['games','wins','losses','md3','mvp','bagre','first','second','third','fourth','penalties','adjustment'];
 stamp text:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'cmim_admin'='true') then raise exception 'Acesso exclusivo do administrador.'; end if;
 select data,version into s,ver from public.cmim_rank where id=1 for update;
 if ver<>expected_version then raise exception 'Ranking atualizado em outro acesso. Recarregue e tente novamente.'; end if;
 if action='season_create' then
 n:=trim(args->>'name');
 if n is null or length(n)<2 or length(n)>70 then raise exception 'Nome deve ter 2 a 70 caracteres.'; end if;
 if exists(select 1 from jsonb_array_elements(s->'seasons') q where q->>'status'='active') then raise exception 'Finalize a temporada ativa primeiro.'; end if;
 if length(coalesce(args->>'logo',''))>700000 then raise exception 'Logo muito grande.'; end if;
 s:=jsonb_set(s,'{seasons}',s->'seasons'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'name',n,'logo',coalesce(args->>'logo',''),'division',case when args->>'division' in ('insalubrao','insalubrinho','misto') then args->>'division' else 'misto' end,'status','active','roster','[]'::jsonb,'createdAt',stamp)));
 else
 sid:=args->>'seasonId';
 select value,ordinality::int-1 into sea,idx from jsonb_array_elements(s->'seasons') with ordinality where value->>'id'=sid;
 if sea is null then raise exception 'Temporada não encontrada.'; end if;
 if action in ('season_delete','player_delete') then
  if action='season_delete' then
   if args->>'confirmName' is distinct from sea->>'name' then raise exception 'Digite o nome exato da temporada para excluir.'; end if;
   s:=jsonb_set(s,'{seasons}',coalesce((select jsonb_agg(q order by ord) from jsonb_array_elements(s->'seasons') with ordinality t(q,ord) where q->>'id'<>sid),'[]'::jsonb));
   s:=jsonb_set(s,'{events}',coalesce((select jsonb_agg(q order by ord) from jsonb_array_elements(s->'events') with ordinality t(q,ord) where q->>'seasonId'<>sid),'[]'::jsonb));
  else
   pid:=args->>'playerId';
   select q->>'nick' into n from jsonb_array_elements(s->'players') q where q->>'id'=pid;
   if pid is null or not ((sea->'roster') ? pid) then raise exception 'Player fora da temporada.'; end if;
   if args->>'confirmName' is distinct from n then raise exception 'Digite o nick exato para excluir.'; end if;
   sea:=jsonb_set(sea,'{roster}',(sea->'roster')-pid);
   sea:=jsonb_set(sea,'{joinedAt}',coalesce(sea->'joinedAt','{}'::jsonb)-pid);
   s:=jsonb_set(s,array['seasons',idx::text],sea);
   -- Remove somente os lançamentos deste player nesta temporada.
   s:=jsonb_set(s,'{events}',coalesce((select jsonb_agg(
    case when q->>'seasonId'=sid then jsonb_set(q,'{deltas}',coalesce((select jsonb_agg(z order by zo) from jsonb_array_elements(q->'deltas') with ordinality dt(z,zo) where z->>'playerId'<>pid),'[]'::jsonb)) else q end
    order by ord) from jsonb_array_elements(s->'events') with ordinality t(q,ord)),'[]'::jsonb));
   s:=jsonb_set(s,'{events}',coalesce((select jsonb_agg(q order by ord) from jsonb_array_elements(s->'events') with ordinality t(q,ord) where jsonb_array_length(q->'deltas')>0),'[]'::jsonb));
  end if;
  update public.cmim_rank set data=s,version=ver+1 where id=1;
  return jsonb_build_object('data',s,'version',ver+1);
 end if;
 if sea->>'status'<>'active' then raise exception 'Selecione uma temporada ativa.'; end if;
 roster:=sea->'roster';
 if action='season_close' then sea:=sea||jsonb_build_object('status','closed','closedAt',stamp);
 elsif action='season_logo' then
 if length(coalesce(args->>'logo',''))>700000 then raise exception 'Logo muito grande.'; end if;
 sea:=sea||jsonb_build_object('logo',coalesce(args->>'logo',''));
 elsif action='player_add' then
 pid:=args->>'playerId';
 if pid is null or pid='' then
 n:=trim(args->>'nick'); nk:=public.cmim_key(n);
 if n is null or length(n)<2 or length(n)>32 or length(nk)<2 then raise exception 'Nick inválido: use 2 a 32 caracteres.'; end if;
 if exists(select 1 from jsonb_array_elements(s->'players') q where q->>'key'=nk) then raise exception 'Nick já cadastrado. Selecione o player existente.'; end if;
 if exists(select 1 from jsonb_array_elements(s->'players') q where public.cmim_distance(q->>'key',nk)<=(case when length(nk)>=7 then 2 else 1 end)) and coalesce(args->>'confirmNick','')<>n then raise exception 'Nick parecido com existente. Confira antes de confirmar.'; end if;
 pid:=gen_random_uuid()::text;
 s:=jsonb_set(s,'{players}',s->'players'||jsonb_build_array(jsonb_build_object('id',pid,'nick',n,'key',nk,'createdAt',stamp)));
 elsif not exists(select 1 from jsonb_array_elements(s->'players') q where q->>'id'=pid) then raise exception 'Player não cadastrado.'; end if;
 if roster ? pid then raise exception 'Player já inscrito.'; end if;
 sea:=jsonb_set(sea,'{roster}',roster||jsonb_build_array(pid));
 sea:=jsonb_set(sea,'{joinedAt}',coalesce(sea->'joinedAt','{}'::jsonb)||jsonb_build_object(pid,stamp));
 elsif action in ('md3','tournament','edit') then
 if length(coalesce(args->>'note',''))>300 then raise exception 'Observação muito longa.'; end if;
 if action='edit' then
 pid:=args->>'playerId'; if not(roster ? pid) then raise exception 'Player fora da temporada.'; end if;
 d:=jsonb_build_object('playerId',pid); totals:='{}';
 foreach k in array keys loop
 v:=coalesce((args->'stats'->>k)::numeric,0);
 if abs(v)>1000000 or (k<>'adjustment' and (v<0 or (k<>'penalties' and v<>trunc(v)))) or v*2<>trunc(v*2) then raise exception 'Estatística inválida: %',k; end if;
 select coalesce(sum((z->>k)::numeric),0) into old from jsonb_array_elements(s->'events') ev cross join lateral jsonb_array_elements(ev->'deltas') z where ev->>'seasonId'=sid and z->>'playerId'=pid;
 d:=d||jsonb_build_object(k,v-old); totals:=totals||jsonb_build_object(k,v);
 end loop;
 if (totals->>'games')::numeric<>(totals->>'wins')::numeric+(totals->>'losses')::numeric then raise exception 'Jogos deve ser igual a vitórias + derrotas.'; end if;
 delta:=jsonb_build_array(d);
 else
 teams:=args->'teams';
 if teams is null or jsonb_typeof(teams)<>'array' then raise exception 'Times inválidos.'; end if;
 if (action = 'md3' and jsonb_array_length(teams) <> 2)
    or (action = 'tournament' and jsonb_array_length(teams) <> 4) then
   raise exception 'Quantidade de times inválida.';
 end if;
 ids:=array[]::text[];
 for j in 0..jsonb_array_length(teams)-1 loop
 if jsonb_typeof(teams->j)<>'array' or jsonb_array_length(teams->j)<>5 then raise exception 'Cada time precisa de 5 players.'; end if;
 for x in select jsonb_array_elements_text(teams->j) loop
 if not(roster ? x) or x=any(ids) then raise exception 'Player inválido ou repetido entre os times.'; end if; ids:=array_append(ids,x);
 end loop; end loop;
 if action='md3' then
 a:=(args->>'scoreA')::int; b:=(args->>'scoreB')::int;
 if a is null or b is null or not((a=1 and b=0) or (a=0 and b=1) or (a=2 and b in(0,1)) or (b=2 and a in(0,1)) or (a=3 and b in(0,1,2)) or (b=3 and a in(0,1,2))) then raise exception 'Use 1x0 (MD1), 2x0/2x1 (MD3) ou 3x0/3x1/3x2 (MD5).'; end if;
 end if;
 -- Premiações: apenas vencedores podem ser MVP; apenas perdedores podem ser Bagre.
 foreach k in array array['mvpId','bagreId'] loop
  x:=args->>k;
  if x is not null and x<>'' then
   if action='tournament' then
    j:=case when k='mvpId' then 0 else 3 end;
   elsif k='mvpId' then
    j:=case when a>b then 0 else 1 end;
   else
    j:=case when a>b then 1 else 0 end;
   end if;
   if not ((teams->j) ? x) then
    raise exception 'MVP deve ser do time vencedor e Bagre do time perdedor.';
   end if;
  end if;
 end loop;
 for j in 0..jsonb_array_length(teams)-1 loop
 for x in select jsonb_array_elements_text(teams->j) loop
 d:=jsonb_build_object('playerId',x);
 if action='md3' then d:=d||jsonb_build_object('games',a+b,'wins',case when j=0 then a else b end,'losses',case when j=0 then b else a end,'md3',case when(j=0 and a>b)or(j=1 and b>a)then 1 else 0 end,'mvp',case when args->>'mvpId'=x then 1 else 0 end,'bagre',case when args->>'bagreId'=x then 1 else 0 end);
 else d:=d||jsonb_build_object(case j when 0 then 'first' when 1 then 'second' when 2 then 'third' else 'fourth' end,1,'mvp',case when args->>'mvpId'=x then 1 else 0 end,'bagre',case when args->>'bagreId'=x then 1 else 0 end); end if;
 delta:=delta||jsonb_build_array(d);
 end loop; end loop;
 end if;
 s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'seasonId',sid,'at',stamp,'type',action,'note',coalesce(args->>'note',''),'deltas',delta,'score',case when action='md3' then concat(a,' × ',b)else '' end)));
 else raise exception 'Operação desconhecida.'; end if;
 s:=jsonb_set(s,array['seasons',idx::text],sea);
 end if;
 update public.cmim_rank set data=s,version=ver+1 where id=1;
 return jsonb_build_object('data',s,'version',ver+1);
end; $function$;

CREATE OR REPLACE FUNCTION public.cmim_admin_edit_draft_game(p_room uuid, p_game integer, p_winner_side text, p_picks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.cmim_draft_game_reports%rowtype;
 winner_name text;pick jsonb; i integer;
 side_text text;players jsonb;counter_b int;counter_r int;
 refs text[]:=array[]::text[]; champions text[]:=array[]::text[];
 new_txt text; history_text text; banned text;
begin
 if auth.uid() is null or not public.cmim_is_admin() then raise exception 'Permissao ADM obrigatoria.';end if;
 if p_game<1 or p_game>5 or p_winner_side not in ('B','R') then raise exception 'Jogo ou vencedor invalido.';end if;
 select * into r from public.cmim_draft_game_reports
 where room_id=p_room and game=p_game for update;
 if not found or r.review_status<>'pending' then raise exception 'Somente jogos pendentes podem ser editados.';end if;
 if exists(select 1 from public.cmim_pilot_rank_sync where room_id=p_room) then
  raise exception 'Serie ja pontuada nao pode ser editada.';end if;
 if jsonb_typeof(p_picks)<>'array' or jsonb_array_length(p_picks)<>10 then
  raise exception 'Envie os 10 picks completos.';end if;
 counter_b:=0;counter_r:=0;
 for pick in select value from jsonb_array_elements(p_picks) value loop
  side_text:=pick->>'side';
  if side_text not in ('B','R') then raise exception 'Lado invalido no pick.';end if;
  if side_text='B' then counter_b:=counter_b+1;else counter_r:=counter_r+1;end if;
  players:=r.teams->(case when side_text='B' then 0 else 1 end)->'players';
  if jsonb_typeof(players)<>'array' or not (players ? (pick->>'nick')) then
   raise exception 'Nick % nao pertence a %.',pick->>'nick',side_text;end if;
  if pick->>'champion' is null or (pick->>'champion') !~ '^[A-Za-z0-9]{2,45}$' then
   raise exception 'Campeao invalido.';end if;
  if (side_text||':'||(pick->>'nick'))=any(refs) then raise exception 'Jogador repetido no jogo.';end if;
  if (pick->>'champion')=any(champions) then raise exception 'Campeao duplicado no draft.';end if;
  refs:=array_append(refs,side_text||':'||(pick->>'nick'));
  champions:=array_append(champions,pick->>'champion');
 end loop;
 if counter_b<>5 or counter_r<>5 then raise exception 'Cada lado precisa de 5 picks.';end if;
 winner_name:=r.teams->(case when p_winner_side='B' then 0 else 1 end)->>'name';
 select string_agg(format('%s | %s | %s | %s',
  v->>'side',v->>'nick',coalesce(v->>'lane',''),v->>'champion'),E'\n'
 ) into history_text from jsonb_array_elements(p_picks) v;
 select string_agg(format('%s | %s',v->>'side',coalesce(v->>'champion','BAN PULADO')),E'\n')
 into banned from jsonb_array_elements(r.bans) v;
 new_txt:=format('CMIM | RELATORIO OFICIAL CORRIGIDO PELO ADM\nSala: %s\nTemporada: %s\nFormato: MD%s\nJogo: %s\nVENCEDOR: %s (%s)\n\nPICKS FINAIS | NICK - POSICAO - CAMPEAO\n%s\n\nBANS\n%s\n',
  r.room_id,coalesce(r.season_name,'Nao vinculada'),r.series_games,r.game,winner_name,p_winner_side,
  coalesce(history_text,''),coalesce(banned,''));
 insert into public.cmim_draft_game_edits(room_id,game,edited_by,
   previous_winner_side,new_winner_side,previous_picks,new_picks)
 values(p_room,p_game,auth.uid(),r.winner_side,p_winner_side,r.picks,p_picks);
 update public.cmim_draft_game_reports
   set winner_side=p_winner_side,winner_team=winner_name,picks=p_picks,report_txt=replace(new_txt,E'\\n',E'\n')
 where room_id=p_room and game=p_game and review_status='pending';
 return jsonb_build_object('ok',true,'winner',winner_name,'game',p_game);
end
$function$;
