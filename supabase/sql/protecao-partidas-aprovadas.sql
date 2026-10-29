-- A serie so pode ser contada apos a aprovacao, e nao pode ser alterada depois.
-- Preserva a consistencia entre ranking e estatisticas.
CREATE OR REPLACE FUNCTION cmim_private.guard_draft_report_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.review_status='approved' then
    if new is distinct from old then
      raise exception 'Partida aprovada e imutavel; pontos e estatisticas ja homologados.';
    end if;
  end if;
  if new.review_status='approved' and old.review_status<>'approved' then
    if not exists(select 1 from public.cmim_pilot_rank_sync where room_id=new.room_id) then
      raise exception 'Partida sem pontuacao oficial: use a aprovacao do ADM.';
    end if;
  end if;
  return new;
end $function$;
drop trigger if exists cmim_guard_approved_report on public.cmim_draft_game_reports;
create trigger cmim_guard_approved_report before update on public.cmim_draft_game_reports
 for each row execute function cmim_private.guard_draft_report_approval();
