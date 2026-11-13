-- CMIM / Fila in-house do site (módulo independente)
-- Projeto de destino: klpvidxhzofbwstvvxib (banco atual do portal/ranking)
-- ADDITIVE ONLY: não altera cmim_rank, resultados nem auth.users.
begin;
create schema if not exists cmim_internal;
revoke all on schema cmim_internal from public, anon, authenticated;

create table if not exists public.cmim_queue_settings (
 id integer primary key default 1 check (id=1),
 pick_seconds integer not null default 60 check (pick_seconds between 15 and 300),
 updated_at timestamptz not null default now()
);
insert into public.cmim_queue_settings(id) values(1) on conflict do nothing;

create table if not exists public.cmim_queue_rooms (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 3 and 120),
 opens_at timestamptz not null,
 closes_at timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','open','closed','drafting','paused','finished','canceled')),
 captain_a uuid, captain_b uuid,
 pick_number integer not null default 1 check(pick_number between 1 and 9),
 pick_deadline timestamptz,
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(closes_at > opens_at),
 check(captain_a is null or captain_b is null or captain_a<>captain_b)
);
create index if not exists cmim_q_rooms_opens_idx on public.cmim_queue_rooms(opens_at desc);

create table if not exists public.cmim_queue_entries (
 room_id uuid not null references public.cmim_queue_rooms(id) on delete cascade,
 user_id uuid not null,
 nick text not null check(length(btrim(nick)) between 2 and 80),
 rank_player_id text,
 tier text not null check(tier in ('S','A','B','C','D')),
 lane text check(lane in ('TOP','JG','MID','ADC','SUP')),
 status text not null default 'queued' check(status in ('queued','confirmed','left','removed')),
 side text check(side in ('A','B')),
 is_captain boolean not null default false,
 joined_at timestamptz not null default now(),
 confirmed_at timestamptz,
 primary key(room_id,user_id)
);
create index if not exists cmim_q_entries_order_idx on public.cmim_queue_entries(room_id,status,joined_at);

create table if not exists public.cmim_queue_picks (
 room_id uuid not null references public.cmim_queue_rooms(id) on delete cascade,
 pick_number integer not null check(pick_number between 1 and 8),
 side text not null check(side in ('A','B')),
 user_id uuid not null,
 nick text not null,
 tier text not null check(tier in ('S','A','B','C','D')),
 picked_at timestamptz not null default now(),
 primary key(room_id,pick_number), unique(room_id,user_id)
);

