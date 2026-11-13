-- CMIM: permitir que administradores excluam a fila/sala selecionada.
-- Exclui os dados associados àquela sala (inscritos, picks, reportes e log operacional).
-- Mantém registro mínimo de exclusão para auditoria; NÃO altera cmim_rank, auth.users ou perfis.
create or replace function public.cmim_q_admin_delete_room(
  p_room uuid,
  p_expected_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r public.cmim_queue_rooms%rowtype;
  n_entries integer;
  n_picks integer;
  n_reports integer;
begin
  if auth.uid() is null or not cmim_internal.is_admin() then
    raise exception 'Acesso administrativo necessário';
  end if;

  select * into r
  from public.cmim_queue_rooms
  where id = p_room
  for update;

  if not found then
    raise exception 'A fila já foi excluída ou não existe';
  end if;

  if p_expected_title is null or p_expected_title is distinct from r.title then
    raise exception 'O nome da fila não corresponde. Atualize o painel antes de excluir';
  end if;

  select count(*) into n_entries from public.cmim_queue_entries where room_id = p_room;
  select count(*) into n_picks from public.cmim_queue_picks where room_id = p_room;
  select count(*) into n_reports from public.cmim_queue_reports where room_id = p_room;

  -- Histórico operacional da sala sai junto com ela.
  -- O registro de exclusão é separado e sobrevive ao DELETE da sala.
  delete from public.cmim_queue_audit where room_id = p_room;

  -- FKs ON DELETE CASCADE removem apenas os dados pertencentes à sala escolhida.
  delete from public.cmim_queue_rooms where id = p_room;

  insert into public.cmim_queue_audit(room_id, actor_id, action, payload)
  values (
    p_room,
    auth.uid(),
    'room_deleted',
    jsonb_build_object(
      'title', r.title,
      'format', r.team_count,
      'previous_status', r.status,
      'entries_removed', n_entries,
      'picks_removed', n_picks,
      'reports_removed', n_reports
    )
  );
end;
$function$;

revoke all on function public.cmim_q_admin_delete_room(uuid,text) from public,anon;
grant execute on function public.cmim_q_admin_delete_room(uuid,text) to authenticated,service_role;
comment on function public.cmim_q_admin_delete_room(uuid,text) is
 'Exclusão permanente de sala CMIM com confirmação do nome e validação de ADM; não altera ranking ou contas.';
