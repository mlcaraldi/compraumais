2026-10-07 | Bancos de dev e teste rodam no Postgres 16 local (portas 5432 e 5433) no ambiente de nuvem, sem Docker daemon; docker-compose.yml continua sendo o caminho documentado | o container de desenvolvimento não expõe Docker
2026-10-07 | TypeScript fixado em 5.x (não 7) e Next 16 | compatibilidade com eslint-config-next e plugin do Next
2026-10-07 | Tabelas filhas (recipe_segments, recipe_items, order_lines, import_rows, promotion_items, suggestion_items, suggestion_messages, suggestion_outcomes) também têm tenant_id | o plano diz "toda tabela de negócio tem tenant_id"; simplifica os repos
2026-10-07 | Next 16 renomeou middleware para proxy: proteção das rotas está em src/proxy.ts (valida a assinatura do cookie) e o layout de (app) revalida o usuário no banco | convenção do Next 16
2026-10-07 | Sessão é cookie httpOnly com token HMAC-SHA256 (uid, tid, exp de 7 dias), sem tabela de sessões | simples para 2 usuários; logout apaga o cookie
2026-10-07 | Rate limit do login em memória (5 por minuto por IP) | simples; reinicia com o processo, aceitável no MVP
2026-10-07 | O login é a única consulta sem tenantId (e-mail é único no sistema), isolada em server/auth/authenticate.ts | tenant ainda não é conhecido no login
2026-10-07 | Parâmetros do motor ficam em settings com a chave "engine" (um JSON) | um registro só, mesclado com os padrões
2026-10-07 | /dev/ui fica fora do proxy mas responde 404 em produção | só existe em desenvolvimento
2026-10-07 | Telefone: o código de operadora (após o 0 inicial) é removido quando sobram de 10 a 13 dígitos, não só 12 ou 13 | cobre "0 15 54 99612-3757" sem DDD+55; números sem 55 de 13 dígitos não existem, então não há ambiguidade
2026-10-07 | Ramo em branco não vira alias (51 aliases); o importador de clientes atribui direto o segmento sem_ramo | o plano exige 51 aliases e 11 segmentos
2026-10-07 | tests/fixtures/segmentos_ramo.csv é cópia do CSV de ramos (sem dados pessoais) usada pelo seed quando data/real não existe | previsto no plano (T04)
2026-10-07 | DDDs válidos usam a lista real de DDDs brasileiros, não "11 a 99" | evita aceitar DDDs que não existem (ex.: 20, 23)
2026-10-07 | Leitor de XLSX próprio (fflate + fast-xml-parser) em vez de exceljs | a exportação do ERP usa prefixo de namespace x:, links absolutos e strings inline; exceljs e read-excel-file falharam na planilha real; SheetJS do npm (0.18.5) tem CVEs e o CDN oficial é bloqueado
2026-10-07 | Armazenamento de arquivos com dois drivers: disco (padrão) e Postgres (tabela file_blobs, STORAGE_DRIVER=db) | homologação na Vercel não tem disco persistente; o plano de produção em EC2 continua com disco
2026-10-07 | Homologação: Vercel + Supabase (pedido do Marcelo, 07/10); migrations, seed e primeiro admin rodam no build (pnpm predeploy) | substitui a T16 para teste; EC2 segue previsto para produção
2026-10-07 | Upload limitado a 4 MB (Vercel limita o corpo da requisição a 4,5 MB); o PDF Promoções.pdf (8 MB) não pode ser enviado por upload na homologação | limite da plataforma
2026-10-07 | Conexão com banco remoto usa TLS sem verificar a cadeia (rejectUnauthorized=false) | o certificado do pooler do Supabase não está no trust store padrão do Node; aceitável em homologação
2026-10-07 | Importação de planilha de clientes é síncrona (sem fila): o job nasce direto em "review" | não há IA; leva menos de 1 s para 242 linhas
2026-10-07 | Linha duplicada de código na planilha: a repetida é rejeitada com aviso bloqueante; aceitar de novo exige resolver | evita upsert duplo no mesmo lote
2026-10-07 | Rota extra /produtos/[id] para editar produto | o plano pede edição em /produtos sem dizer onde; uma página própria é o mais simples
2026-10-07 | Importador de catálogo: código fora de 4 a 7 dígitos (ou ambíguo) vira linha pendente que só pode ser rejeitada; preço, marca, embalagem e categoria vazios na planilha nova não apagam o que já existe | segue as regras de código do plano e evita perder dados já cadastrados
2026-10-07 | Revisão de importação paginada no SQL (50 linhas) e genérica por tipo (clientes e produtos) | catálogos de 7.000 linhas não cabem numa página só
