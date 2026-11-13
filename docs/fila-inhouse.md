# CMIM · Sistema de Fila / Confirmação / Draft Automático (site)

Módulo criado para o repositório `carlos11gaia11/CMIM` (React/Vite + GitHub Pages e HTML público). É **separado** de `public/draft.html` e não altera os arquivos do ranking. O antigo bot Discord não é necessário para esta versão.

## Banco correto — MUITO IMPORTANTE

O site atualmente usa `https://klpvidxhzofbwstvvxib.supabase.co` (conferido em `public/cmim-auth.js` no GitHub). Nesse banco existem **65 jogadores no ranking, 23 eventos de ranking, 35 usuários e 35 perfis** na verificação efetuada. O projeto `jboiydywjcgemzbsqwhz` informado anteriormente está vazio (0 usuários e nenhuma tabela pública). **Não execute este SQL no projeto vazio esperando que ele modifique o site já publicado.**

Antes de instalar, execute `sql/00-verificar-protecao-ranking.sql` no SQL Editor do Supabase **klpvidxhzofbwstvvxib**, e registre o resultado. Faça backup do banco pelo painel do Supabase. Depois execute `sql/2026-11-13-fila-site.sql` no SQL Editor **do mesmo projeto**. O SQL só cria tabelas e funções novas `cmim_queue_*` / `cmim_q_*` e um schema interno `cmim_internal`. Não faz `DROP`, não altera `cmim_rank` e não remove usuários ou senhas.

## Integrar ao site atual

1. Baixe e extraia o repositório `carlos11gaia11/CMIM` (branch atual) numa pasta local.
2. Copie os arquivos `public/fila.html`, `public/fila.js`, `public/admin-fila.html`, `public/admin-fila.js` deste pacote para a pasta `public/` do repositório.
3. Copie `scripts/integrar-no-site.mjs` para `scripts/` no repositório. Execute na raiz do repositório: `node scripts/integrar-no-site.mjs .` . O script acrescenta um link **Fila In-House** na navegação e um link **Fila e Draft Automático** no painel ADM.
4. Rode `npm install`, `npm test`, `npm run build` e publique via workflow GitHub Pages do próprio repositório. A página será `/CMIM/fila.html`; o painel será `/CMIM/admin-fila.html`.
5. Entre no site com uma conta cujo `app_metadata.cmim_admin` seja `true` (a mesma permissão já usada pelo painel). Agende uma sala, configure o tempo de pick (padrão 60s), teste com dez contas de jogadores antes de usar oficialmente.

## Fluxo

1. ADM agenda sala com janela de entrada e confirmações. Não é preciso cron/PC ligado: o servidor aceita inscrições quando `now()` estiver no intervalo da sala.
2. Jogadores entram em `fila.html` e usam **Entrar na fila**. A fila é ordenada por entrada; usuários após o 10º ficam na espera.
3. Os dez primeiros elegíveis clicam **Confirmar presença**. Quem não tiver tier S/A/B/C/D configurado no perfil não entra até o ADM ajustar.
4. Ao atingir 10 confirmações, uma função transacional tranca a sala, escolhe automaticamente os dois jogadores de tier mais alto (desempate determinístico por sala) como capitães e inicia o draft.
5. Capitães escolhem oito jogadores em ordem A→B→A→B→A→B→A→B, em 60 s por turno. Ao término, publica as duas equipes no próprio site.
6. Reportes vão para o painel de análise do ADM, sem penalidades automáticas.

## Permissões, consistência e observações

- Os cinco tipos de dado da fila (`rooms`, `entries`, `picks`, `reports` e `audit`), mais `settings`, ficam em tabelas próprias com RLS. Escritas ocorrem apenas por RPC autenticada. Funções administrativas verificam a permissão no `auth.users.raw_app_meta_data`, não em metadados editáveis pelo jogador.
- Draft antigo e ranking permanecem independentes; o novo módulo consulta `cmim_profiles.tier` (ou `initial_tier`) do site para tirar o tier de cada participante. Tiers são copiados como snapshot na entrada e podem ser revisados por ADM antes do início.
- O tempo expira no banco; a tela apenas exibe o cronômetro. Um ADM pausa/retoma o draft quando o prazo acaba. A reabertura da sala, o cancelamento e o desfazer do último pick ficam registrados.
- Quando os jogadores completam o draft automático, este MVP **não cria automaticamente uma partida contabilizada no ranking**. O ranking só deve receber resultados pelo fluxo de homologação já existente, evitando pontuação duplicada.
- O painel usa datas no fuso local do navegador e mostra as datas da sala no fuso Brasília na parte pública.
- Esta entrega não foi submetida a testes de integração com dez usuários reais ou deploy GitHub Pages. Validar antes de produção.

## Recadastro e remoção de contas — NÃO EXECUTADO

O pedido de limpar emails/senhas e forçar recadastro **não foi aplicado**. No banco real, 35 contas possuem 35 perfis vinculados por chave estrangeira com `ON DELETE CASCADE`; há ainda tabelas de competições e auditoria com referências `RESTRICT`/`NO ACTION` que poderiam quebrar com exclusão direta. Remover usuários sem mapear os vínculos pode apagar perfis, vínculos com rank, permissões e histórico de outras áreas, mesmo que o JSON `cmim_rank` continue intacto.

Procedimento seguro recomendado, em etapa separada: exportar snapshot completo de `cmim_rank`, `cmim_profiles`, `cmim_user_roles`, vínculos e tabelas históricas; auditar todas as FKs; preservar pelo menos um administrador; criar tabela de identificação persistente dos jogadores no ranking desvinculada do UUID de Auth; testar recadastro e reivindicação de nick em ambiente de testes; só depois usar Admin Auth API para remover contas antigas com verificação de contagens e integridade. **Não execute `DELETE FROM auth.users`**.
