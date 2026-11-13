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
- `public/assets/branding/cmim-open.webp`, `cmim-academy.webp`, `cmim-major.webp`: logos recebidas da organização e recortadas com fundo transparente para o circuito;
- `public/assets/branding/insalubrao.webp` e `insalubrinho.webp`: logos recebidas da organização para High e Low do in-house; `cmim-main.webp` é a marca institucional recortada.

As logos desta versão foram fornecidas pela organização; os arquivos WebP foram otimizados e tiveram o fundo removido sem redesenhar a marca.

### Acesso e segurança

A página pública `ligas.html` permite que qualquer pessoa conheça as ligas. Criar um time, aceitar convites e se inscrever em eventos continua exigindo autenticação via `CMIMAuth` e autorização do banco. As páginas restritas agora mostram um aviso de login em vez de um documento invisível.

A restrição visual não é um controle de segurança substituto: permissões e RLS devem continuar implementadas no Supabase. O site não publica `service_role` nem chaves secretas.

### Regulamentos

O portal consolida as regras fornecidas em 10/11/2026, inclusive Leões de Vaga sem penalidade por indisponibilidade, fill exclusivo S/A com prioridade da Main Lane, pausas, Regra Denver, Carter, Nery, Dogzi, formação de equipes e divisões temporariamente unificadas. O **circuito Open/Academy/Major** é separado do torneio semanal de in-house.

Critérios de acesso, datas, premiações, formatos e eventuais promoções entre ligas devem ser comunicados especificamente por edição. O portal não os inventa.

### Vinculação dos campeonatos às ligas

O Supabase `cmim` recebeu a coluna opcional `public.cmim_competitions.league_tier`, com valores `open`, `academy`, `major` ou `NULL` (legado). A migração foi aplicada em 10/11/2026 e o SQL está documentado em `supabase/sql/2026-11-10-circuito-open-academy-major.sql`.

A gestão de eventos, dentro de `ligas.html`, agora seleciona explicitamente a liga e grava a escolha no registro. A página pública oferece filtros por liga e mantém eventos anteriores sem classificação na opção "Todas as ligas". Não foram alterados registros anteriores, permissões do banco ou métodos do motor de chaveamento.


## Atualização de identidade oficial — 10/11/2026

As **seis logos enviadas pela organização** substituem os ícones vetoriais temporários:

| Logo | Arquivo no GitHub |
|---|---|
| CMIM institucional | `public/assets/branding/cmim-main.webp` |
| Insalubrão / High | `public/assets/branding/insalubrao.webp` |
| Insalubrinho / Low | `public/assets/branding/insalubrinho.webp` |
| CMIM Open | `public/assets/branding/cmim-open.webp` |
| CMIM Academy | `public/assets/branding/cmim-academy.webp` |
| CMIM Major | `public/assets/branding/cmim-major.webp` |

Os arquivos possuem transparência nas áreas externas da marca, foram otimizados em WebP de até 720 px e são carregados pelos componentes de `index.html`, `public/ligas.html`, `public/regulamento.html` e outras páginas que exibem o símbolo CMIM. O fundo de marca está em `public/assets/branding/cmim-industrial-background.webp`, em baixa intensidade para preservar o contraste.

### Melhorias de experiência inspiradas na organização de ligas competitivas

O portal mantém o in-house separado do circuito, mas agora apresenta portas de entrada para ambos logo após o hero. A área `ligas.html` reúne panorama do circuito, equipes homologadas, eventos, agenda de partidas e classificação, exibindo apenas os dados disponíveis no Supabase. O regulamento ganhou pesquisa local por termo. Nenhum placar, cronograma ou premiação é inventado.


## In-House: fila com lane livre e laboratório ADM (13/11/2026)

O botão **Jogar** abre `fila.html`. A ferramenta anterior, acessada por
`draft.html?jogar=1`, chama-se **Entrar em sala pronta**. O draft manual e
o ranking seguem independentes.

- Cada participante autenticado seleciona TOP, JG, MID, ADC ou SUP ao entrar na
  sala. A escolha vale apenas para essa sala e pode ser modificada enquanto
  a fila estiver aberta. A lane principal do perfil não é sobrescrita.
- Quem não possui tier válido é considerado **Tier B somente na fila/draft**.
  Perfis anteriormente sem tier recebem B por padrão (inclusive em novos cadastros); classificações S/A/B/C/D já registradas permanecem intactas, assim como todo o ranking histórico.
- O administrador pode corrigir a lane de participantes pela tela
  `admin-fila.html`. A ação é validada no PostgreSQL pelo app_metadata
  `cmim_admin` e registrada em `cmim_queue_audit`.
