
-- CMIM: salas de torneio para 4 times, espelhando o draft manual.
-- 20 jogadores / 4 por lane / 4 capitães de uma lane escolhida pelo ADM.
-- Snake: ABCDDCBA repetido, com auto-atribuição do último jogador de cada lane.
-- Não altera cmim_rank, auth.users, cmim_profiles ou o draft manual.
alter table public.cmim_queue_rooms
 add column if not exists team_count integer not null default 2,
 add column if not exists captain_lane text not null default 'MID',
 add column if not exists captain_c uuid,
 add column if not exists captain_d uuid,
 add column if not exists turn_index integer not null default 0;

alter table public.cmim_queue_rooms
 add constraint cmim_queue_rooms_team_count_check check (team_count in (2,4));
alter table public.cmim_queue_rooms
 add constraint cmim_queue_rooms_captain_lane_check check (captain_lane in ('TOP','JG','MID','ADC','SUP'));

alter table public.cmim_queue_rooms drop constraint if exists cmim_queue_rooms_pick_number_check;
alter table public.cmim_queue_rooms add constraint cmim_queue_rooms_pick_number_check check (pick_number between 1 and 17);
alter table public.cmim_queue_entries drop constraint if exists cmim_queue_entries_side_check;
alter table public.cmim_queue_entries add constraint cmim_queue_entries_side_check check (side in ('A','B','C','D'));
alter table public.cmim_queue_picks drop constraint if exists cmim_queue_picks_pick_number_check;
alter table public.cmim_queue_picks add constraint cmim_queue_picks_pick_number_check check (pick_number between 1 and 16);
alter table public.cmim_queue_picks drop constraint if exists cmim_queue_picks_side_check;
alter table public.cmim_queue_picks add constraint cmim_queue_picks_side_check check (side in ('A','B','C','D'));

alter table public.cmim_queue_picks
 add column if not exists automatic boolean not null default false,
 add column if not exists turn_index integer;

create or replace function cmim_internal.enforce_two_per_lane()
returns trigger language plpgsql security definer set search_path=''
as $func$
declare room public.cmim_queue_rooms%rowtype; others integer;
begin
 if new.status not in ('queued','confirmed') then return new; end if;
 if new.lane is null or new.lane not in ('TOP','JG','MID','ADC','SUP') then
   raise exception 'Selecione TOP, JG, MID, ADC ou SUP';
 end if;
 select * into room from public.cmim_queue_rooms where id=new.room_id for update;
 if not found then raise exception 'Sala não encontrada'; end if;
 select count(*) into others from public.cmim_queue_entries
 where room_id=new.room_id and lane=new.lane and status in ('queued','confirmed')
 and user_id is distinct from new.user_id;
 if others >= room.team_count then
   raise exception 'A lane % está completa (%/%). Escolha outra lane.',new.lane,room.team_count,room.team_count;
 end if;
 return new;
end;
$func$;

create or replace function cmim_internal.tournament_side(p_turn integer)
returns text language sql immutable set search_path=''
as $func$
 select (array['A','B','C','D','D','C','B','A'])[1 + (p_turn % 8)]
$func$;

create or replace function cmim_internal.try_start(p_room uuid)
returns void language plpgsql set search_path=''
as $func$
declare r public.cmim_queue_rooms%rowtype; n integer; a uuid; b uuid;
        caps uuid[]; seconds integer;
