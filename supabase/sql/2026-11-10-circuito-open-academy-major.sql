-- CMIM Competitive Circuit / 10-11-2026
-- Migração aplicada ao projeto Supabase 'cmim' (klpvidxhzofbwstvvxib).
-- Categoriza competições sem tocar nos registros, RLS ou lógica de chaveamento.
ALTER TABLE public.cmim_competitions
  ADD COLUMN IF NOT EXISTS league_tier text;

COMMENT ON COLUMN public.cmim_competitions.league_tier IS
  'Circuito CMIM: open, academy ou major. NULL representa competicao historica nao classificada.';

ALTER TABLE public.cmim_competitions
  DROP CONSTRAINT IF EXISTS cmim_competitions_league_tier_check;

ALTER TABLE public.cmim_competitions
  ADD CONSTRAINT cmim_competitions_league_tier_check
  CHECK (league_tier IS NULL OR league_tier IN ('open','academy','major'));

-- Para conferir:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='cmim_competitions' AND column_name='league_tier';
