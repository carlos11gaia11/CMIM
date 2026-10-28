-- Migração já aplicada ao projeto cmim em 28/10/2026.
create table if not exists public.cmim_draft_rooms (
 id uuid primary key default gen_random_uuid(),
 blue_token_hash text not null check (length(blue_token_hash) = 64),
 red_token_hash text not null check (length(red_token_hash) = 64),
 state jsonb not null,
 revision bigint not null default 0 check (revision >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.cmim_draft_rooms enable row level security;
revoke all on public.cmim_draft_rooms from anon, authenticated;
