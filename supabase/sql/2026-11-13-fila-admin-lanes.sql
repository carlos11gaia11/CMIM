-- Permite ao administrador corrigir a lane de um jogador da fila sem alterar o perfil/ranking.
create or replace function public.cmim_q_admin_set_lane(p_room uuid,p_user uuid,p_lane text)
returns void language plpgsql security definer set search_path=''
as $fn$
declare room_status text;
begin
 if not cmim_internal.is_admin() then raise exception 'Acesso administrativo necessário'; end if;
 if p_lane not in ('TOP','JG','MID','ADC','SUP') or p_lane is null then raise exception 'Lane inválida'; end if;
 select status into room_status from public.cmim_queue_rooms where id=p_room for update;
 if not found or room_status not in ('scheduled','open','closed') then
  raise exception 'Não é possível alterar lanes após iniciar o draft';
 end if;
 update public.cmim_queue_entries set lane=p_lane
 where room_id=p_room and user_id=p_user and status in ('queued','confirmed');
 if not found then raise exception 'O jogador não está ativo na fila'; end if;
 insert into public.cmim_queue_audit(room_id,actor_id,action,payload)
 values(p_room,auth.uid(),'admin_lane_override',jsonb_build_object('user',p_user,'lane',p_lane));
end;
$fn$;
revoke all on function public.cmim_q_admin_set_lane(uuid,uuid,text) from public,anon;
grant execute on function public.cmim_q_admin_set_lane(uuid,uuid,text) to authenticated,service_role;