begin
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.status not in ('scheduled','open','closed') then return; end if;
 select count(*) into n from public.cmim_queue_entries where room_id=p_room and status='confirmed';
 if n <> r.team_count*5 then return; end if;
 if r.team_count=2 then
   select user_id into a from public.cmim_queue_entries where room_id=p_room and status='confirmed'
   order by case tier when 'S' then 1 when 'A' then 2 when 'B' then 3 when 'C' then 4 else 5 end,
   md5(p_room::text||user_id::text) limit 1;
   select user_id into b from public.cmim_queue_entries where room_id=p_room and status='confirmed' and user_id<>a
   order by case tier when 'S' then 1 when 'A' then 2 when 'B' then 3 when 'C' then 4 else 5 end,
   md5(p_room::text||user_id::text) limit 1;
   if a is null or b is null then raise exception 'Não foi possível selecionar capitães'; end if;
   update public.cmim_queue_entries
   set side=case when user_id=a then 'A' when user_id=b then 'B' else null end,
       is_captain=user_id in (a,b) where room_id=p_room;
   select pick_seconds into seconds from public.cmim_queue_settings where id=1;
   update public.cmim_queue_rooms set status='drafting',captain_a=a,captain_b=b,
   pick_number=1,turn_index=0,
   pick_deadline=clock_timestamp()+make_interval(secs=>coalesce(seconds,60)),updated_at=now()
   where id=p_room;
   insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
   values(p_room,null,'draft_auto_started',jsonb_build_object('captain_a',a,'captain_b',b,'team_count',2));
 else
   -- Capitanias refletidas do draft manual: todos da lane de capitães.
   select array_agg(user_id order by case tier when 'S' then 1 when 'A' then 2
     when 'B' then 3 when 'C' then 4 else 5 end,md5(p_room::text||user_id::text))
   into caps from public.cmim_queue_entries
   where room_id=p_room and status='confirmed' and lane=r.captain_lane;
   if coalesce(array_length(caps,1),0)<>4 then
     raise exception 'O torneio exige quatro capitães na lane %',r.captain_lane;
   end if;
   update public.cmim_queue_entries
   set side=case when user_id=caps[1] then 'A' when user_id=caps[2] then 'B'
        when user_id=caps[3] then 'C' when user_id=caps[4] then 'D' else null end,
       is_captain=user_id=any(caps) where room_id=p_room;
   select pick_seconds into seconds from public.cmim_queue_settings where id=1;
   update public.cmim_queue_rooms
   set status='drafting',captain_a=caps[1],captain_b=caps[2],
       captain_c=caps[3],captain_d=caps[4],pick_number=1,turn_index=0,
       pick_deadline=clock_timestamp()+make_interval(secs=>coalesce(seconds,60)),updated_at=now()
   where id=p_room;
   insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
   values(p_room,null,'tournament_draft_started',
     jsonb_build_object('captains',to_jsonb(caps),'captain_lane',r.captain_lane,'team_count',4));
 end if;
end;
$func$;

