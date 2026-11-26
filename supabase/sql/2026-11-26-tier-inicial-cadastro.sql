-- Preserve historical initial tiers; allow A+ for new registrations.
alter table public.cmim_profiles drop constraint cmim_initial_tier_valid;
alter table public.cmim_profiles add constraint cmim_initial_tier_valid check (initial_tier is null or initial_tier in ('S','A+','A','B','C','D'));
CREATE OR REPLACE FUNCTION public.cmim_profile_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n text;t text;lane1 text;lane2 text;name_value text;phone_value text;elo text;pre text;
begin
 n:=trim(coalesce(new.raw_user_meta_data->>'nick',''));
 t:=upper(btrim(regexp_replace(btrim(coalesce(new.raw_user_meta_data->>'tag','')), '^#', '')));
 lane1:=upper(trim(coalesce(new.raw_user_meta_data->>'lane','')));
 lane2:=upper(trim(coalesce(new.raw_user_meta_data->>'secondary_lane','')));
 name_value:=trim(coalesce(new.raw_user_meta_data->>'real_name',''));
 phone_value:=trim(coalesce(new.raw_user_meta_data->>'phone_e164',''));
 elo:=upper(trim(coalesce(new.raw_user_meta_data->>'current_elo','')));
 if length(n) not between 2 and 32 or t !~ '^[A-Z0-9][A-Z0-9 ]{1,4}[A-Z0-9]$'
 then raise exception 'Nick e tag inválidos';end if;
 if lane1 not in ('TOP','JG','MID','ADC','SUP') then lane1:=null;end if;
 if lane2 not in ('TOP','JG','MID','ADC','SUP') or lane2=lane1 then lane2:=null;end if;
 if phone_value='' or phone_value !~ '^[+]55[1-9][0-9][0-9]{8,9}$' then
   raise exception 'Telefone inválido. Use DDD e número brasileiro.';end if;
 if elo not in ('FERRO','BRONZE','PRATA','OURO','PLATINA','ESMERALDA','DIAMANTE','MESTRE','GRAO_MESTRE','DESAFIANTE') then
  raise exception 'Selecione seu elo atual.';end if;
 pre:=case when elo in ('MESTRE','GRAO_MESTRE','DESAFIANTE') then 'A+'
    when elo='DIAMANTE' then 'A'
    when elo='ESMERALDA' then 'B'
    else 'C' end;
 insert into public.cmim_profiles(id,nick,tag,lane,secondary_lane,current_elo,initial_tier,tier)
 values(new.id,n,t,lane1,lane2,elo,pre,pre);
 insert into public.cmim_player_private(id,real_name,phone_e164)
 values(new.id,left(name_value,90),nullif(phone_value,''))
 on conflict(id) do nothing;
 insert into public.cmim_user_roles(user_id,role_slug)
 values(new.id,'player') on conflict do nothing;
 return new;
end $function$;
