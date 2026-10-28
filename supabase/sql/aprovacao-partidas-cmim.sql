-- CMIM / Aprovação oficial de partidas / 2026-10-28
-- Migrations de referência para instalar a regra em um banco CMIM novo.
-- Todos os jogos nascem PENDING e só os APPROVED entram nas estatísticas.
-- O lançamento MD3 e a aprovação são parte da mesma transação.

alter table public.cmim_draft_game_reports
 add column if not exists review_status text not null default 'pending',
 add column if not exists reviewed_by uuid references auth.users(id),
 add column if not exists reviewed_at timestamptz,
 add column if not exists review_note text;
alter table public.cmim_draft_game_reports
 drop constraint if exists cmim_draft_game_reports_review_status_check;
alter table public.cmim_draft_game_reports
 add constraint cmim_draft_game_reports_review_status_check check (review_status in ('pending','approved','rejected'));
create index if not exists cmim_draft_reports_review_idx
 on public.cmim_draft_game_reports (review_status,confirmed_at desc);
revoke update on public.cmim_draft_game_reports from anon,authenticated;
grant update(review_status,reviewed_by,reviewed_at,review_note)
 on public.cmim_draft_game_reports to authenticated;
drop policy if exists cmim_reports_admin_review on public.cmim_draft_game_reports;
create policy cmim_reports_admin_review
 on public.cmim_draft_game_reports for update to authenticated
 using ((select public.cmim_is_admin()))
 with check ((select public.cmim_is_admin()) and (reviewed_by is null or reviewed_by=(select auth.uid())));

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
 team_a text;team_b text;score_a int:=0;score_b int:=0;game_idx int:=0;v_event_id text;res jsonb;
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
   if rec.winner_team=team_a then score_a:=score_a+1;
   elsif rec.winner_team=team_b then score_b:=score_b+1;
   else raise exception 'Vencedor não corresponde às equipes iniciais.';end if;
   if (rec.teams #>> '{0,name}') not in(team_a,team_b)
     or (rec.teams #>> '{1,name}') not in(team_a,team_b) then raise exception 'Equipes diferentes no histórico.';end if;
   if jsonb_array_length(rec.picks)<>10 or jsonb_array_length(rec.bans)<>10 then raise exception 'O draft não foi registrado por completo.';end if;
   if rec.teams->0->'players' not in(r1.teams->0->'players',r1.teams->1->'players')
     or rec.teams->1->'players' not in(r1.teams->0->'players',r1.teams->1->'players') then raise exception 'Jogadores mudaram durante a série.';end if;
 end loop;
 if game_idx not in(2,3) or greatest(score_a,score_b)<>2
    or (game_idx=2 and least(score_a,score_b)<>0)
    or (game_idx=3 and least(score_a,score_b)<>1) then
  raise exception 'A MD3 ainda não terminou com um placar válido (2x0 ou 2x1).';
 end if;
 insert into public.cmim_pilot_rank_sync(room_id,season_id,event_id,score,approved_by)
 values (p_room,season_id,'pendente',score_a::text||'x'||score_b::text,auth.uid());
 -- A restrição UNIQUE impede a duplicação; toda a transação é revertida se o ranking falhar.
 res:=public.cmim_apply('md3',jsonb_build_object(
   'seasonId',season_id,'teams',mapped,'scoreA',score_a,'scoreB',score_b,
   'note','MD3 pelo ecossistema CMIM (ADM confirmou): '||p_room::text
 ),p_expected_version);
 v_event_id:=res #>> '{data,events,-1,id}';
 if v_event_id is null then raise exception 'O registro não retornou um identificador de evento.';end if;
 update public.cmim_pilot_rank_sync set event_id=v_event_id where room_id=p_room;
 update public.cmim_draft_game_reports
   set review_status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_note=null
   where room_id=p_room and review_status='pending';
 if not found then raise exception 'Nao ha partidas pendentes para aprovar.'; end if;
 return jsonb_build_object('ok',true,'eventId',v_event_id,'score',score_a::text||'x'||score_b::text,'seasonId',season_id);
end $function$;

CREATE OR REPLACE FUNCTION public.cmim_review_draft_series(p_room uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
 if auth.uid() is null or not public.cmim_is_admin() then raise exception 'Somente o ADM pode revisar partidas.'; end if;
 if p_action not in ('reject','reopen') then raise exception 'Acao invalida.'; end if;
 if exists(select 1 from public.cmim_pilot_rank_sync where room_id=p_room) then
  raise exception 'Esta serie ja gerou pontos e nao pode ser reaberta nem rejeitada.';
 end if;
 if p_action='reject' then
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Informe o motivo da rejeicao.'; end if;
  update public.cmim_draft_game_reports
   set review_status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(trim(p_reason),400)
   where room_id=p_room and review_status='pending';
 else
  update public.cmim_draft_game_reports
   set review_status='pending',reviewed_by=null,reviewed_at=null,review_note=null
   where room_id=p_room and review_status='rejected';
 end if;
 get diagnostics v_count=row_count;
 if v_count=0 then raise exception 'Nao ha partidas elegiveis para esta operacao.'; end if;
 return jsonb_build_object('ok',true,'changedGames',v_count,'action',p_action);
end
$function$;

revoke execute on function public.cmim_review_draft_series(uuid,text,text) from public,anon;
grant execute on function public.cmim_review_draft_series(uuid,text,text) to authenticated;
