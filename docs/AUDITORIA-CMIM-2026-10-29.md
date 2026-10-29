# Diagnóstico técnico e propostas de evolução — CMIM
**Data:** 29/10/2026  
**Escopo:** portal GitHub Pages, Supabase Auth/Postgres/Storage, seleção de campeões, draft de jogadores, ranking, In-House e campeonatos.

## Entregas desta atualização
- Painel ADM / Partidas: botão para registrar o **próximo jogo de uma série pendente** concluído fora do site; aceita MD1/MD3/MD5.
- O ADM informa vencedor, Blue Side, data opcional, origem do resultado, picks e bans opcionais. Cada registro fica identificado como `admin_manual`, com `manually_created_by`, data e justificativa.
- A função SQL `cmim_admin_add_series_game` exige ADM autenticado, preserva os dez jogadores originais, ordena jogos, impede ultrapassar o placar de encerramento e não contabiliza pontos automaticamente.
- O sistema cria 10 estruturas de picks e 10 de bans com `champion=null` quando o dado não é conhecido. O relatório TXT informa os campos desconhecidos; a página In-House desconsidera os campos ausentes.
- A Edge Function da seleção bloqueia novas ações na sala original se o ADM registrou jogos manuais para aquela sala.
- No painel, os picks são exibidos em duas colunas (Blue/Red) e bans em chips.
- Cadastro de conta solicita **telefone com DDD**; ele é armazenado em `cmim_player_private.phone_e164`, validado como +55 e acessível somente ao dono e ao ADM. Perfil e Gestão de Usuários incluem edição.
- Testes SQL de criação manual, encerramento de série e aprovação com pontos em transações reversíveis; telefone testado com RLS e rollback.

## Prioridade crítica / antes de torneios grandes
1. **Vinculação de identidade ao Ranking.** Em um teste de série baseado num relatório real, a aprovação foi bloqueada porque o nick escrito no jogo não correspondeu ao histórico do Ranking (erro "Nick não encontrado"). Centralizar em `profile_id` + Riot ID `Nick#TAG`, oferecer reconciliação orientada ao ADM e mostrar erros antes de abrir o draft. O teste oficial com elencos válidos passou.
2. **Chaves, folgas e emparelhamentos.** O gerador em `public/campeonatos.js` é inicial: a variável `byeCount` é calculada mas não usada e o emparelhamento Suíço evita revanche apenas se encontrar alternativa simples. Implementar motor testável no servidor, com folga justa, múltiplas rodadas, desempates e impossibilidade de criar chaves duplicadas.
3. **Integridade das partidas de campeonato.** Resultados da competição hoje são editados pelo ADM diretamente na tabela de confrontos, sem ligação obrigatória com relatório homologado da seleção. Vincular ao evento oficial, fechar placares e manter auditoria/versões.
4. **Revisar avisos de segurança Supabase.** O advisor lista `auth_leaked_password_protection` desativado e oito funções SECURITY DEFINER executáveis por autenticados. Fazer revisão uma a uma dos controles internos e habilitar proteção contra senhas vazadas. O RLS intencional sem política de salas de draft não significa sozinho uma falha: verificar as necessidades do serviço.

## Alta prioridade / experiência e manutenção
5. **Auditoria completa.** A aprovação deve mostrar diff de alteração do campeão e vencedor, motivo, autor, data, e anexos opcionais de prova. Criar log imutável de edições e revisões.
6. **Estatísticas de partidas parciais.** Exibir separadamente "jogos aprovados", "jogos com picks completos", "picks desconhecidos" e "bans desconhecidos", com cobertura de dados por temporada para evitar interpretações falsas de win rate e pick rate.
7. **Regras robustas do draft de jogadores.** Testes unitários para Snake, Alternado, Inverso, Blocos, Confusion e Aleatório, cobrindo casos de equilíbrio por lane, duplicidade de nick e divisão de times sem jogadores faltando.
8. **Cadastro e privacidade.** Verificação de Riot ID, confirmação de email, recuperação de senha, consentimento para contatos por WhatsApp, política de retenção de telefone, exclusão/exportação de dados e proteção de sessões no navegador.
9. **Usabilidade móvel.** Menus e abas fixas responsivas, cards menores, estados claros de conexão/erro, modo espectador e passo a passo MD1/MD3/MD5. Evitar tabelas e listas com textos comprimidos.

## Evoluções recomendadas
10. **Perfil competitivo avançado.** Estatísticas por lane e campeão, taxa de vitória por temporada e por lado, adversários recorrentes, gráfico de evolução de tiers e conquistas.
11. **Torneios e in-house unificados.** Chave ou rodada gera sala da Seleção; resultados confirmados alimentam confronto pendente; ADM valida; ranking da competição se atualiza atomicamente; resultado e log ficam vinculados ao confronto.
12. **Notificações opcionais.** Email ou WhatsApp mediante consentimento para inscrição aprovada, horário da série, convite para time, voto do outro capitão e parecer do ADM.
13. **Observabilidade e recuperação.** Backups regulares do ranking JSONB e tabelas, monitoração de Edge Function, logs de falhas, testes de autenticação em navegador e testes E2E de uma MD5.
14. **Arquitetura e performance.** Centralizar API de auth, catalogação de campeões, formatos e estados da série. Evitar regras duplicadas em HTMLs, Edge Functions e SQL. Aplicar paginação para listas grandes.

## Observações de testes
- A criação de jogos manuais e aprovação oficial em MD3 com elenco *válido* foram testadas em transação com rollback (sem pontos permanentes).
- Um relatório real **não pôde ser publicado no teste** devido a divergência de nick com o Ranking: isto é um problema de dados/vinculação a tratar antes da homologação.
- A função de CPF/telefone não existe; o telefone usa apenas DDD brasileiro e normalização +55.
- Os testes automatizados e a publicação no GitHub Actions não substituem testes visuais manuais em navegadores reais.
