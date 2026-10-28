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
