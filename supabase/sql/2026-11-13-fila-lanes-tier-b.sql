-- CMIM: lane escolhida por sala + tier B operacional como fallback.
-- Não altera cmim_rank, cmim_player_meta, auth.users ou tiers cadastrados.
create or replace function public.cmim_q_join_lane(p_room uuid, p_lane text)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
 uid uuid := auth.uid();
 r public.cmim_queue_rooms%rowtype;
 p public.cmim_profiles%rowtype;
 t text;
 n text;
 oldstatus text;
begin
 if uid is null then raise exception 'Faça login para participar'; end if;
 if p_lane is null or p_lane not in ('TOP','JG','MID','ADC','SUP') then
   raise exception 'Selecione TOP, JG, MID, ADC ou SUP';
 end if;
 select * into r from public.cmim_queue_rooms where id=p_room for update;
 if not found then raise exception 'Sala não encontrada'; end if;
 if r.status not in ('scheduled','open') or clock_timestamp()<r.opens_at or clock_timestamp()>r.closes_at then
   raise exception 'A fila não está aberta';
 end if;
 select * into p from public.cmim_profiles where id=uid;
 if not found then raise exception 'Complete seu perfil CMIM antes de entrar'; end if;
 t := case when p.tier in ('S','A','B','C','D') then p.tier
           when p.initial_tier in ('S','A','B','C','D') then p.initial_tier
           else 'B' end;
 n := btrim(p.nick) || '#' || btrim(p.tag);
 select status into oldstatus from public.cmim_queue_entries where room_id=p_room and user_id=uid;
 if oldstatus='removed' then raise exception 'Sua participação foi bloqueada pela administração'; end if;
 if oldstatus in ('queued','confirmed') then
   update public.cmim_queue_entries
      set lane=p_lane, tier=case when tier in ('S','A','B','C','D') then tier else t end
    where room_id=p_room and user_id=uid;
   return oldstatus;
 end if;
 insert into public.cmim_queue_entries(room_id,user_id,nick,rank_player_id,tier,lane,status)
 values (p_room,uid,n,p.rank_player_id,t,p_lane,'queued')
 on conflict (room_id,user_id) do update
 set nick=excluded.nick,rank_player_id=excluded.rank_player_id,
     tier=excluded.tier,lane=excluded.lane,status='queued',
     joined_at=now(),confirmed_at=null,side=null,is_captain=false;
 update public.cmim_queue_rooms set status='open',updated_at=now()
 where id=p_room and status='scheduled';
 return 'queued';
end;
$fn$;

-- Compatibilidade: clientes antigos que ainda chamam cmim_q_join(p_room).
create or replace function public.cmim_q_join(p_room uuid)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare chosen_lane text;
begin
 select lane into chosen_lane from public.cmim_profiles where id=auth.uid();
 if chosen_lane not in ('TOP','JG','MID','ADC','SUP') or chosen_lane is null then
   raise exception 'Selecione uma lane na página de fila';
 end if;
 return public.cmim_q_join_lane(p_room,chosen_lane);
end;
$fn$;

revoke all on function public.cmim_q_join_lane(uuid,text) from public, anon;
grant execute on function public.cmim_q_join_lane(uuid,text) to authenticated, service_role;
comment on function public.cmim_q_join_lane(uuid,text) is
 'Jogador escolhe lane livre por sala; tier B somente como fallback de fila quando não há tier válido; ranking intocado.';
