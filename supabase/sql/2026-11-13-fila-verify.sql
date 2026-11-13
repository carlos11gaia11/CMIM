-- SOMENTE LEITURA - confirme o projeto correto ANTES de instalar.
-- O site atualmente aponta para klpvidxhzofbwstvvxib, NÃO para jboiydywjcgemzbsqwhz.
select 'RANKING' as origem, version, jsonb_array_length(data->'players') as jogadores,
 jsonb_array_length(data->'events') as eventos from public.cmim_rank where id=1;
select (select count(*) from auth.users) as contas_auth,
 (select count(*) from public.cmim_profiles) as perfis_site;
-- Teste após a instalação (as cinco tabelas não modificam o ranking):
select table_name from information_schema.tables where table_schema='public' and table_name like 'cmim_queue_%' order by table_name;