create table if not exists public.cmim_queue_reports (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.cmim_queue_rooms(id) on delete cascade,
 reporter_id uuid not null,
 reporter_nick text not null,
 reported_nick text not null check(length(btrim(reported_nick)) between 2 and 80),
 details text not null default '' check(length(details)<=500),
 status text not null default 'pending' check(status in ('pending','confirmed','dismissed')),
 reviewed_by uuid,
 review_note text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists cmim_q_reports_status_idx on public.cmim_queue_reports(status,created_at desc);

create table if not exists public.cmim_queue_audit (
 id bigint generated always as identity primary key,
 room_id uuid,
 actor_id uuid,
 action text not null,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

-- Todo acesso de escrita passa por funções validadas; sem INSERT/UPDATE direto.
revoke all on public.cmim_queue_rooms,public.cmim_queue_entries,public.cmim_queue_picks,
 public.cmim_queue_reports,public.cmim_queue_audit,public.cmim_queue_settings from anon,authenticated;
grant select on public.cmim_queue_rooms,public.cmim_queue_entries,public.cmim_queue_picks,
 public.cmim_queue_settings to authenticated;
grant select on public.cmim_queue_reports,public.cmim_queue_audit to authenticated;
alter table public.cmim_queue_rooms enable row level security;
alter table public.cmim_queue_entries enable row level security;
alter table public.cmim_queue_picks enable row level security;
alter table public.cmim_queue_reports enable row level security;
alter table public.cmim_queue_audit enable row level security;
alter table public.cmim_queue_settings enable row level security;
create policy q_rooms_read on public.cmim_queue_rooms for select to authenticated using (true);
create policy q_entries_read on public.cmim_queue_entries for select to authenticated using (true);
create policy q_picks_read on public.cmim_queue_picks for select to authenticated using (true);
create policy q_settings_read on public.cmim_queue_settings for select to authenticated using (true);
create policy q_reports_read on public.cmim_queue_reports for select to authenticated using (
 reporter_id=(select auth.uid()) or ((auth.jwt()->'app_metadata'->>'cmim_admin')='true')
);
create policy q_audit_read on public.cmim_queue_audit for select to authenticated using (
 ((auth.jwt()->'app_metadata'->>'cmim_admin')='true')
);

-- Não conceder privilégios públicos a funções auxiliares.
create or replace function cmim_internal.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from auth.users u where u.id=auth.uid() and u.raw_app_meta_data->>'cmim_admin'='true'
 );
$$;

create or replace function cmim_internal.try_start(p_room uuid) returns void language plpgsql security invoker set search_path='' as $$
declare n integer; a uuid; b uuid; seconds integer;
begin
 select count(*) into n from public.cmim_queue_entries where room_id=p_room and status='confirmed';
 if n<>10 then return; end if;
 select user_id into a from public.cmim_queue_entries where room_id=p_room and status='confirmed'
 order by case tier when 'S' then 1 when 'A' then 2 when 'B' then 3 when 'C' then 4 else 5 end,
 md5(p_room::text||user_id::text) limit 1;
 select user_id into b from public.cmim_queue_entries where room_id=p_room and status='confirmed' and user_id<>a
 order by case tier when 'S' then 1 when 'A' then 2 when 'B' then 3 when 'C' then 4 else 5 end,
 md5(p_room::text||user_id::text) limit 1;
 if a is null or b is null then raise exception 'Não foi possível selecionar capitães'; end if;
 select pick_seconds into seconds from public.cmim_queue_settings where id=1;
 update public.cmim_queue_entries set side=case when user_id=a then 'A' when user_id=b then 'B' else null end,
 is_captain=user_id in(a,b) where room_id=p_room;
 update public.cmim_queue_rooms set status='drafting',captain_a=a,captain_b=b,
 pick_number=1,pick_deadline=clock_timestamp()+make_interval(secs=>coalesce(seconds,60)),updated_at=now()
 where id=p_room and status in('scheduled','open','closed');
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
 values(p_room,null,'draft_auto_started',jsonb_build_object('captain_a',a,'captain_b',b));
end;
$$;

create or replace function public.cmim_q_join(p_room uuid) returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.cmim_queue_rooms%rowtype; p public.cmim_profiles%rowtype;
 n text; t text; oldstatus text;
begin
 if uid is null then raise exception 'Faça login para participar'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found then raise exception 'Sala não encontrada'; end if;
 if r.status not in('scheduled','open') or now()<r.opens_at or now()>r.closes_at then raise exception 'A fila não está aberta'; end if;
 select * into p from public.cmim_profiles where id=uid;
 if not found then raise exception 'Complete seu perfil no CMIM antes de entrar'; end if;
 t:=case when p.tier in('S','A','B','C','D') then p.tier when p.initial_tier in('S','A','B','C','D') then p.initial_tier else null end;
 if t is null then raise exception 'Seu tier ainda não foi definido pelo ADM'; end if;
 n:=btrim(p.nick)||'#'||btrim(p.tag);
 select status into oldstatus from public.cmim_queue_entries where room_id=p_room and user_id=uid;
 if oldstatus='removed' then raise exception 'Sua participação foi bloqueada pela administração'; end if;
 if oldstatus in('queued','confirmed') then return oldstatus; end if;
 insert into public.cmim_queue_entries(room_id,user_id,nick,rank_player_id,tier,lane,status)
 values(p_room,uid,n,p.rank_player_id,t,p.lane,'queued')
 on conflict(room_id,user_id) do update set nick=excluded.nick,rank_player_id=excluded.rank_player_id,
 tier=excluded.tier,lane=excluded.lane,status='queued',joined_at=now(),confirmed_at=null,side=null,is_captain=false;
 update public.cmim_queue_rooms set status='open',updated_at=now() where id=p_room and status='scheduled';
 return 'queued';
end;
$$;

create or replace function public.cmim_q_leave(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.cmim_queue_rooms%rowtype;
begin
 if uid is null then raise exception 'Faça login'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.status not in('scheduled','open','closed') then raise exception 'Não é possível sair com o draft iniciado'; end if;
 update public.cmim_queue_entries set status='left',confirmed_at=null where room_id=p_room and user_id=uid and status in('queued','confirmed');
end;
$$;

create or replace function public.cmim_q_confirm(p_room uuid) returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.cmim_queue_rooms%rowtype; pos integer; st text;
begin
 if uid is null then raise exception 'Faça login'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found then raise exception 'Sala não encontrada'; end if;
 if r.status not in('scheduled','open') or now()<r.opens_at or now()>r.closes_at then raise exception 'Confirmação encerrada'; end if;
 select status into st from public.cmim_queue_entries where room_id=p_room and user_id=uid;
 if st='confirmed' then return 'confirmed'; end if;
 if st is distinct from 'queued' then raise exception 'Entre na fila primeiro'; end if;
 select ord into pos from (
 select user_id,row_number() over(order by joined_at,user_id)::integer as ord
 from public.cmim_queue_entries where room_id=p_room and status in('queued','confirmed')
 ) q where user_id=uid;
 if pos is null or pos>10 then raise exception 'Você está na lista de espera; aguarde uma vaga'; end if;
 update public.cmim_queue_entries set status='confirmed',confirmed_at=now() where room_id=p_room and user_id=uid;
 perform cmim_internal.try_start(p_room);
 return 'confirmed';
end;
$$;

create or replace function public.cmim_q_report(p_room uuid,p_nick text,p_details text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid; who text;
begin
 if uid is null or not exists(select 1 from public.cmim_queue_entries where room_id=p_room and user_id=uid and status in('queued','confirmed'))
 then raise exception 'Entre na fila para reportar'; end if;
 if length(btrim(coalesce(p_nick,''))) not between 2 and 80 or length(coalesce(p_details,''))>500 then raise exception 'Informe nick válido e observação de até 500 caracteres'; end if;
 if exists(select 1 from public.cmim_queue_reports where room_id=p_room and reporter_id=uid
 and lower(reported_nick)=lower(btrim(p_nick)) and created_at>now()-interval '30 minutes')
 then raise exception 'Este reporte já foi enviado recentemente'; end if;
 select nick into who from public.cmim_queue_entries where room_id=p_room and user_id=uid;
 insert into public.cmim_queue_reports(room_id,reporter_id,reporter_nick,reported_nick,details)
 values(p_room,uid,who,btrim(p_nick),coalesce(p_details,'')) returning id into rid;
 return rid;
end;
$$;

create or replace function public.cmim_q_pick(p_room uuid,p_player uuid) returns integer language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.cmim_queue_rooms%rowtype; e public.cmim_queue_entries%rowtype;
 side_to_pick text; sec integer;
begin
 if uid is null then raise exception 'Faça login'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.status<>'drafting' then raise exception 'Draft não está em andamento'; end if;
 side_to_pick:=case when r.pick_number%2=1 then 'A' else 'B' end;
 if uid is distinct from (case when side_to_pick='A' then r.captain_a else r.captain_b end) then raise exception 'Não é sua vez de escolher'; end if;
 if r.pick_deadline is null or clock_timestamp()>r.pick_deadline then raise exception 'O tempo acabou; solicite retomada ao ADM'; end if;
 select * into e from public.cmim_queue_entries where room_id=p_room and user_id=p_player for update;
 if not found or e.status<>'confirmed' or e.side is not null then raise exception 'Jogador indisponível'; end if;
 insert into public.cmim_queue_picks(room_id,pick_number,side,user_id,nick,tier)
 values(p_room,r.pick_number,side_to_pick,e.user_id,e.nick,e.tier);
 update public.cmim_queue_entries set side=side_to_pick where room_id=p_room and user_id=p_player;
 select pick_seconds into sec from public.cmim_queue_settings where id=1;
 update public.cmim_queue_rooms set pick_number=r.pick_number+1,
 status=case when r.pick_number=8 then 'finished' else 'drafting' end,
 pick_deadline=case when r.pick_number=8 then null else clock_timestamp()+make_interval(secs=>coalesce(sec,60)) end,
 updated_at=now() where id=p_room;
 return r.pick_number;
end;
$$;

create or replace function public.cmim_q_admin_create(p_title text,p_opens timestamptz,p_closes timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if length(btrim(coalesce(p_title,''))) not between 3 and 120 or p_closes<=p_opens then raise exception 'Título ou horários inválidos'; end if;
 insert into public.cmim_queue_rooms(title,opens_at,closes_at,created_by) values(btrim(p_title),p_opens,p_closes,auth.uid()) returning id into rid;
 insert into public.cmim_queue_audit(room_id,actor_id,action) values(rid,auth.uid(),'room_created');
 return rid;
end;
$$;

create or replace function public.cmim_q_admin_room(p_room uuid,p_action text,p_title text default null,p_opens timestamptz default null,p_closes timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.cmim_queue_rooms%rowtype; secs integer; lastpick public.cmim_queue_picks%rowtype;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found then raise exception 'Sala não encontrada'; end if;
 if p_action='edit' then
  if r.status in('drafting','paused','finished','canceled') then raise exception 'Não edite horário durante o draft'; end if;
  if coalesce(p_closes,r.closes_at)<=coalesce(p_opens,r.opens_at) or length(btrim(coalesce(p_title,r.title))) not between 3 and 120 then raise exception 'Dados inválidos'; end if;
  update public.cmim_queue_rooms set title=coalesce(nullif(btrim(p_title),''),r.title),opens_at=coalesce(p_opens,r.opens_at),closes_at=coalesce(p_closes,r.closes_at),updated_at=now() where id=p_room;
 elsif p_action='close' and r.status in('scheduled','open') then
  update public.cmim_queue_rooms set status='closed',updated_at=now() where id=p_room;
 elsif p_action='reopen' and r.status='closed' then
  update public.cmim_queue_rooms set status='open',updated_at=now() where id=p_room;
 elsif p_action='cancel' and r.status not in('finished','canceled') then
  update public.cmim_queue_rooms set status='canceled',pick_deadline=null,updated_at=now() where id=p_room;
 elsif p_action='pause' and r.status='drafting' then
  update public.cmim_queue_rooms set status='paused',pick_deadline=null,updated_at=now() where id=p_room;
 elsif p_action='resume' and r.status='paused' then
  select pick_seconds into secs from public.cmim_queue_settings where id=1;
  update public.cmim_queue_rooms set status='drafting',pick_deadline=clock_timestamp()+make_interval(secs=>coalesce(secs,60)),updated_at=now() where id=p_room;
 elsif p_action='undo' and r.status in('drafting','paused','finished') and r.pick_number>1 then
  select * into lastpick from public.cmim_queue_picks where room_id=p_room and pick_number=r.pick_number-1;
  if not found then raise exception 'Escolha anterior não encontrada'; end if;
  delete from public.cmim_queue_picks where room_id=p_room and pick_number=lastpick.pick_number;
  update public.cmim_queue_entries set side=null where room_id=p_room and user_id=lastpick.user_id;
  select pick_seconds into secs from public.cmim_queue_settings where id=1;
  update public.cmim_queue_rooms set status='paused',pick_number=r.pick_number-1,pick_deadline=null,updated_at=now() where id=p_room;
 else raise exception 'Ação não permitida neste estado';
 end if;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload) values(p_room,auth.uid(),p_action,jsonb_build_object('title',p_title));
end;
$$;

create or replace function public.cmim_q_admin_captain(p_room uuid,p_side text,p_player uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.cmim_queue_rooms%rowtype; former uuid;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_side is null or p_side not in('A','B') then raise exception 'Lado inválido'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.status not in('drafting','paused') or r.pick_number<>1 then raise exception 'Só é possível corrigir os capitães antes da primeira escolha'; end if;
 if not exists(select 1 from public.cmim_queue_entries where room_id=p_room and user_id=p_player and status='confirmed' and side is null)
 then raise exception 'Selecione um jogador confirmado que não esteja em outro time'; end if;
 former:=case when p_side='A' then r.captain_a else r.captain_b end;
 update public.cmim_queue_entries set side=null,is_captain=false where room_id=p_room and user_id=former;
 update public.cmim_queue_entries set side=p_side,is_captain=true where room_id=p_room and user_id=p_player;
 update public.cmim_queue_rooms set captain_a=case when p_side='A' then p_player else captain_a end,
 captain_b=case when p_side='B' then p_player else captain_b end,updated_at=now() where id=p_room;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload) values(p_room,auth.uid(),'captain_override',jsonb_build_object('side',p_side,'user',p_player));
end;
$$;

create or replace function public.cmim_q_admin_entry(p_room uuid,p_user uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare r public.cmim_queue_rooms%rowtype; n integer;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_status is null or p_status not in('queued','confirmed','removed') then raise exception 'Status inválido'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.status not in('scheduled','open','closed') then raise exception 'A fila não pode ser editada após iniciar o draft'; end if;
 if not exists(select 1 from public.cmim_queue_entries where room_id=p_room and user_id=p_user) then raise exception 'Jogador não está na fila'; end if;
 select count(*) into n from public.cmim_queue_entries where room_id=p_room and status='confirmed' and user_id<>p_user;
 if p_status='confirmed' and n>=10 then raise exception 'Já existem dez confirmados'; end if;
 update public.cmim_queue_entries set status=p_status,confirmed_at=case when p_status='confirmed' then now() else null end where room_id=p_room and user_id=p_user;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
 values(p_room,auth.uid(),'entry_'||p_status,jsonb_build_object('user',p_user));
 if p_status='confirmed' then perform cmim_internal.try_start(p_room); end if;
end;
$$;

create or replace function public.cmim_q_admin_tier(p_user uuid,p_tier text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_tier is null or p_tier not in('S','A','B','C','D') then raise exception 'Tier inválido'; end if;
 update public.cmim_profiles set tier=p_tier,updated_at=now() where id=p_user;
 if not found then raise exception 'Perfil não encontrado'; end if;
 update public.cmim_queue_entries e set tier=p_tier where user_id=p_user and exists(
 select 1 from public.cmim_queue_rooms r where r.id=e.room_id and r.status in('scheduled','open','closed'));
 insert into public.cmim_queue_audit(actor_id,action,payload)
 values(auth.uid(),'tier_changed',jsonb_build_object('user',p_user,'tier',p_tier));
end;
$$;

create or replace function public.cmim_q_admin_report(p_report uuid,p_status text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_status is null or p_status not in('pending','confirmed','dismissed') or length(coalesce(p_note,''))>500 then raise exception 'Parecer inválido'; end if;
 update public.cmim_queue_reports set status=p_status,reviewed_by=auth.uid(),review_note=coalesce(p_note,''),updated_at=now() where id=p_report;
 if not found then raise exception 'Reporte não encontrado'; end if;
 insert into public.cmim_queue_audit(actor_id,action,payload) values(auth.uid(),'delay_report_review',jsonb_build_object('report_id',p_report,'status',p_status));
end;
$$;

create or replace function public.cmim_q_admin_settings(p_pick_seconds integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_pick_seconds is null or p_pick_seconds not between 15 and 300 then raise exception 'Tempo deve ficar entre 15 e 300 segundos'; end if;
 update public.cmim_queue_settings set pick_seconds=p_pick_seconds,updated_at=now() where id=1;
 insert into public.cmim_queue_audit(actor_id,action,payload) values(auth.uid(),'settings_updated',jsonb_build_object('pick_seconds',p_pick_seconds));
end;
$$;

revoke all on function public.cmim_q_join(uuid),public.cmim_q_leave(uuid),public.cmim_q_confirm(uuid),
 public.cmim_q_report(uuid,text,text),public.cmim_q_pick(uuid,uuid),public.cmim_q_admin_create(text,timestamptz,timestamptz),
 public.cmim_q_admin_room(uuid,text,text,timestamptz,timestamptz),public.cmim_q_admin_captain(uuid,text,uuid),public.cmim_q_admin_entry(uuid,uuid,text),
 public.cmim_q_admin_tier(uuid,text),public.cmim_q_admin_report(uuid,text,text),public.cmim_q_admin_settings(integer) from public,anon;
grant execute on function public.cmim_q_join(uuid),public.cmim_q_leave(uuid),public.cmim_q_confirm(uuid),
 public.cmim_q_report(uuid,text,text),public.cmim_q_pick(uuid,uuid),public.cmim_q_admin_create(text,timestamptz,timestamptz),
 public.cmim_q_admin_room(uuid,text,text,timestamptz,timestamptz),public.cmim_q_admin_captain(uuid,text,uuid),public.cmim_q_admin_entry(uuid,uuid,text),
 public.cmim_q_admin_tier(uuid,text),public.cmim_q_admin_report(uuid,text,text),public.cmim_q_admin_settings(integer) to authenticated;
commit;