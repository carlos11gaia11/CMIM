-- CMIM • Snapshot SQL of deployed identity and tournament functions
-- Generated 29 October 2026 from the actual connected Supabase database.
-- Keep this as schema reference. Do not apply to existing production without reviewing.
alter table public.cmim_profiles add column if not exists rank_verified_at timestamptz;
alter table public.cmim_profiles add column if not exists rank_verified_by uuid references auth.users(id);
create unique index if not exists cmim_profiles_one_account_per_rank_player on public.cmim_profiles(rank_player_id) where rank_player_id is not null;
alter table public.cmim_competitions add column if not exists swiss_rounds integer not null default 5;
alter table public.cmim_competition_matches add column if not exists manual_result_reason text;
alter table public.cmim_competition_matches add column if not exists approved_by uuid references auth.users(id);
alter table public.cmim_competition_matches add column if not exists approved_at timestamptz;
create unique index if not exists cmim_competitions_one_match_per_draft_room on public.cmim_competition_matches(room_id) where room_id is not null;

CREATE OR REPLACE FUNCTION cmim_private.cmim_guard_competition_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare best_of int;needed int;
begin
 if old.status='approved' and new is distinct from old then
  raise exception 'Confronto já homologado: resultados não podem ser alterados após a aprovação.';end if;
 if new.status='approved' and old.status<>'approved' then
  if new.team_b_id is null then
   raise exception 'Folga só pode ser gerada pelo sistema do campeonato.';end if;
  select c.series_games into best_of from public.cmim_competitions c where c.id=new.competition_id;
  needed:=(best_of+1)/2;
  if greatest(new.score_a,new.score_b)<>needed
    or least(new.score_a,new.score_b)>=needed
    or new.winner_id is distinct from
      (case when new.score_a>new.score_b then new.team_a_id else new.team_b_id end) then
    raise exception 'Placar da MD% inválido ou vencedor divergente.',best_of;end if;
  if new.approved_by is null or new.approved_at is null then
    raise exception 'É obrigatório registrar o ADM responsável pela homologação.';end if;
  if new.room_id is null and length(trim(coalesce(new.manual_result_reason,'')))<8 then
    raise exception 'Resultados fora da seleção exigem justificativa de pelo menos 8 caracteres.';end if;
  if new.room_id is not null and not exists(
   select 1 from public.cmim_pilot_rank_sync s where s.room_id=new.room_id) then
    raise exception 'A sala precisa estar homologada no Ranking antes do confronto.';end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION cmim_private.cmim_guard_verified_riot_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.rank_player_id is not null and old.rank_verified_at is not null
   and (new.nick is distinct from old.nick or new.tag is distinct from old.tag)
   and not public.cmim_is_admin() then
   raise exception 'Seu Riot ID está ligado ao Ranking. Solicite a mudança de Nick#TAG ao ADM para preservar as estatísticas.';
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.cmim_admin_profile_set(p_user uuid, p_rank_player_id text DEFAULT NULL::text, p_tier text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_rank text:=nullif(trim(p_rank_player_id),'');
begin
 if auth.uid() is null or not public.cmim_is_admin() then raise exception 'Somente ADM pode confirmar identidade de ranking.';end if;
 if p_tier is not null and p_tier not in ('S','A','B','C','D','E','F') then raise exception 'Tier inválido.';end if;
 if target_rank is not null and not exists(
  select 1 from public.cmim_rank r,jsonb_array_elements(r.data->'players') pl
  where r.id=1 and pl->>'id'=target_rank
 ) then raise exception 'Jogador selecionado não consta do Ranking oficial.';end if;
 if target_rank is not null and exists(
  select 1 from public.cmim_profiles p where p.rank_player_id=target_rank and p.id<>p_user
 ) then raise exception 'Este jogador do Ranking já está vinculado a outra conta.';end if;
 update public.cmim_profiles set rank_player_id=target_rank,
  rank_verified_at=case when target_rank is null then null else now() end,
  rank_verified_by=case when target_rank is null then null else auth.uid() end,
  tier=p_tier,updated_at=now()
 where id=p_user;
 if not found then raise exception 'Conta de usuário não encontrada.';end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.cmim_competition_generate_round(p_competition uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.cmim_competitions%rowtype; ids uuid[]; arr uuid[];
 last int; rnd int; n int; pow2 int; playins int; free int;
 i int; j int; match_no int; a uuid; b uuid; bye_id uuid; created int:=0; pairs jsonb; pair_item jsonb;
begin
 if auth.uid() is null or not public.cmim_is_admin() then raise exception 'ADM obrigatório.';end if;
 select * into c from public.cmim_competitions where id=p_competition for update;
 if not found or c.status not in ('closed','live') then raise exception 'Encerre as inscrições para gerar os confrontos.';end if;
 if exists(select 1 from public.cmim_competition_entries where competition_id=c.id and status='pending') then
 raise exception 'Analise todas as inscrições pendentes primeiro.';end if;
 select count(*) into n from public.cmim_competition_entries where competition_id=c.id and status='approved';
 if n<2 then raise exception 'Aprove ao menos dois times.';end if;
 select coalesce(max(round_number),0) into last from public.cmim_competition_matches where competition_id=c.id;
 if exists(select 1 from public.cmim_competition_matches where competition_id=c.id and round_number=last and status<>'approved') then
 raise exception 'Finalize e aprove a rodada anterior.';end if;
 rnd:=last+1;
 if c.structure='liga' and last>0 then raise exception 'Tabela da Liga já foi gerada.';end if;
 if c.structure='suico' and last>=c.swiss_rounds then raise exception 'O Suíço já concluiu as rodadas previstas.';end if;
 if last=0 then
  select array_agg(team_id order by created_at,team_id) into ids
  from public.cmim_competition_entries where competition_id=c.id and status='approved';
 else
  select array_agg(team_id order by standing_position) into ids
  from public.cmim_competition_standings(c.id);
 end if;
 if c.structure='liga' then
  arr:=ids;if n%2=1 then arr:=arr||array[null::uuid];end if;
  for i in 1..(cardinality(arr)-1) loop
   match_no:=0;
   for j in 1..(cardinality(arr)/2) loop
    a:=arr[j];b:=arr[cardinality(arr)+1-j];
    if a is not null and b is not null then
     match_no:=match_no+1;
     insert into public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id)
     values(c.id,i,match_no,a,b);created:=created+1;
    end if;
   end loop;
   arr:=arr[1:1]||array[arr[cardinality(arr)]]||arr[2:cardinality(arr)-1];
  end loop;
 elsif c.structure='copa' then
  if last=0 then
   pow2:=power(2,floor(log(2,n)))::int;playins:=n-pow2;free:=n-2*playins;match_no:=0;
   for i in 1..free loop
    match_no:=match_no+1;
    insert into public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id,winner_id,status,approved_by,approved_at)
    values(c.id,1,match_no,ids[i],null,ids[i],'approved',auth.uid(),now());created:=created+1;
   end loop;
   for i in 1..playins loop
    match_no:=match_no+1;
    insert into public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id)
    values(c.id,1,match_no,ids[free+i],ids[n+1-i]);created:=created+1;
   end loop;
  else
   select array_agg(winner_id order by match_number) into arr from public.cmim_competition_matches
   where competition_id=c.id and round_number=last and status='approved';
   if cardinality(arr)<2 then raise exception 'Esta Copa já tem campeão.';end if;
   if cardinality(arr)%2<>0 then raise exception 'Chave de Copa inválida. Confira as folgas.';end if;
   for i in 1..(cardinality(arr)/2) loop
    insert into public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id)
    values(c.id,rnd,i,arr[i],arr[cardinality(arr)+1-i]);created:=created+1;
   end loop;
  end if;
 else
  arr:=ids;
  if n%2=1 then
   select team_id into bye_id from public.cmim_competition_standings(c.id) x where x.byes=0
   order by x.points,x.buchholz,x.map_difference,x.standing_position desc limit 1;
   if bye_id is null then raise exception 'Não existe equipe sem folga para esta rodada.';end if;
   arr:=array_remove(arr,bye_id);
   insert into public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id,winner_id,status,approved_by,approved_at)
   values(c.id,rnd,1,bye_id,null,bye_id,'approved',auth.uid(),now());created:=1;
  end if;
  pairs:=public.cmim_swiss_pair(c.id,arr);
  if pairs is null then raise exception
   'O Suíço não encontrou confrontos inéditos com a configuração atual. Revise as rodadas e as folgas.';end if;
  match_no:=created;
  for pair_item in select value from jsonb_array_elements(pairs) loop
   match_no:=match_no+1;
   insert into public.cmim_competition_matches(competition_id,round_number,match_number,team_a_id,team_b_id)
   values(c.id,rnd,match_no,(pair_item->>'a')::uuid,(pair_item->>'b')::uuid);
   created:=created+1;
  end loop;
 end if;
 return jsonb_build_object('ok',true,'round',rnd,'matchesCreated',created,'format',c.structure,'byeTeam',bye_id);
