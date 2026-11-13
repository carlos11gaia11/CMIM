-- CMIM: permitir espaços internos na tag de cadastro local.
-- Ex.: tag informada "#L 9" é armazenada como "L 9" (sem # duplicado).
-- O Riot ID oficial continua sujeito à validação própria da Riot.
-- NÃO altera ranking, vínculos, contas nem pontuações.

CREATE OR REPLACE FUNCTION public.cmim_admin_update_player(p_user uuid, p_nick text, p_tag text, p_lane text, p_secondary_lane text, p_current_elo text, p_tier text, p_bio text, p_avatar_url text, p_real_name text, p_phone_e164 text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_nick text:=trim(coalesce(p_nick,''));
 v_tag text:=upper(btrim(regexp_replace(btrim(coalesce(p_tag,'')), '^#', '')));
 v_lane text:=upper(trim(coalesce(p_lane,'')));
 v_secondary text:=upper(trim(coalesce(p_secondary_lane,'')));
 v_elo text:=nullif(upper(trim(coalesce(p_current_elo,''))),'');
 v_tier text:=nullif(upper(trim(coalesce(p_tier,''))),'');
 v_name text:=trim(coalesce(p_real_name,''));
 v_phone text:=nullif(trim(coalesce(p_phone_e164,'')),'');
 v_avatar text:=nullif(trim(coalesce(p_avatar_url,'')),'');
begin
 if auth.uid() is null or not public.cmim_is_admin() then raise exception 'Somente ADM autenticado pode editar o cadastro de jogadores.'; end if;
 if not exists(select 1 from public.cmim_profiles where id=p_user) then raise exception 'Jogador não encontrado.'; end if;
 if length(v_nick) not between 2 and 32 then raise exception 'Nick deve ter de 2 a 32 caracteres.'; end if;
 if v_tag !~ '^[A-Z0-9][A-Z0-9 ]{1,4}[A-Z0-9]
 if v_lane not in ('TOP','JG','MID','ADC','SUP') then raise exception 'Lane primária inválida.'; end if;
 if v_secondary not in ('TOP','JG','MID','ADC','SUP') or v_secondary=v_lane then raise exception 'Escolha uma lane secundária diferente da primária.'; end if;
 if v_elo is not null and v_elo not in ('FERRO','BRONZE','PRATA','OURO','PLATINA','ESMERALDA','DIAMANTE','MESTRE','GRAO_MESTRE','DESAFIANTE') then raise exception 'Elo atual inválido.'; end if;
 if v_tier is not null and v_tier not in ('S','A','B','C','D','E','F') then raise exception 'Tier CMIM inválido.'; end if;
 if length(coalesce(p_bio,''))>500 then raise exception 'A biografia pode ter no máximo 500 caracteres.'; end if;
 if length(v_name)>90 then raise exception 'Nome real pode ter no máximo 90 caracteres.'; end if;
 if v_phone is not null and v_phone !~ '^\+55[1-9][0-9][0-9]{8,9}$' then raise exception 'Telefone inválido. Informe DDD e número brasileiro.'; end if;
 if v_avatar is not null and (length(v_avatar)>2000 or v_avatar !~* '^https://') then raise exception 'A foto precisa ser um endereço HTTPS válido.'; end if;
 update public.cmim_profiles set nick=v_nick,tag=v_tag,lane=v_lane,secondary_lane=v_secondary,
  current_elo=v_elo,tier=v_tier,bio=coalesce(p_bio,''),avatar_url=v_avatar,updated_at=now()
 where id=p_user;
 insert into public.cmim_player_private(id,real_name,phone_e164,updated_at)
 values(p_user,v_name,v_phone,now())
 on conflict(id) do update set real_name=excluded.real_name,phone_e164=excluded.phone_e164,updated_at=now();
end $function$
 then raise exception 'Tag do CMIM deve conter de 3 a 6 letras/números, podendo ter espaços internos.'; end if;
 if v_lane not in ('TOP','JG','MID','ADC','SUP') then raise exception 'Lane primária inválida.'; end if;
 if v_secondary not in ('TOP','JG','MID','ADC','SUP') or v_secondary=v_lane then raise exception 'Escolha uma lane secundária diferente da primária.'; end if;
 if v_elo is not null and v_elo not in ('FERRO','BRONZE','PRATA','OURO','PLATINA','ESMERALDA','DIAMANTE','MESTRE','GRAO_MESTRE','DESAFIANTE') then raise exception 'Elo atual inválido.'; end if;
 if v_tier is not null and v_tier not in ('S','A','B','C','D','E','F') then raise exception 'Tier CMIM inválido.'; end if;
 if length(coalesce(p_bio,''))>500 then raise exception 'A biografia pode ter no máximo 500 caracteres.'; end if;
 if length(v_name)>90 then raise exception 'Nome real pode ter no máximo 90 caracteres.'; end if;
 if v_phone is not null and v_phone !~ '^\+55[1-9][0-9][0-9]{8,9}$' then raise exception 'Telefone inválido. Informe DDD e número brasileiro.'; end if;
 if v_avatar is not null and (length(v_avatar)>2000 or v_avatar !~* '^https://') then raise exception 'A foto precisa ser um endereço HTTPS válido.'; end if;
 update public.cmim_profiles set nick=v_nick,tag=v_tag,lane=v_lane,secondary_lane=v_secondary,
  current_elo=v_elo,tier=v_tier,bio=coalesce(p_bio,''),avatar_url=v_avatar,updated_at=now()
 where id=p_user;
 insert into public.cmim_player_private(id,real_name,phone_e164,updated_at)
 values(p_user,v_name,v_phone,now())
 on conflict(id) do update set real_name=excluded.real_name,phone_e164=excluded.phone_e164,updated_at=now();
end $function$;

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
 if length(n) not between 2 and 32 or t !~ '^[A-Z0-9][A-Z0-9 ]{1,4}[A-Z0-9]
 then raise exception 'Nick e tag inválidos';end if;
 if lane1 not in ('TOP','JG','MID','ADC','SUP') then lane1:=null;end if;
 if lane2 not in ('TOP','JG','MID','ADC','SUP') or lane2=lane1 then lane2:=null;end if;
 if phone_value='' or phone_value !~ '^[+]55[1-9][0-9][0-9]{8,9}$' then
   raise exception 'Telefone inválido. Use DDD e número brasileiro.';end if;
 if elo not in ('FERRO','BRONZE','PRATA','OURO','PLATINA','ESMERALDA','DIAMANTE','MESTRE','GRAO_MESTRE','DESAFIANTE') then
  raise exception 'Selecione seu elo atual.';end if;
 pre:=case when elo in ('MESTRE','GRAO_MESTRE','DESAFIANTE') then 'S'
    when elo='DIAMANTE' then 'A'
    when elo='ESMERALDA' then 'B'
    when elo='PLATINA' then 'C'
    else 'D' end;
 insert into public.cmim_profiles(id,nick,tag,lane,secondary_lane,current_elo,initial_tier,tier)
 values(new.id,n,t,lane1,lane2,elo,pre,pre);
 insert into public.cmim_player_private(id,real_name,phone_e164)
 values(new.id,left(name_value,90),nullif(phone_value,''))
 on conflict(id) do nothing;
 insert into public.cmim_user_roles(user_id,role_slug)
 values(new.id,'player') on conflict do nothing;
 return new;
end $function$

 then raise exception 'Nick e tag inválidos';end if;
 if lane1 not in ('TOP','JG','MID','ADC','SUP') then lane1:=null;end if;
 if lane2 not in ('TOP','JG','MID','ADC','SUP') or lane2=lane1 then lane2:=null;end if;
 if phone_value='' or phone_value !~ '^[+]55[1-9][0-9][0-9]{8,9}$' then
   raise exception 'Telefone inválido. Use DDD e número brasileiro.';end if;
 if elo not in ('FERRO','BRONZE','PRATA','OURO','PLATINA','ESMERALDA','DIAMANTE','MESTRE','GRAO_MESTRE','DESAFIANTE') then
  raise exception 'Selecione seu elo atual.';end if;
 pre:=case when elo in ('MESTRE','GRAO_MESTRE','DESAFIANTE') then 'S'
    when elo='DIAMANTE' then 'A'
    when elo='ESMERALDA' then 'B'
    when elo='PLATINA' then 'C'
    else 'D' end;
 insert into public.cmim_profiles(id,nick,tag,lane,secondary_lane,current_elo,initial_tier,tier)
 values(new.id,n,t,lane1,lane2,elo,pre,pre);
 insert into public.cmim_player_private(id,real_name,phone_e164)
 values(new.id,left(name_value,90),nullif(phone_value,''))
 on conflict(id) do nothing;
 insert into public.cmim_user_roles(user_id,role_slug)
 values(new.id,'player') on conflict do nothing;
 return new;
end $function$;
