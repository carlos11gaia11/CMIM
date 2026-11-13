-- CMIM In-House: máximo de 2 participantes ativos em cada lane por sala.
-- É uma regra transacional: trava a sala antes de contar as vagas.
-- Não altera autenticação, perfis, ranking nem a formação manual de times.
create or replace function cmim_internal.enforce_two_per_lane()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_count integer;
  room_found uuid;
begin
  if new.status not in ('queued','confirmed') then
    return new;
  end if;

  if new.lane is null or new.lane not in ('TOP','JG','MID','ADC','SUP') then
    raise exception 'Selecione uma lane válida: TOP, JG, MID, ADC ou SUP';
  end if;

  -- Todas as entradas e correções concorrentes na mesma sala
  -- disputam o mesmo row-lock, impedindo uma terceira vaga.
  select id into room_found
  from public.cmim_queue_rooms
  where id = new.room_id
  for update;
  if room_found is null then
    raise exception 'Sala não encontrada';
  end if;

  select count(*) into existing_count
  from public.cmim_queue_entries e
  where e.room_id = new.room_id
    and e.lane = new.lane
    and e.status in ('queued','confirmed')
    and e.user_id is distinct from new.user_id;

  if existing_count >= 2 then
    raise exception 'A lane % está completa (2/2). Escolha outra lane ou aguarde uma vaga.', new.lane;
  end if;
  return new;
end;
$$;

drop trigger if exists cmim_queue_lane_capacity on public.cmim_queue_entries;
create trigger cmim_queue_lane_capacity
before insert or update of room_id, lane, status on public.cmim_queue_entries
for each row execute function cmim_internal.enforce_two_per_lane();

revoke all on function cmim_internal.enforce_two_per_lane() from public, anon, authenticated;
comment on function cmim_internal.enforce_two_per_lane() is
  'Bloqueia ocupação acima de 2 em qualquer lane por sala, inclusive nas operações administrativas.';
