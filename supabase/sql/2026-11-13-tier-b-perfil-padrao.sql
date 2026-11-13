-- Atribui tier B apenas a perfis ainda não classificados.
-- Não altera a tabela cmim_rank nem modifica tiers existentes (S/A/B/C/D).
alter table public.cmim_profiles alter column tier set default 'B';
update public.cmim_profiles set tier='B',updated_at=now()
where tier is null and initial_tier is null;
