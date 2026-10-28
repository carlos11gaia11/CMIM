-- CMIM: relatorios duraveis de picks, bans, nicks e placares
-- Os relatorios NAO sao excluidos pelo cron de 24h das salas.
-- Os dois capitaes precisam registrar o mesmo vencedor no motor do Draft.
-- Arquivo espelho da configuracao ativa no Supabase em 2026-10-28.

create table if not exists public.cmim_draft_game_reports (
 room_id uuid not null,
 game integer not null check(game between 1 and 5),
 season_id text,
 season_name text,
 mode text not null,
 winner_side text not null check(winner_side in ('B','R')),
 winner_team text not null,
 teams jsonb not null,
 picks jsonb not null,
 bans jsonb not null,
 actions jsonb not null,
 confirmed_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 report_txt text,
 primary key(room_id,game)
);
alter table public.cmim_draft_game_reports add column if not exists report_txt text;
create index if not exists cmim_draft_reports_season_idx on public.cmim_draft_game_reports(season_id,confirmed_at desc);
alter table public.cmim_draft_game_reports enable row level security;
grant select on public.cmim_draft_game_reports to anon,authenticated;
revoke insert,update,delete on public.cmim_draft_game_reports from anon,authenticated;
drop policy if exists cmim_draft_reports_read on public.cmim_draft_game_reports;
create policy cmim_draft_reports_read on public.cmim_draft_game_reports for select to anon,authenticated using(true);
create schema if not exists cmim_private;

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
  room_id,game,season_id,season_name,mode,winner_side,winner_team,teams,picks,bans,actions,confirmed_at,report_txt
 ) values (
  old.id,old_game,
  old.state #>> '{season,id}',old.state #>> '{season,name}',
  coalesce(old.state->>'mode','Normal'),outcome->>'winner',
  old.state #>> (case when outcome->>'winner'='B' then '{teams,0,name}' else '{teams,1,name}' end)::text[],
  report_teams,report_picks,report_bans,report_actions,
  to_timestamp((outcome->>'at')::numeric/1000.0),report_txt
 )
 on conflict(room_id,game) do nothing;
 return new;
end
$function$;



-- A API usa service_role para gravar salas; o gatilho precisa deste acesso.
grant usage on schema cmim_private to service_role;
revoke all on function cmim_private.archive_confirmed_draft_game() from public,anon,authenticated;
grant execute on function cmim_private.archive_confirmed_draft_game() to service_role;

drop trigger if exists cmim_archive_confirmed_game on public.cmim_draft_rooms;
create trigger cmim_archive_confirmed_game after update of state on public.cmim_draft_rooms
 for each row execute function cmim_private.archive_confirmed_draft_game();

-- Consulta para futuras estatisticas por temporada:
-- select season_id,season_name,winner_team,count(*) jogos_vencidos
-- from public.cmim_draft_game_reports
-- group by season_id,season_name,winner_team;
