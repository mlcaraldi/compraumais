2026-10-07 | Bancos de dev e teste rodam no Postgres 16 local (portas 5432 e 5433) no ambiente de nuvem, sem Docker daemon; docker-compose.yml continua sendo o caminho documentado | o container de desenvolvimento não expõe Docker
2026-10-07 | TypeScript fixado em 5.x (não 7) e Next 16 | compatibilidade com eslint-config-next e plugin do Next
2026-10-07 | Tabelas filhas (recipe_segments, recipe_items, order_lines, import_rows, promotion_items, suggestion_items, suggestion_messages, suggestion_outcomes) também têm tenant_id | o plano diz "toda tabela de negócio tem tenant_id"; simplifica os repos
2026-10-07 | Next 16 renomeou middleware para proxy: proteção das rotas está em src/proxy.ts (valida a assinatura do cookie) e o layout de (app) revalida o usuário no banco | convenção do Next 16
2026-10-07 | Sessão é cookie httpOnly com token HMAC-SHA256 (uid, tid, exp de 7 dias), sem tabela de sessões | simples para 2 usuários; logout apaga o cookie
2026-10-07 | Rate limit do login em memória (5 por minuto por IP) | simples; reinicia com o processo, aceitável no MVP
2026-10-07 | O login é a única consulta sem tenantId (e-mail é único no sistema), isolada em server/auth/authenticate.ts | tenant ainda não é conhecido no login
2026-10-07 | Parâmetros do motor ficam em settings com a chave "engine" (um JSON) | um registro só, mesclado com os padrões
2026-10-07 | /dev/ui fica fora do proxy mas responde 404 em produção | só existe em desenvolvimento
