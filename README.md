# CMIM Draft Arena v5 — GitHub Pages + Supabase

Esta versão **não precisa de Cloudflare, D1, servidor local nem administrador master**.

## Estado do projeto

- Site convertido de Next.js/Cloudflare Worker para **React + Vite (site estático)**.
- Workflow de GitHub Actions em `.github/workflows/deploy-pages.yml` publica o conteúdo de `dist/` no GitHub Pages.
- Banco de dados de salas criado no **Supabase do projeto `cmim`**, separado das tabelas existentes.
- Backend server-side da partida: Edge Function `cmim-draft-api`. O navegador usa somente a chave **publishable**.
- Blue e Red têm tokens distintos nos links; viewer é somente leitura. Não existe token de Master.
- Realtime envia notificações de atualização; a tela também verifica o banco a cada 5 s se o realtime falhar.
- Após as 20 ações, capitães podem fazer trocas de campeões por 30 s; espectadores veem o quadro imediatamente.
- Efeitos e música incluídos em arquivos MP4 (áudio AAC) em `public/`.

## Publicar no GitHub Pages

1. Crie um **repositório** no GitHub (ex.: `cmim-draft`). Faça upload **do conteúdo desta pasta**, na raiz do repositório — não envie o ZIP como único arquivo.
2. No repositório, acesse **Settings → Secrets and variables → Actions → Variables** e crie as variáveis:
   - `VITE_SUPABASE_URL` = `https://klpvidxhzofbwstvvxib.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave pública do Supabase, em **Project Settings → API Keys** (identificador `sb_publishable_...`).
3. Acesse **Settings → Pages → Build and deployment** e escolha **GitHub Actions**.
4. Envie commit para `main` (ou acione manualmente **Actions → Publicar CMIM no GitHub Pages → Run workflow**).
5. Abra `https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/` e crie a sala; valide Blue, Red e Espectador em computadores diferentes.

> O workflow monta automaticamente `BASE_PATH` de acordo com o nome do repositório. Se usar `SEU_USUARIO.github.io` como nome do próprio repositório ou domínio customizado, altere `BASE_PATH` para `/` no workflow.

### Segurança

Não suba a `service_role` / `sb_secret_...` ao GitHub. Só a **publishable key** fica no frontend. Os tokens dos capitães são compartilhados somente por URLs privadas e armazenados como hash no banco. Quem tiver o link de um capitão poderá controlar aquele lado.

A sala aceita espectadores que conheçam seu ID. A criação pública de salas pode exigir futuramente rate-limiting/CAPTCHA se o site crescer.

## Desenvolvimento

- Instale **Node.js 22**.
- `npm install`
- Crie `.env.local` com as duas variáveis `VITE_SUPABASE_*` acima (modelo em `.env.example`).
- `npm run dev` → navegue até `http://127.0.0.1:5173/`.
- `npm test` → 15 testes do motor (executados com sucesso na preparação desta versão).
- `npm run build` → gera `dist/` para hospedagem estática. A compilação depende de instalar pacotes do npm; não pôde ser executada neste ambiente por falta de acesso ao registry npm. GitHub Actions executará o build.

### Atualizar o backend em outro projeto

O código da Edge Function está em `supabase/functions/cmim-draft-api/`, e a criação da tabela em `supabase/migrations/`. O backend já foi configurado e publicado no projeto `cmim` (referência `klpvidxhzofbwstvvxib`). Caso queira publicar outra cópia, aplique a migração e implemente `cmim-draft-api` com **Verify JWT desligado** (a autorização das mutações é feita com os tokens dos capitães validados no servidor).

### Limitações

A atualização via Broadcast é um aviso não-autoritativo: a Edge Function sempre relê e valida o estado. Em quedas de conexão, existe polling de segurança a cada 5 segundos. Arquivos MP4 selecionados localmente são válidos apenas no navegador que os selecionou; para compartilhar músicas personalizadas, utilize URL pública HTTPS `.mp4`.


## Portal CMIM 2026 — Estrutura de navegação

A reformulação do portal mantém o **in-house** separado do **CMIM Competitive Circuit**:

| Área | Endereço | Responsabilidade |
|---|---|---|
| Portal | `/` | Introdução, modalidades, divisões e acesso às ferramentas |
| Ligas | `/ligas.html` | Open, Academy, Major, criação de times, convites, inscrições, chaveamentos, gestão de eventos |
| Compatibilidade | `/campeonatos.html` | Redireciona para `ligas.html`, preservando links anteriores |
| Regulamento | `/regulamento.html` | Regras gerais, reservas, fill lane, tiers, torneio e divisões |
| Ranking | `/ranking.html` | Dados oficiais do in-house e temporadas |
| Draft | `/draft.html` | Formação dos elencos de in-house |
| Seleção | `/selecao.html` | Picks e bans online |
| Administração | `/admin.html` | Gestão e homologação |

### Design system e emblemas

- `public/cmim-modern.css`: identidade visual compartilhada, cards, motion, layout responsivo e estilos de autenticação;
- `public/cmim-modern.js`: indicador discreto de rolagem e animações progressivas, sem ocultar conteúdo quando JS está indisponível;
- `public/cmim-open.svg`, `public/cmim-academy.svg`, `public/cmim-major.svg`: emblemas vetoriais adaptados à identidade CMIM, utilizados nas apresentações do circuito;
- `public/insalubrao.svg` e `public/insalubrinho.svg`: emblemas vetoriais para High e Low do in-house.

Os emblemas vetoriais são peças de design aplicadas ao portal. **A aprovação institucional das versões definitivas cabe à administração.**

### Acesso e segurança

A página pública `ligas.html` permite que qualquer pessoa conheça as ligas. Criar um time, aceitar convites e se inscrever em eventos continua exigindo autenticação via `CMIMAuth` e autorização do banco. As páginas restritas agora mostram um aviso de login em vez de um documento invisível.

A restrição visual não é um controle de segurança substituto: permissões e RLS devem continuar implementadas no Supabase. O site não publica `service_role` nem chaves secretas.

### Regulamentos

O portal consolida as regras fornecidas em 10/11/2026, inclusive Leões de Vaga sem penalidade por indisponibilidade, fill exclusivo S/A com prioridade da Main Lane, pausas, Regra Denver, Carter, Nery, Dogzi, formação de equipes e divisões temporariamente unificadas. O **circuito Open/Academy/Major** é separado do torneio semanal de in-house.

Critérios de acesso, datas, premiações, formatos e eventuais promoções entre ligas devem ser comunicados especificamente por edição. O portal não os inventa.

### Vinculação dos campeonatos às ligas

O Supabase `cmim` recebeu a coluna opcional `public.cmim_competitions.league_tier`, com valores `open`, `academy`, `major` ou `NULL` (legado). A migração foi aplicada em 10/11/2026 e o SQL está documentado em `supabase/sql/2026-11-10-circuito-open-academy-major.sql`.

A gestão de eventos, dentro de `ligas.html`, agora seleciona explicitamente a liga e grava a escolha no registro. A página pública oferece filtros por liga e mantém eventos anteriores sem classificação na opção "Todas as ligas". Não foram alterados registros anteriores, permissões do banco ou métodos do motor de chaveamento.