end $function$;

CREATE OR REPLACE FUNCTION public.cmim_competition_link_room(p_match uuid, p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.cmim_competition_matches%rowtype;c public.cmim_competitions%rowtype;
 st jsonb; i int; squad uuid;linked int; players jsonb; ids jsonb;
begin
 if auth.uid() is null or not public.cmim_is_admin() then raise exception 'Acesso exclusivo do ADM.';end if;
 select * into m from public.cmim_competition_matches where id=p_match for update;
 if not found or m.status='approved' or m.team_b_id is null then raise exception 'Confronto não pode ser vinculado.';end if;
 if m.room_id is not null then raise exception 'A partida já possui uma sala vinculada.';end if;
 select * into c from public.cmim_competitions where id=m.competition_id;
 select r.state into st from public.cmim_draft_rooms r where r.id=p_room;
 if st is null then raise exception 'Sala de seleção não encontrada ou expirada.';end if;
 if (st->>'games')::int is distinct from c.series_games then
  raise exception 'A seleção deve usar o mesmo formato MD% do campeonato.',c.series_games;end if;
 for i in 0..1 loop
  squad:=case when i=0 then m.team_a_id else m.team_b_id end;
  ids:=st->'teams'->i->'profileIds';
  if jsonb_typeof(ids)<>'array' or jsonb_array_length(ids)<>5 then
    raise exception 'É obrigatório usar as cinco contas cadastradas do time na seleção.';end if;
  select count(*) into linked from public.cmim_squad_members x where x.team_id=squad
   and ids ? (x.user_id::text);
  if linked<>5 or (select count(*) from public.cmim_squad_members where team_id=squad)<>5 then
    raise exception 'Elenco da sala não corresponde aos cinco membros do time inscrito.';end if;
 end loop;
 if exists(select 1 from public.cmim_competition_matches where room_id=p_room) then
  raise exception 'Esta sala já está vinculada a outro confronto.';end if;
 update public.cmim_competition_matches set room_id=p_room,status='live',updated_at=now() where id=p_match;
 return jsonb_build_object('ok',true,'room',p_room,'match',p_match);
end $function$;

CREATE OR REPLACE FUNCTION public.cmim_competition_standings(p_competition uuid)
 RETURNS TABLE(team_id uuid, played integer, wins integer, losses integer, byes integer, points integer, map_difference integer, buchholz integer, standing_position bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with entries as (select team_id from public.cmim_competition_entries where competition_id=p_competition and status='approved'),
stats as (
 select e.team_id,
 count(m.id) filter(where m.team_b_id is not null)::int played,
 count(m.id) filter(where m.winner_id=e.team_id and m.team_b_id is not null)::int wins,
 count(m.id) filter(where m.winner_id<>e.team_id and m.team_b_id is not null)::int losses,
 count(m.id) filter(where m.winner_id=e.team_id and m.team_b_id is null)::int byes,
 (count(m.id) filter(where m.winner_id=e.team_id)*3)::int points,
 coalesce(sum(case when m.team_b_id is null then 0
  when m.team_a_id=e.team_id then m.score_a-m.score_b
  else m.score_b-m.score_a end),0)::int map_difference
 from entries e left join public.cmim_competition_matches m on
 m.competition_id=p_competition and m.status='approved'
 and (m.team_a_id=e.team_id or m.team_b_id=e.team_id)
 group by e.team_id
), totals as (
 select s.*,coalesce((select sum(opp.points) from public.cmim_competition_matches m
 join stats opp on opp.team_id=case when m.team_a_id=s.team_id then m.team_b_id else m.team_a_id end
 where m.competition_id=p_competition and m.status='approved' and m.team_b_id is not null
 and (m.team_a_id=s.team_id or m.team_b_id=s.team_id)),0)::int as buchholz from stats s)
select t.team_id,t.played,t.wins,t.losses,t.byes,t.points,t.map_difference,t.buchholz,
 row_number() over(order by t.points desc,t.buchholz desc,t.map_difference desc,t.wins desc,t.team_id)::bigint
from totals t order by 9;
$function$;

CREATE OR REPLACE FUNCTION public.cmim_competition_sync_match(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m public.cmim_competition_matches%rowtype;
 r public.cmim_draft_game_reports%rowtype;
 initial_game public.cmim_draft_game_reports%rowtype;
 side_a int; side_b int; connected int;
 team_a_name text;team_b_name text;wins_a int:=0;wins_b int:=0;
 played int:=0;required int;
begin
 if auth.uid() is null or not public.cmim_is_admin() then raise exception 'Somente ADM pode homologar confrontos.';end if;
 select * into m from public.cmim_competition_matches where id=p_match for update;
 if not found or m.room_id is null then raise exception 'Vincule primeiro uma sala de seleção à partida.';end if;
 if m.status='approved' then raise exception 'Este confronto já foi homologado.';end if;
 select * into initial_game from public.cmim_draft_game_reports
 where room_id=m.room_id order by game limit 1;
 if not found then raise exception 'A sala ainda não possui jogos arquivados.';end if;
 if exists(select 1 from public.cmim_draft_game_reports
   where room_id=m.room_id and review_status<>'approved') then
   raise exception 'A série precisa estar totalmente aprovada no Painel ADM.';end if;
 if not exists(select 1 from public.cmim_pilot_rank_sync where room_id=m.room_id) then
  raise exception 'A série ainda não recebeu homologação oficial no ranking.';end if;
 required:=(initial_game.series_games+1)/2;
 for side_a in 0..1 loop
  select count(*) into connected from public.cmim_squad_members x
    where x.team_id=m.team_a_id
      and initial_game.teams->side_a->'profileIds' ? x.user_id::text;
  if connected=5 then exit;end if;
 end loop;
 if side_a>1 or connected<>5 then raise exception 'O elenco do Time A não corresponde à sala vinculada.';end if;
 side_b:=1-side_a;
 select count(*) into connected from public.cmim_squad_members x
    where x.team_id=m.team_b_id
      and initial_game.teams->side_b->'profileIds' ? x.user_id::text;
 if connected<>5 then raise exception 'O elenco do Time B não corresponde à sala vinculada.';end if;
 team_a_name:=initial_game.teams->side_a->>'name';
 team_b_name:=initial_game.teams->side_b->>'name';
 for r in select * from public.cmim_draft_game_reports where room_id=m.room_id order by game loop
  played:=played+1;
  if r.game<>played or r.series_games<>initial_game.series_games then
   raise exception 'Relatórios da MD têm jogos faltantes ou formato inconsistente.';end if;
  if r.winner_team=team_a_name then wins_a:=wins_a+1;
  elsif r.winner_team=team_b_name then wins_b:=wins_b+1;
  else raise exception 'Vencedor divergente do elenco inicial.';end if;
 end loop;
 if played>initial_game.series_games or greatest(wins_a,wins_b)<>required then
  raise exception 'A MD não terminou em um placar válido.';end if;
 update public.cmim_competition_matches set score_a=wins_a,score_b=wins_b,status='approved',
  winner_id=case when wins_a>wins_b then m.team_a_id else m.team_b_id end,
  approved_by=auth.uid(),approved_at=now(),updated_at=now()
 where id=m.id and status<>'approved';
 return jsonb_build_object('ok',true,'score',wins_a::text||'x'||wins_b::text,'room',m.room_id);
end $function$;

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
 side_idx integer; slot_idx integer; player_nick text; player_id text; account_id text; all_ids text[]:=array[]::text[];
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
   for slot_idx in 0..4 loop
     player_nick:=r1.teams->side_idx->'players'->>slot_idx;
     account_id:=r1.teams->side_idx->'profileIds'->>slot_idx;
     player_id:=null;
     -- Prefer a verified account-to-ranking link, never arbitrary nickname claims.
     if account_id is not null and account_id ~ '^[a-f0-9-]{36}$' then
       select prof.rank_player_id into player_id from public.cmim_profiles prof
       where prof.id=account_id::uuid and prof.rank_verified_at is not null;
       if player_id is null then
        raise exception 'Conta CMIM de % não possui vínculo confirmado pelo ADM. Vincule o Riot ID no painel.',player_nick;
       end if;
     else
       select value->>'id' into player_id from jsonb_array_elements(st->'players') value
       where value->>'key'=public.cmim_key(player_nick) limit 1;
       if player_id is null then
         -- Accounts with verified link can be recognized by their normalized Riot nick.
         select prof.rank_player_id into player_id from public.cmim_profiles prof
         where public.cmim_key(prof.nick)=public.cmim_key(player_nick)
          and prof.rank_verified_at is not null and prof.rank_player_id is not null
         limit 1;
       end if;
     end if;
     if player_id is null then raise exception 'Nick sem vínculo com o Ranking: %. Vá ao ADM > Usuários.',player_nick;end if;
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

CREATE OR REPLACE FUNCTION public.cmim_swiss_pair(p_competition uuid, p_teams uuid[], p_depth integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare a uuid;b uuid;c uuid;rest uuid[];tail jsonb;
 choices integer;minimum integer:=2147483647;cnt integer;
begin
 if coalesce(cardinality(p_teams),0)=0 then return '[]'::jsonb;end if;
 if cardinality(p_teams)%2<>0 then return null;end if;
 if p_depth>64 then return null;end if;
 -- Pick the participant with the fewest legal opponents first (MRV).
 foreach c in array p_teams loop
  select count(*) into cnt from unnest(p_teams) t(opponent)
  where t.opponent<>c and not exists(
   select 1 from public.cmim_competition_matches m where m.competition_id=p_competition
    and m.team_b_id is not null and
    ((m.team_a_id=c and m.team_b_id=t.opponent) or
     (m.team_b_id=c and m.team_a_id=t.opponent))
  );
  if cnt<minimum then a:=c;minimum:=cnt;end if;
 end loop;
 if minimum=0 then return null;end if;
 rest:=array_remove(p_teams,a);
 -- Try nearest-ranked possible opponents first. Backtrack if a choice dead-ends.
 foreach b in array rest loop
  if exists(select 1 from public.cmim_competition_matches m where m.competition_id=p_competition
   and m.team_b_id is not null and
   ((m.team_a_id=a and m.team_b_id=b) or (m.team_b_id=a and m.team_a_id=b))) then continue;end if;
  tail:=public.cmim_swiss_pair(p_competition,array_remove(rest,b),p_depth+1);
  if tail is not null then
   return jsonb_build_array(jsonb_build_object('a',a,'b',b))||tail;
  end if;
 end loop;
 return null;
end $function$;

drop trigger if exists cmim_guard_verified_riot_id on public.cmim_profiles;
create trigger cmim_guard_verified_riot_id before update on public.cmim_profiles
 for each row execute function cmim_private.cmim_guard_verified_riot_id();
drop trigger if exists cmim_guard_competition_match on public.cmim_competition_matches;
create trigger cmim_guard_competition_match before update on public.cmim_competition_matches
 for each row execute function cmim_private.cmim_guard_competition_match();
revoke all on function public.cmim_competition_generate_round(uuid) from public,anon;
revoke all on function public.cmim_competition_link_room(uuid,uuid) from public,anon;
revoke all on function public.cmim_competition_sync_match(uuid) from public,anon;
revoke all on function public.cmim_swiss_pair(uuid,uuid[],integer) from public,anon;
grant execute on function public.cmim_competition_generate_round(uuid) to authenticated;
grant execute on function public.cmim_competition_link_room(uuid,uuid) to authenticated;
grant execute on function public.cmim_competition_sync_match(uuid) to authenticated;
grant execute on function public.cmim_swiss_pair(uuid,uuid[],integer) to authenticated;
