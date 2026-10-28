-- CMIM Draft Arena: expiracao automatica de todas as salas 24h apos a criacao.
-- Instalado no Supabase (projeto cmim) em 28/10/2026.
-- Esta rotina funciona diretamente no banco, mesmo sem usuarios online.
--
-- O agendamento e executado a cada cinco minutos. Ao ser excluida,
-- a sala deixa de ser recuperavel pelos links de capitao e espectador.
-- A expiracao e baseada em created_at, NAO em updated_at.
--
-- Para (re)instalar o job no Supabase SQL Editor:
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create index if not exists cmim_draft_rooms_created_at_idx
  on public.cmim_draft_rooms (created_at);

select cron.schedule(
  'cmim-draft-rooms-expire-24h',
  '*/5 * * * *',
  $cleanup$
    delete from public.cmim_draft_rooms
    where created_at <= now() - interval '24 hours';
  $cleanup$
);

-- Para consultar o agendamento:
-- select jobid, jobname, schedule, command, active
-- from cron.job where jobname='cmim-draft-rooms-expire-24h';
--
-- Para desativar sem apagar as salas existentes:
-- select cron.unschedule('cmim-draft-rooms-expire-24h');