- Dentro do painel ADM há um **Laboratório** com 10 usuários simbólicos:
  confirmar individualmente ou em lote, visualizar escolha automática de
  capitães, escolher oito jogadores alternadamente e usar relógio de 60s,
  desfazer escolha e reiniciar. Toda a simulação é **100% local** e não grava
  dados no Supabase, não cria contas e não afeta o ranking.
- SQL do recurso em
  `supabase/sql/2026-11-13-fila-lanes-tier-b.sql` e
  `supabase/sql/2026-11-13-fila-admin-lanes.sql` e
  `supabase/sql/2026-11-13-tier-b-perfil-padrao.sql`.
  As migrações foram aplicadas ao projeto de produção
  `klpvidxhzofbwstvvxib`.

Segurança: o frontend nunca recebe chaves secretas. A escolha de lane, as
permissões administrativas e o draft real são verificados no backend. O
laboratório não substitui o teste ponta a ponta com dez contas reais.

## Atualização visual da fila e limite de lanes (13/11/2026)

A rota `fila.html` tem layout responsivo CMIM, cartões de vagas e participantes
agrupados por lane, barra de confirmações 0–10 e draft exibido na própria página.

**Regra:** duas vagas ativas por lane, por sala: 2 TOP, 2 JG, 2 MID, 2 ADC e 2 SUP.
Entradas `queued` ou `confirmed` ocupam vagas. Saída ou remoção liberam a posição.
A terceira inscrição em uma lane é recusada no PostgreSQL sob bloqueio da linha
da sala, inclusive em operações administrativas. Veja
`supabase/sql/2026-11-13-fila-limite-duas-vagas-lane.sql`.

**O que acontece com dez confirmados:** `cmim_q_confirm` chama
`cmim_internal.try_start`, que define dois capitães pelos tiers (S→A→B→C→D),
inicia uma sequência de oito escolhas A–B–A–B e um relógio de 60 s por escolha.
`cmim_q_pick` marca a sala como `finished` após a oitava escolha.
O site mostra as equipes completas e um link para abrir a seleção de campeões,
mas **não transfere os elencos automaticamente para a ferramenta de picks e bans**.
A seleção manual dos oito jogadores não obriga um de cada lane por equipe; esse
seria um requisito adicional ao limite da fila.

Verificado: simulação SQL em subtransação com dois inscritos TOP, terceira
inscrição rejeitada e nova inscrição permitida após liberar uma vaga; nenhuma
sala ou inscrição fictícia foi mantida. Ranking preservado.

## Torneio de quatro times na fila (13/11/2026)

A central de filas agora oferece duas modalidades no formulário do ADM
(`admin-fila.html`):

| Modalidade | Participantes | Por lane | Times | Ordem |
| --- | ---: | ---: | ---: | --- |
| In-House normal | 10 | 2 | A e B | A–B alternado |
| Torneio de 4 times | 20 | 4 | A, B, C e D | Snake A–B–C–D–D–C–B–A (repetido) |

No torneio, o ADM escolhe a **lane dos quatro capitães** (padrão MID), assim
como no draft manual de 4 times. Assim que 20 jogadores confirmam presença,
os 4 representantes dessa lane são selecionados como capitães e ordenados
por tier S/A/B/C/D e desempate determinístico. A formação via `fila.html`
respeita uma pessoa de cada lane em cada time; as últimas vagas
inevitáveis de uma lane são atribuídas automaticamente (AUTO), como no
mecanismo `autoAssign` do draft manual.

O banco mantém o limite de inscrições sob lock da sala: quatro
participantes em cada posição no torneio; dois no in-house convencional.
O draft usa 60 segundos por escolha (configurável no painel ADM). As
operações de escolha, undo, troca de capitães e abertura do torneio são
validadas no PostgreSQL. O ADM pode reordenar os quatro capitães antes do
primeiro pick. A lógica de desfazer também reverte escolhas AUTO
consequentes à última escolha manual.

Arquivos de banco:
- `supabase/sql/2026-11-13-fila-torneio-quatro-times.sql`: extensão das
  tabelas e fluxo 4 times, com compatibilidade do modo 2 times;
- `supabase/sql/2026-11-13-fila-torneio-trocar-capitaes.sql`: ajuste de
  permissões e troca dos quatro capitães já alocados.

A migração e os ajustes adicionais foram aplicados ao Supabase principal
`klpvidxhzofbwstvvxib`. A simulação de integração com 20 check-ins,
quatro capitães e 16 atribuições foi executada dentro de subtransação
revertida; nenhuma sala simbólica foi persistida.

**Escopo:** este recurso faz o *draft/formação* de quatro equipes, tal
como o modo de quatro times da ferramenta manual. Não cria nem gerencia
automaticamente chaveamento de semifinais/final; esses confrontos podem
ser organizados por outra funcionalidade do portal.

O painel contém também um laboratório local de 20 jogadores simbólicos,
sem escrita no Supabase. A tabela `cmim_rank`, contas e histórico não são
modificados.
