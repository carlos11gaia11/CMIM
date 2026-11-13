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
revoke all on function public.cmim_q_admin_captain_tournament(uuid,text,uuid) from public,anon;
grant execute on function public.cmim_q_admin_captain_tournament(uuid,text,uuid) to authenticated,service_role;
