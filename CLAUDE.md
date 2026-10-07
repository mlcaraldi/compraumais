# CompraMais

Sistema que cruza o pedido de um cliente de food service com as receitas e o histórico de compras dele e sugere itens adicionais, usando as ofertas vigentes da distribuidora. O MVP é usado por um representante comercial (Ricardo, carteira Dellys) e termina numa mensagem pronta que ele envia pelo próprio WhatsApp.

## Fonte da verdade
- `docs/plano-mvp.md`: especificação completa do MVP e lista de tarefas T01 a T16. **Leia antes de qualquer tarefa.**
- `docs/decisoes.md`: decisões tomadas durante a implementação (uma linha cada: data, decisão, motivo).
- Onde o código e o plano divergirem, pare e registre a divergência em `docs/decisoes.md` antes de seguir.

## Como trabalhar
- Execute as tarefas do plano na ordem, uma por vez. Não comece a próxima com critério de aceite pendente.
- Antes de encerrar uma tarefa: `pnpm lint && pnpm typecheck && pnpm test`. Tudo verde.
- Um commit por tarefa: `T0X: <resumo em português>`.
- Atualize a seção "Progresso" abaixo ao terminar cada tarefa.
- Mudanças pequenas e focadas. Não refatore código de tarefas anteriores sem necessidade.
- Não invente requisitos. Na dúvida, escolha a opção mais simples que cumpra o caso de uso e registre em `docs/decisoes.md`.

## Regras do domínio (não negociáveis)
- O motor de sugestões (`src/server/engine/`) é feito de funções puras: sem banco, sem rede, sem `Date.now()` direto (recebe `now`).
- **O sistema nunca inventa desconto.** Preço vem da oferta cadastrada ou do preço de lista; senão "consultar preço".
- Regra da âncora: sugestão de receita só quando o pedido contém um ingrediente âncora da receita.
- Item que o cliente compra sempre e ficou fora do pedido, sem oferta vigente, vira lembrete, não sugestão.
- Nada importado pela IA entra nas tabelas finais sem revisão e confirmação humana.
- "Validade do produto" num encarte não é vigência da oferta.
- Código de produto ambíguo (ex.: "168.90") nunca casa automaticamente.
- Dinheiro sempre em centavos (`integer`). Nunca `float` para dinheiro.
- Toda consulta filtra por `tenant_id` pela camada `src/server/repos/`.

## Stack
Next.js (App Router) + TypeScript strict, PostgreSQL 16 + Drizzle, pg-boss (worker separado em `worker/`), zod, Tailwind com tokens do branding, Radix UI, Vitest, Playwright, SDK `@anthropic-ai/sdk`.

## Claude API (importador)
- Use apenas o SDK oficial `@anthropic-ai/sdk`. Não use fetch direto nem SDKs de terceiros.
- Saída estruturada: `client.messages.parse({ ..., output_config: { effort: "medium", format: zodOutputFormat(Schema) } })` com `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"`. `parsed_output` pode ser nulo: trate.
- Modelo em `process.env.IMPORTER_MODEL` (padrão `claude-opus-5-5`; alternativa `claude-sonnet-5-5`). Use os IDs exatamente assim, sem sufixo de data.
- Não envie `thinking: { type: "disabled" }` nem `budget_tokens` (esses modelos retornam erro 400). Não use `tool_choice` forçado (`any`/`tool`), também 400. Não use prefill de resposta do assistente.
- Verifique `stop_reason === "refusal"` antes de ler o conteúdo.
- Imagem: bloco `{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }`; PDF: `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`; sempre antes do bloco de texto.
- Erros: trate por classe do SDK (limite de taxa e 5xx podem repetir; 400 não).
- Prompts ficam em arquivos `src/server/importers/ai/prompts/*.md`, em português.

## Dados
- Dados reais ficam em `data/real/` (no `.gitignore`). Nunca commite dados de clientes, telefones ou documentos.
- Testes que dependem de `data/real/` devem pular com aviso quando o arquivo não existir.
- `pnpm test` nunca chama a API da Claude. Testes com IA ficam em `tests/ai/` e rodam só com `pnpm test:ai`.

## Interface e textos
- Tudo em português do Brasil, frases em caixa de sentença.
- Use os componentes de `src/components/` e as variáveis de `src/styles/tokens/`. Não escreva cores em hexadecimal fora dos tokens.
- Mensagens de WhatsApp: "você", número antes de adjetivo, sem "imperdível", no máximo um "!", sem emoji.

## Comandos
- `docker compose up -d`: bancos de dev (5432) e teste (5433)
- `pnpm dev` / `pnpm worker:dev`
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed`
- `pnpm user:create --email x --name y --role admin`
- `pnpm import --kind customers|products|recipes|order|promotion --file <caminho> [--auto-confirm]`
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:ai` / `pnpm test:e2e`

## Progresso
- [ ] T01 Fundação
- [ ] T02 Design system
- [ ] T03 Banco, autenticação e layout
- [ ] T04 Normalizadores e segmentos
- [ ] T05 Upload e importação de clientes
- [ ] T06 Telas de clientes e produtos
- [ ] T07 Receitas
- [ ] T08 Fila de jobs e cliente de IA
- [ ] T09 Importador de pedido
- [ ] T10 Importador de encartes
- [ ] T11 Motor de sugestões
- [ ] T12 Tela do pedido e resultado
- [ ] T13 Painel
- [ ] T14 Ciclo de vida das ofertas
- [ ] T15 Carga inicial e demo
- [ ] T16 Deploy