CREATE OR REPLACE FUNCTION public.cmim_q_confirm(p_room uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if pos is null or pos>r.team_count*5 then raise exception 'Você está na lista de espera; aguarde uma vaga'; end if;
 update public.cmim_queue_entries set status='confirmed',confirmed_at=now() where room_id=p_room and user_id=uid;
 perform cmim_internal.try_start(p_room);
 return 'confirmed';
end;
$function$;

CREATE OR REPLACE FUNCTION public.cmim_q_admin_entry(p_room uuid, p_user uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.cmim_queue_rooms%rowtype; n integer;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_status not in('queued','confirmed','removed') then raise exception 'Status inválido'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.status not in('scheduled','open','closed') then raise exception 'A fila não pode ser editada após iniciar o draft'; end if;
 if not exists(select 1 from public.cmim_queue_entries where room_id=p_room and user_id=p_user) then raise exception 'Jogador não está na fila'; end if;
 select count(*) into n from public.cmim_queue_entries where room_id=p_room and status='confirmed' and user_id<>p_user;
 if p_status='confirmed' and n>=r.team_count*5 then raise exception 'Todos os jogadores já confirmaram'; end if;
 update public.cmim_queue_entries set status=p_status,confirmed_at=case when p_status='confirmed' then now() else null end where room_id=p_room and user_id=p_user;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
 values(p_room,auth.uid(),'entry_'||p_status,jsonb_build_object('user',p_user));
 if p_status='confirmed' then perform cmim_internal.try_start(p_room); end if;
end;
$function$;

create or replace function public.cmim_q_admin_create_tournament(
 p_title text,p_opens timestamptz,p_closes timestamptz,p_captain_lane text default 'MID')
returns uuid language plpgsql security definer set search_path=''
as $func$
declare rid uuid;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if length(btrim(coalesce(p_title,''))) not between 3 and 120 or p_closes<=p_opens
 then raise exception 'Título ou horários inválidos'; end if;
 if p_captain_lane is null or p_captain_lane not in('TOP','JG','MID','ADC','SUP')
 then raise exception 'Lane de capitães inválida'; end if;
 insert into public.cmim_queue_rooms(title,opens_at,closes_at,created_by,team_count,captain_lane)
 values(btrim(p_title),p_opens,p_closes,auth.uid(),4,p_captain_lane) returning id into rid;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
 values(rid,auth.uid(),'tournament_created',jsonb_build_object('teams',4,'captain_lane',p_captain_lane));
 return rid;
end;
$func$;

create or replace function public.cmim_q_admin_tournament_lane(p_room uuid,p_lane text)
returns void language plpgsql security definer set search_path=''
as $func$
declare r public.cmim_queue_rooms%rowtype;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_lane is null or p_lane not in ('TOP','JG','MID','ADC','SUP') then raise exception 'Lane inválida'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.team_count<>4 or r.status not in ('scheduled','open','closed') then
   raise exception 'A lane de capitães só pode ser corrigida antes do draft';
 end if;
 update public.cmim_queue_rooms set captain_lane=p_lane,updated_at=now() where id=p_room;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
 values(p_room,auth.uid(),'tournament_captain_lane_changed',jsonb_build_object('lane',p_lane));
end;
$func$;

create or replace function public.cmim_q_pick_tournament(p_room uuid,p_player uuid)
returns integer language plpgsql security definer set search_path=''
as $func$
declare
 uid uuid:=auth.uid(); r public.cmim_queue_rooms%rowtype; e public.cmim_queue_entries%rowtype;
 turn integer; active_side text; captain uuid; next_pick integer; secs integer;
 lane_name text; remaining integer; missing integer; forced_side text;
 forced_user uuid; forced_nick text; forced_tier text;
 assigned_count integer; changed boolean;
begin
 if uid is null then raise exception 'Faça login'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.team_count<>4 or r.status<>'drafting' then
   raise exception 'O torneio não está em andamento';
 end if;
 if r.pick_deadline is null or clock_timestamp()>r.pick_deadline then
   raise exception 'O tempo acabou; solicite retomada ao ADM';
 end if;
 turn:=r.turn_index;
 while turn<16 loop
   active_side:=cmim_internal.tournament_side(turn);
   exit when (select count(*) from public.cmim_queue_entries where room_id=p_room and side=active_side)<5;
   turn:=turn+1;
 end loop;
 if turn>=16 then raise exception 'O draft já foi concluído'; end if;
 captain:=case active_side when 'A' then r.captain_a when 'B' then r.captain_b
               when 'C' then r.captain_c else r.captain_d end;
 if uid is distinct from captain then raise exception 'Não é sua vez de escolher'; end if;
 select * into e from public.cmim_queue_entries where room_id=p_room and user_id=p_player for update;
 if not found or e.status<>'confirmed' or e.side is not null or e.lane=r.captain_lane then
   raise exception 'Jogador indisponível';
 end if;
 if exists(select 1 from public.cmim_queue_entries
           where room_id=p_room and side=active_side and lane=e.lane) then
   raise exception 'O time já tem um jogador da lane %',e.lane;
 end if;
 next_pick:=r.pick_number;
 insert into public.cmim_queue_picks(room_id,pick_number,side,user_id,nick,tier,automatic,turn_index)
 values(p_room,next_pick,active_side,e.user_id,e.nick,e.tier,false,turn);
 update public.cmim_queue_entries set side=active_side where room_id=p_room and user_id=e.user_id;
 next_pick:=next_pick+1;
 -- Espelha autoAssign() do draft manual: última possibilidade de uma lane.
 loop
   changed:=false;
   foreach lane_name in array array['TOP','JG','MID','ADC','SUP'] loop
     if lane_name=r.captain_lane then continue; end if;
     select count(*) into remaining from public.cmim_queue_entries
     where room_id=p_room and status='confirmed' and lane=lane_name and side is null;
     if remaining<>1 then continue; end if;
     select count(*) into missing from (values('A'),('B'),('C'),('D')) as t(side)
     where not exists(select 1 from public.cmim_queue_entries q
                      where q.room_id=p_room and q.side=t.side and q.lane=lane_name);
     if missing<>1 then continue; end if;
     select t.side into forced_side from (values('A'),('B'),('C'),('D')) as t(side)
     where not exists(select 1 from public.cmim_queue_entries q
                      where q.room_id=p_room and q.side=t.side and q.lane=lane_name);
     select user_id,nick,tier into forced_user,forced_nick,forced_tier
     from public.cmim_queue_entries where room_id=p_room and status='confirmed'
       and lane=lane_name and side is null;
     update public.cmim_queue_entries set side=forced_side
     where room_id=p_room and user_id=forced_user;
     insert into public.cmim_queue_picks(room_id,pick_number,side,user_id,nick,tier,automatic,turn_index)
     values(p_room,next_pick,forced_side,forced_user,forced_nick,forced_tier,true,null);
     next_pick:=next_pick+1;
     changed:=true;
     exit;
   end loop;
   exit when not changed;
 end loop;
 select count(*) into assigned_count from public.cmim_queue_entries
 where room_id=p_room and status='confirmed' and side is not null;
 turn:=turn+1;
 while turn<16 and assigned_count<20 loop
   active_side:=cmim_internal.tournament_side(turn);
   exit when (select count(*) from public.cmim_queue_entries where room_id=p_room and side=active_side)<5;
   turn:=turn+1;
 end loop;
 if assigned_count<20 and turn>=16 then
   raise exception 'Draft inconsistente: ainda há jogadores sem time';
 end if;
 select pick_seconds into secs from public.cmim_queue_settings where id=1;
 update public.cmim_queue_rooms set
   pick_number=next_pick,turn_index=turn,
   status=case when assigned_count=20 then 'finished' else 'drafting' end,
   pick_deadline=case when assigned_count=20 then null
       else clock_timestamp()+make_interval(secs=>coalesce(secs,60)) end,
   updated_at=now()
 where id=p_room;
 return next_pick-1;
end;
$func$;

-- CMIM: corrigir os quatro capitães do torneio por troca entre lados.
-- Todos os jogadores da lane de capitães já estão alocados; não há "capitão livre".
create or replace function public.cmim_q_admin_captain_tournament(p_room uuid,p_side text,p_player uuid)
returns void language plpgsql security definer set search_path=''
as $fn$
declare r public.cmim_queue_rooms%rowtype; former uuid; current_side text;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_side not in('A','B','C','D') then raise exception 'Time inválido'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.team_count<>4 or r.status not in('drafting','paused') or r.pick_number<>1 then
   raise exception 'Capitães só podem ser reorganizados antes do primeiro pick';
 end if;
 select e.side into current_side from public.cmim_queue_entries e
 where e.room_id=p_room and e.user_id=p_player and e.status='confirmed'
 and e.is_captain and e.lane=r.captain_lane and e.side in ('A','B','C','D');
 if current_side is null then raise exception 'Selecione um dos quatro capitães confirmados'; end if;
 if current_side=p_side then return; end if;
 former:=case p_side when 'A' then r.captain_a when 'B' then r.captain_b
          when 'C' then r.captain_c else r.captain_d end;
 if former is null then raise exception 'O lado selecionado não possui capitão'; end if;
 update public.cmim_queue_entries e set
 side=case when e.user_id=p_player then p_side else current_side end
 where e.room_id=p_room and e.user_id in (p_player,former);
 update public.cmim_queue_rooms set
 captain_a=case when p_side='A' then p_player when current_side='A' then former else captain_a end,
 captain_b=case when p_side='B' then p_player when current_side='B' then former else captain_b end,
 captain_c=case when p_side='C' then p_player when current_side='C' then former else captain_c end,
 captain_d=case when p_side='D' then p_player when current_side='D' then former else captain_d end,
 updated_at=now() where id=p_room;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
 values(p_room,auth.uid(),'tournament_captains_swapped',
        jsonb_build_object('captain',p_player,'from',current_side,'to',p_side));
end;
$fn$;

create or replace function public.cmim_q_admin_undo_tournament(p_room uuid)
returns void language plpgsql security definer set search_path=''
as $func$
declare r public.cmim_queue_rooms%rowtype; lastmanual public.cmim_queue_picks%rowtype; item record;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found or r.team_count<>4 or r.status not in('drafting','paused','finished')
 then raise exception 'Não é possível desfazer neste momento'; end if;
 select * into lastmanual from public.cmim_queue_picks
 where room_id=p_room and not automatic order by pick_number desc limit 1;
 if not found then raise exception 'Nenhuma escolha manual para desfazer'; end if;
 for item in select user_id from public.cmim_queue_picks
             where room_id=p_room and pick_number>=lastmanual.pick_number loop
   update public.cmim_queue_entries set side=null
   where room_id=p_room and user_id=item.user_id;
 end loop;
 delete from public.cmim_queue_picks
 where room_id=p_room and pick_number>=lastmanual.pick_number;
 update public.cmim_queue_rooms set status='paused',pick_deadline=null,
   pick_number=lastmanual.pick_number,turn_index=lastmanual.turn_index,updated_at=now()
 where id=p_room;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
 values(p_room,auth.uid(),'tournament_undo',jsonb_build_object('pick',lastmanual.pick_number));
end;
$func$;

revoke all on function public.cmim_q_admin_create_tournament(text,timestamptz,timestamptz,text) from public,anon;
revoke all on function public.cmim_q_admin_tournament_lane(uuid,text) from public,anon;
revoke all on function public.cmim_q_admin_captain_tournament(uuid,text,uuid) from public,anon;
revoke all on function public.cmim_q_admin_undo_tournament(uuid) from public,anon;
revoke all on function public.cmim_q_pick_tournament(uuid,uuid) from public,anon;
grant execute on function public.cmim_q_admin_create_tournament(text,timestamptz,timestamptz,text) to authenticated,service_role;
grant execute on function public.cmim_q_admin_tournament_lane(uuid,text) to authenticated,service_role;
grant execute on function public.cmim_q_admin_captain_tournament(uuid,text,uuid) to authenticated,service_role;
grant execute on function public.cmim_q_admin_undo_tournament(uuid) to authenticated,service_role;
grant execute on function public.cmim_q_pick_tournament(uuid,uuid) to authenticated,service_role;
revoke all on function cmim_internal.tournament_side(integer) from public,anon,authenticated;
