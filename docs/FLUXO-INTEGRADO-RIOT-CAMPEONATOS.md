# CMIM — Vínculo de identidade, torneios e aprovação

**Atualizado:** 29/10/2026.  
**Sistema:** GitHub Pages + Supabase Auth, Postgres, Edge Functions.

## Vínculo confirmado do Riot ID com o ranking

1. O jogador cadastra `Nick#TAG` no portal.
2. O ADM entra em **Painel ADM → Usuários e cargos**.
3. Confere presencialmente que a conta pertence ao jogador do ranking histórico.
4. Seleciona o usuário e **Vincular ao jogador do ranking**, salvando a confirmação.
5. O banco só aceita IDs existentes no ranking; cada jogador pode estar vinculado a apenas uma conta.
6. O perfil exibe ✓ Conta vinculada ao ranking e a data de verificação fica armazenada.
7. Uma conta vinculada não pode trocar o Riot ID sem aprovação do ADM. As lanes, foto e telefone seguem editáveis.

`cmim_pilot_publish` prioriza o vínculo verificado `rank_player_id` ao calcular a pontuação; o apelido histórico só é consultado para relatórios que ainda não possuem ID de conta. Se o relatório tem ID de conta sem vínculo confirmado, o ADM recebe um erro claro e deve conciliar antes da aprovação. Nunca assumir que nicks semelhantes representam a mesma pessoa.

## Copa, Liga e Suíço

- Criação de rodadas ocorre com `cmim_competition_generate_round` em **transação única**, com bloqueio de linha da competição.
- Inscrições devem estar encerradas ou campeonato em andamento, todas as candidaturas pendentes resolvidas e a rodada anterior aprovada.
- **Copa:** mata-mata com prévias, número variável de equipes, folgas iniciais para completar uma potência de 2; classificação somente após resultados aprovados.
- **Liga:** método circular com confrontos únicos; equipes em número ímpar têm descanso de rodada.
- **Suíço:** ordenação por pontos, Buchholz (soma de pontos dos adversários), saldo de mapas e vitórias. O emparelhamento usa escolha do participante com menos adversários disponíveis e **backtracking**, evitando revanche se existir combinação sem repetição.
- Folgas suíças concedem 3 pontos, mas não somam mapas disputados; ninguém repete folga enquanto houver equipes que ainda não receberam.
- Número máximo de rodadas coerente com a quantidade de participantes (para 6 equipes, até 5 sem revanche; para 7, até 7).
- Uma partida aprovada não pode ser modificada depois. Placar manual sem sala exige justificativa e responsável.

## Confronto → Seleção de Campeões → aprovação ADM

1. ADM cria campeonato, aprova inscrições e gera rodadas.
2. Ao lado de um confronto, clica em **Criar seleção MD1/MD3/MD5**.
3. O sistema consulta os cinco membros por time e exige uma lane por jogador, ID verificado no ranking e participação na temporada ativa.
4. A Seleção de Campeões cria a sala com Blue Side (Time A) e Red Side (Time B), IDs dos perfis e o formato MD correto.
5. Ao criar a sala, o site solicita `cmim_competition_link_room(match,room)`. O servidor verifica a presença e correspondência exata dos dez IDs com os membros das duas equipes, impedindo vínculo com jogo de terceiros.
6. Os dois capitães recebem links e devem concordar com cada resultado. O ADM pode registrar partidas da série manualmente caso ela tenha continuado fora do site (com justificativa e auditoria).
7. O ADM aprova a MD em **Aprovação de Partidas**. O RPC `cmim_pilot_publish` atualiza o Ranking e tenta sincronizar automaticamente o resultado do confronto vinculado.
8. Se a sincronização não ocorrer, o painel exibe erro, e o ADM pode ir a **Campeonatos → Gerenciar → Sincronizar jogo homologado**. A sincronização só aceita relatórios arquivados e aprovados e os mesmos 10 jogadores.
9. Se o campeonato não teve sala, o ADM pode homologar resultado manual com justificativa (não lança pontos automaticamente na In-House).
10. A Copa ou o Suíço só prossegue após todos os confrontos da rodada anterior estarem homologados.

## Navegação mobile e feedback

- Dock inferior com Portal, Jogar, Torneios, Perfil e Ranking.
- O dock fica oculto durante a seleção em tela cheia para não interferir com os controles dos capitães.
- Notificações de sucesso/erro na área de campeonatos com `aria-live`, contraste e controles com área de toque adequada.
- Páginas do ADM e portal foram conectadas ao mesmo menu, respeitando a autenticação existente.

## Testes e limitações

- Foram realizadas simulações transacionais revertidas de Copa com 5 equipes, Liga com 4, Suíço com 4, 6, 7 e 8, incluindo 5 rodadas sem revanche (quando o tamanho suporta).
- O teste do vínculo de identidade criou temporariamente um vínculo aprovado e validou erro para ID inexistente; tudo revertido.
- A aprovação de jogo real-estrutural válido foi testada em transação revertida, sem pontos fictícios persistidos.
- A ligação real de uma sala de campeonato com dez usuários distintos requer dez contas cadastradas e verificadas. Sem essas contas, o teste manual ponta a ponta permanece necessário.
- O Supabase ainda sinaliza avisos de funções `SECURITY DEFINER` e proteção contra senhas vazadas desabilitada. As novas operações sensíveis exigem checagem de `cmim_is_admin()`; realizar auditoria adicional nas funções antigas.
- Evitar coletar dados pessoais não necessários e não exibir nome real, e-mail ou telefone nas páginas públicas.

## Rotas
- https://carlos11gaia11.github.io/CMIM/conta.html
- https://carlos11gaia11.github.io/CMIM/perfil.html
- https://carlos11gaia11.github.io/CMIM/campeonatos.html
- https://carlos11gaia11.github.io/CMIM/admin.html?tab=users
- https://carlos11gaia11.github.io/CMIM/admin.html?tab=matches
