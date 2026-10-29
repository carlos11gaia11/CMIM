# CMIM — Contas, Perfis, Times e Campeonatos
Data: 29/10/2026

## Rotas
- /conta.html — Login e cadastro de jogador com nome, Nick#TAG, lanes, email, senha e foto opcional.
- /perfil.html — Perfil próprio, histórico, gráficos e campeões usados, com partidas homologadas.
- /draft.html?jogar=1 — Formação dos times, autocomplete da lista de nicks cadastrados.
- /campeonatos.html — Inscrição por equipe, convites, tabelas, confrontos e gestão pelo ADM.
- /admin.html?tab=users — Cargos, contas e vínculo opcional com o Ranking histórico.
- /admin.html?tab=matches — Aprovação oficial das séries de In-House.

## Auth e Privacidade
- Supabase Auth gerencia emails, senhas e confirmações. Senhas nunca são gravadas pelo portal.
- Conta de jogador é em `public.cmim_profiles`; nome real em `public.cmim_player_private`, protegido por RLS.
- O painel ADM usa a autorização existente em `app_metadata.cmim_admin`.
- `cmim_role_definitions` e `cmim_user_roles` criam cargos declarativos; esses cargos **não** elevam usuários a administrador.
- Foto: bucket público `cmim-avatars`, com upload limitado ao próprio UUID e a imagens de até 2 MB.
- Dois jogadores não podem compartilhar o mesmo Nick#TAG. O cadastro insere perfil e cargo padrão `player` via trigger.

## Perfil e dados históricos
- Novos drafts iniciados com jogadores escolhidos do cadastro transportam `profileIds` por equipe.
- O gatilho de arquivamento grava `profile_id` nos picks permanentes.
- O perfil usa o ID quando disponível e aproxima dados antigos pelo nick, com aviso explícito.
- O vínculo de usuário com player histórico no Ranking só pode ser efetuado por conta ADM.

## Campeonatos
- Reaproveita `cmim_squads`, `cmim_squad_members` e convites existentes.
- Inscrição via RPC `cmim_register_competition`: apenas capitão, com cinco participantes e vagas disponíveis.
- ADM cria Copa, Liga ou Suíço com MD1/MD3/MD5.
- ADM aceita ou rejeita inscrições, controla o status, gera rodadas e registra placares.
- Match e ranking do campeonato: `cmim_competition_matches`; primeira versão de organização com resultado validado pelo ADM.
- Os resultados dos campeonatos **não lançam automaticamente pontos no Ranking CMIM**. O fluxo de pontos da In-House mantém confirmação dupla dos capitães e aprovação independente em /admin.html?tab=matches.
- Os confrontos de campeonato usam ferramenta de geração e revisão no browser; validar presencialmente a chave, folgas e emparelhamentos complexos antes de eventos grandes.

## Seleção de Campeões / Inverter Sides
- A troca é somente após voto coincidente dos dois capitães.
- Inverte `teams`, `sideOwners` e `score`, preservando a associação do placar com cada equipe.
- Os dados `captain`, `players` e `profileIds` se deslocam junto com a equipe.
- Blue Side inicia os bans em toda nova partida.

## Publicação e Testes
- GitHub Pages: https://carlos11gaia11.github.io/CMIM/
- CI: `lib/engine.test.mjs` e build Vite, com publicação automática no GitHub Actions.
- Testar manualmente: criação de usuário com confirmação de email (dependente de Auth SMTP/redirect URL), upload de foto, convites reais, inscrição com cinco usuários, geração de chave e aprovação.
- Não criar emails reais nem modificar resultados oficiais apenas para testar.
