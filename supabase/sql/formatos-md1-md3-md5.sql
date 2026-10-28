-- CMIM / Selecao de Campeoes MD1 MD3 MD5
-- Publicado no projeto Supabase em 2026-10-28.
-- Atualizacao da definicao de relatorios, calculo MD1/MD3/MD5
-- e homologacao atomica pelo administrador.
-- Mantenha o restante das migrations (RLS, triggers e tabelas).
alter table public.cmim_draft_game_reports
 add column if not exists series_games integer not null default 3;
alter table public.cmim_draft_game_reports
 drop constraint if exists cmim_report_series_games_ck;
alter table public.cmim_draft_game_reports
 add constraint cmim_report_series_games_ck check(series_games in (1,3,5));

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
 s:=jsonb_set(s,'{seasons}',s->'seasons'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'name',n,'logo',coalesce(args->>'logo',''),'status','active','roster','[]'::jsonb,'createdAt',stamp)));
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

CREATE OR REPLACE FUNCTION public.cmim_pilot_publish(p_room uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 r1 public.cmim_draft_game_reports%rowtype;
 rec public.cmim_draft_game_reports%rowtype;
 st jsonb;ver bigint;season jsonb; season_id text;
 teams jsonb; mapped jsonb:='[]'::jsonb; group_ids jsonb;
 side_idx integer; player_nick text; player_id text; all_ids text[]:=array[]::text[];
 team_a text;team_b text;score_a int:=0;score_b int:=0;game_idx int:=0;series_len int;required_wins int;v_event_id text;res jsonb;
begin
 if auth.uid() is null or not public.cmim_is_admin() then raise exception 'Somente o administrador pode aprovar pontos.';end if;
 select data,version into st,ver from public.cmim_rank where id=1;
 if ver<>p_expected_version then raise exception 'O ranking mudou. Atualize e confira antes de publicar.';end if;
 select * into r1 from public.cmim_draft_game_reports where room_id=p_room order by game asc limit 1;
 if exists (select 1 from public.cmim_draft_game_reports where room_id=p_room and review_status <> 'pending') then
  raise exception 'Esta serie ja foi analisada. Nao pode ser aprovada duas vezes.';
 end if;
 if not found then raise exception 'Nenhuma partida registrada nessa sala.';end if;
 if r1.game<>1 then raise exception 'O histórico não começa pelo jogo 1.';end if;
 series_len:=r1.series_games;
 if series_len not in (1,3,5) then raise exception 'Formato inválido: permitido MD1, MD3 ou MD5.';end if;
 required_wins:=(series_len+1)/2;
 if r1.season_id is null then raise exception 'A série não está vinculada a uma temporada.';end if;
 season_id:=r1.season_id;
 select value into season from jsonb_array_elements(st->'seasons') value where value->>'id'=season_id;
 if season is null or season->>'status'<>'active' then raise exception 'A temporada vinculada não está ativa.';end if;
 team_a:=r1.teams #>> '{0,name}';team_b:=r1.teams #>> '{1,name}';
 if team_a is null or team_b is null or team_a=team_b then raise exception 'Nomes de equipes inválidos.';end if;
 if jsonb_array_length(r1.teams #> '{0,players}')<>5 or jsonb_array_length(r1.teams #> '{1,players}')<>5 then raise exception 'Cada equipe precisa ter cinco jogadores.';end if;
 for side_idx in 0..1 loop
   group_ids:='[]'::jsonb;
   for player_nick in select jsonb_array_elements_text(r1.teams->side_idx->'players') loop
     select value->>'id' into player_id from jsonb_array_elements(st->'players') value
      where value->>'key'=public.cmim_key(player_nick) limit 1;
     if player_id is null then raise exception 'Nick não encontrado no ranking: %',player_nick;end if;
     if not (season->'roster' ? player_id) then raise exception 'Jogador fora da temporada: %',player_nick;end if;
     if player_id=any(all_ids) then raise exception 'Jogador duplicado entre os times: %',player_nick;end if;
     all_ids:=array_append(all_ids,player_id);
     group_ids:=group_ids||jsonb_build_array(player_id);
   end loop;
   mapped:=mapped||jsonb_build_array(group_ids);
 end loop;
 for rec in select * from public.cmim_draft_game_reports where room_id=p_room order by game asc loop
   game_idx:=game_idx+1;
   if rec.game<>game_idx then raise exception 'O histórico possui jogos faltando.';end if;
   if rec.season_id is distinct from season_id then raise exception 'Temporadas diferentes na mesma série.';end if;
   if rec.series_games is distinct from series_len then raise exception 'Formatos diferentes na mesma série.';end if;
   if rec.winner_team=team_a then score_a:=score_a+1;
   elsif rec.winner_team=team_b then score_b:=score_b+1;
   else raise exception 'Vencedor não corresponde às equipes iniciais.';end if;
   if (rec.teams #>> '{0,name}') not in(team_a,team_b)
     or (rec.teams #>> '{1,name}') not in(team_a,team_b) then raise exception 'Equipes diferentes no histórico.';end if;
   if jsonb_array_length(rec.picks)<>10 or jsonb_array_length(rec.bans)<>10 then raise exception 'O draft não foi registrado por completo.';end if;
   if rec.teams->0->'players' not in(r1.teams->0->'players',r1.teams->1->'players')
     or rec.teams->1->'players' not in(r1.teams->0->'players',r1.teams->1->'players') then raise exception 'Jogadores mudaram durante a série.';end if;
 end loop;
 if game_idx<>score_a+score_b or game_idx>series_len
   or greatest(score_a,score_b)<>required_wins
   or least(score_a,score_b)>=required_wins then
  raise exception 'A MD% não terminou com placar válido. Necessárias % vitórias.',series_len,required_wins;
 end if;
 insert into public.cmim_pilot_rank_sync(room_id,season_id,event_id,score,approved_by)
 values (p_room,season_id,'pendente',score_a::text||'x'||score_b::text,auth.uid());
 -- A restrição UNIQUE impede a duplicação; toda a transação é revertida se o ranking falhar.
 res:=public.cmim_apply('md3',jsonb_build_object(
   'seasonId',season_id,'teams',mapped,'scoreA',score_a,'scoreB',score_b,
   'note','MD'||series_len||' pelo ecossistema CMIM (ADM confirmou): '||p_room::text
 ),p_expected_version);
 v_event_id:=res #>> '{data,events,-1,id}';
 if v_event_id is null then raise exception 'O registro não retornou um identificador de evento.';end if;
 update public.cmim_pilot_rank_sync set event_id=v_event_id where room_id=p_room;
 update public.cmim_draft_game_reports
   set review_status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_note=null
   where room_id=p_room and review_status='pending';
 if not found then raise exception 'Nao ha partidas pendentes para aprovar.'; end if;
 return jsonb_build_object('ok',true,'eventId',v_event_id,'score',score_a::text||'x'||score_b::text,'seasonId',season_id,'format','MD'||series_len);
end $function$;

CREATE OR REPLACE FUNCTION cmim_private.archive_confirmed_draft_game()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 outcome jsonb;
 blue jsonb;
 red jsonb;
 old_game integer;
 side_code text;
 side_index integer;
 slot integer;
 pick_index integer;
 team jsonb;
 side_picks jsonb;
 champion_id text;
 report_teams jsonb;
 report_picks jsonb:='[]'::jsonb;
 report_bans jsonb;
 report_actions jsonb;
 report_txt text;
begin
 outcome:=new.state->'lastConfirmedResult';
 if outcome is null or jsonb_typeof(outcome)<>'object' then return new;end if;
 old_game:=coalesce((old.state->>'game')::integer,0);
 if coalesce((outcome->>'game')::integer,0)<>old_game then return new;end if;
 if old.state->'lastConfirmedResult'=outcome then return new;end if;
 if jsonb_array_length(coalesce(old.state->'actions','[]'::jsonb))<>20 then
   raise exception 'O historico so pode ser salvo com 20 escolhas.';
 end if;
 blue:=jsonb_build_object('side','B','name',old.state #>> '{teams,0,name}','players',old.state #> '{teams,0,players}');
 red:=jsonb_build_object('side','R','name',old.state #>> '{teams,1,name}','players',old.state #> '{teams,1,players}');
 report_teams:=jsonb_build_array(blue,red);
 for side_index in 0..1 loop
  side_code:=case when side_index=0 then 'B' else 'R' end;
  team:=old.state->'teams'->side_index;
  select coalesce(jsonb_agg(a.value order by a.ord),'[]'::jsonb)
   into side_picks
   from jsonb_array_elements(old.state->'actions') with ordinality as a(value,ord)
   where a.value->>'type'='pick' and a.value->>'side'=side_code;
  if jsonb_array_length(side_picks)<>5 then raise exception 'Picks incompletos.';end if;
  for slot in 0..4 loop
   pick_index:=coalesce((old.state #>> array['swaps',side_index::text,slot::text])::int,slot);
   if pick_index<0 or pick_index>4 then raise exception 'Troca de jogadores invalida.';end if;
   champion_id:=side_picks->pick_index->>'champion';
   report_picks:=report_picks||jsonb_build_array(jsonb_build_object(
    'side',side_code,'team',team->>'name','nick',team->'players'->>slot,
    'slot',slot+1,'lane',coalesce(old.state #>> array['lanes',side_index::text,slot::text],''),
    'champion',champion_id
   ));
  end loop;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object(
   'order',a.ord,'side',a.value->>'side','champion',a.value->>'champion'
 ) order by a.ord),'[]'::jsonb)
 into report_bans
 from jsonb_array_elements(old.state->'actions') with ordinality as a(value,ord)
 where a.value->>'type'='ban';
 select coalesce(jsonb_agg(jsonb_build_object(
    'order',a.ord,'side',a.value->>'side','type',a.value->>'type','champion',a.value->>'champion'
 ) order by a.ord),'[]'::jsonb)
 into report_actions
 from jsonb_array_elements(old.state->'actions') with ordinality as a(value,ord);
  report_txt:=format(
  'CMIM | RELATORIO OFICIAL DA PARTIDA\\nSala: %s\\nTemporada: %s\\nJogo: %s\\nModo: %s\\nData da confirmacao: %s (UTC)\\n\\nVENCEDOR CONFIRMADO PELOS DOIS CAPITAES: %s (%s SIDE)\\nBLUE SIDE: %s\\nRED SIDE: %s\\n\\n',
  old.id,coalesce(old.state #>> '{season,name}','Nao vinculada'),
  old_game,coalesce(old.state->>'mode','Normal'),
  to_char(to_timestamp((outcome->>'at')::numeric/1000.0) at time zone 'UTC','DD/MM/YYYY HH24:MI:SS'),
  case when outcome->>'winner'='B' then old.state #>> '{teams,0,name}' else old.state #>> '{teams,1,name}' end,
  case when outcome->>'winner'='B' then 'BLUE' else 'RED' end,
  old.state #>> '{teams,0,name}',old.state #>> '{teams,1,name}'
 );
 report_txt:=replace(report_txt,E'\\n',E'\n');
 report_txt:=report_txt||format('FORMATO: MD%s',coalesce(old.state->>'games','3'))||E'\n\n';
 report_txt:=report_txt||'PICKS FINAIS | NICK - POSICAO - CAMPEAO'||E'\n';
 report_txt:=report_txt||coalesce((
   select string_agg(
    format('%s | %s | %s | %s',p.value->>'side',p.value->>'nick',p.value->>'lane',coalesce(p.value->>'champion','NAO DEFINIDO')),
    E'\n' order by case when p.value->>'side'='B' then 0 else 1 end,(p.value->>'slot')::int
   ) from jsonb_array_elements(report_picks) p(value)
 ),'')||E'\n\nBANS (ORDEM ORIGINAL)'||E'\n';
 report_txt:=report_txt||coalesce((
   select string_agg(format('%s | %s',p.value->>'side',coalesce(p.value->>'champion','BAN PULADO')),E'\n' order by (p.value->>'order')::int)
   from jsonb_array_elements(report_bans) p(value)
 ),'')||E'\n\nORDEM COMPLETA DO DRAFT'||E'\n';
 report_txt:=report_txt||coalesce((
   select string_agg(format('%s. %s | %s | %s',p.value->>'order',p.value->>'side',upper(p.value->>'type'),coalesce(p.value->>'champion','BAN PULADO')),E'\n' order by (p.value->>'order')::int)
   from jsonb_array_elements(report_actions) p(value)
 ),'')||E'\n\nDados estruturados preservados para estatisticas do CMIM.\n';

 insert into public.cmim_draft_game_reports(
  room_id,game,season_id,season_name,mode,winner_side,winner_team,teams,picks,bans,actions,confirmed_at,report_txt,series_games
 ) values (
  old.id,old_game,
  old.state #>> '{season,id}',old.state #>> '{season,name}',
  coalesce(old.state->>'mode','Normal'),outcome->>'winner',
  old.state #>> (case when outcome->>'winner'='B' then '{teams,0,name}' else '{teams,1,name}' end)::text[],
  report_teams,report_picks,report_bans,report_actions,
  to_timestamp((outcome->>'at')::numeric/1000.0),report_txt,coalesce((old.state->>'games')::integer,3)
 )
 on conflict(room_id,game) do nothing;
 return new;
end
$function$;
