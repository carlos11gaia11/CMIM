begin;
alter table public.cmim_competitions add column if not exists registration_fee_cents integer check(registration_fee_cents between 0 and 10000000), add column if not exists lock_roster_at_close boolean not null default false, add column if not exists broadcast_url text check(broadcast_url is null or (length(broadcast_url)<=1000 and broadcast_url ~ '^https://'));
create table if not exists public.cmim_entry_reviews (
 entry_id uuid primary key references public.cmim_competition_entries(id) on delete cascade,
 payment_status text not null default 'pending' check(payment_status in ('pending','confirmed','waived')),
 review_state text not null default 'reviewing' check(review_state in ('reviewing','corrections','ready')),
 staff_note text not null default '' check(length(staff_note)<=1500),
 updated_at timestamptz not null default now()
);
alter table public.cmim_entry_reviews enable row level security;
revoke all on public.cmim_entry_reviews from anon,authenticated;
grant select,insert,update on public.cmim_entry_reviews to authenticated;
create policy cmim_review_read on public.cmim_entry_reviews for select to authenticated using ((select public.cmim_is_admin()) or exists(select 1 from public.cmim_competition_entries e join public.cmim_squads t on t.id=e.team_id where e.id=entry_id and (t.owner_id=(select auth.uid()) or exists(select 1 from public.cmim_squad_members m where m.team_id=t.id and m.user_id=(select auth.uid())))));
create policy cmim_review_insert on public.cmim_entry_reviews for insert to authenticated with check ((select public.cmim_is_admin()));
create policy cmim_review_update on public.cmim_entry_reviews for update to authenticated using ((select public.cmim_is_admin())) with check ((select public.cmim_is_admin()));
create or replace function cmim_private.cmim_entry_review_guard() returns trigger language plpgsql set search_path='' as $$
declare fee integer; r public.cmim_entry_reviews%rowtype;
begin
 if NEW.status is distinct from OLD.status and NEW.status in ('approved','rejected') then
  if not public.cmim_is_admin() then raise exception 'Somente o ADM pode homologar inscrições.';end if;
  select registration_fee_cents into fee from public.cmim_competitions where id=NEW.competition_id;
  select * into r from public.cmim_entry_reviews where entry_id=NEW.id;
  if NEW.status='approved' and r.review_state='corrections' then raise exception 'Resolva as correções solicitadas antes de aprovar.';end if;
  if NEW.status='approved' and coalesce(fee,0)>0 and coalesce(r.payment_status,'pending') not in ('confirmed','waived') then raise exception 'Confirme o pagamento ou registre a isenção antes de aprovar.';end if;
  if NEW.status='rejected' and nullif(trim(coalesce(r.staff_note,'')),'') is null then raise exception 'Informe o motivo da recusa na análise da inscrição.';end if;
 end if;
 return NEW;
end $$;
create trigger cmim_entry_review_guard before update of status on public.cmim_competition_entries for each row execute function cmim_private.cmim_entry_review_guard();
create or replace function cmim_private.cmim_roster_deadline_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 if public.cmim_is_admin() or auth.uid() is null then return case when TG_OP='DELETE' then OLD else NEW end;end if;
 if TG_TABLE_NAME='cmim_squads' then tid:=OLD.id; else tid:=case when TG_OP='INSERT' then NEW.team_id else OLD.team_id end; end if;
 if exists(select 1 from public.cmim_competition_entries e join public.cmim_competitions c on c.id=e.competition_id where e.team_id=tid and e.status='approved' and c.lock_roster_at_close and c.closes_at<=now() and c.status in ('open','closed','live')) then raise exception 'Elenco bloqueado após o prazo de inscrição. Fale com a organização.'; end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end $$;
revoke all on function cmim_private.cmim_roster_deadline_guard() from public,anon,authenticated;
create trigger cmim_roster_deadline_guard before insert or delete or update of team_id,user_id,lane on public.cmim_squad_members for each row execute function cmim_private.cmim_roster_deadline_guard();
create trigger cmim_squad_deadline_guard before delete on public.cmim_squads for each row execute function cmim_private.cmim_roster_deadline_guard();
notify pgrst,'reload schema';
commit;