# CompraMais MVP: plano de implementação

Versão final, 07/10/2026. Este documento é autossuficiente: o Claude Code (modelo Sonnet) deve conseguir implementar o MVP inteiro só com ele, o `CLAUDE.md` que o acompanha e os arquivos de dados listados na seção 3. O plano de arquitetura completo ([../arquitetura-sistema.md](../arquitetura-sistema.md)) é contexto para as fases seguintes; **onde os dois divergirem, este documento vence.**

---

## 0. Como o Claude Code deve usar este documento

1. Leia este arquivo inteiro e o `CLAUDE.md` antes de escrever código.
2. Execute as tarefas da seção 11 **na ordem**, uma por vez. Não comece a próxima antes de todos os critérios de aceite da atual passarem.
3. Ao terminar cada tarefa: rode `pnpm lint`, `pnpm typecheck` e `pnpm test`; faça um commit com a mensagem `T0X: <resumo>`; atualize a seção "Progresso" do `CLAUDE.md`.
4. Não invente requisitos. Quando algo não estiver especificado, escolha a opção mais simples que cumpra o caso de uso, registre a decisão em `docs/decisoes.md` (uma linha: data, decisão, motivo) e siga.
5. Nunca coloque dados reais de clientes no git. Eles ficam em `data/real/` (no `.gitignore`).
6. Toda a interface e todas as mensagens geradas são em português do Brasil.

---

## 1. O caso de uso do MVP

Ricardo (representante comercial da Dellys, carteira de 242 clientes em Passo Fundo e região) usa o sistema assim:

1. **Cadastra os clientes** importando a planilha exportada do ERP.
2. **Cadastra as receitas** (fichas técnicas dos chefs) importando planilha/PDF ou digitando.
3. **Cadastra os produtos**, que entram pelos encartes, pelos pedidos e por planilha de catálogo quando houver.
4. **Sobe um pedido real** de um cliente real (PDF impresso do sistema de pedidos).
5. O sistema **cruza o pedido com o histórico de compras e as receitas do cliente** e sugere itens adicionais.
6. O sistema **considera as ofertas vigentes** (encartes da semana ou ofertas cadastradas) ao sugerir e ao dar preço.
7. Ricardo **importa os encartes de oferta** (imagens JPEG e PDFs) por um **agente importador de IA**, revisa e confirma.

Ao final, a tela do pedido mostra até 3 sugestões com justificativa e preço, e uma mensagem pronta que o Ricardo envia pelo WhatsApp dele com um clique. Depois ele registra o resultado (aceitou, recusou, sem resposta).

### Definição de pronto (demo final)
Com o banco vazio, em menos de 30 minutos, o Ricardo consegue: importar a planilha de clientes (242 clientes), importar as 9 receitas da cafeteria, importar 5 encartes reais, associar receitas a um cliente, subir o PDF do pedido 2707401471, ver as sugestões e abrir o WhatsApp com a mensagem pronta.

---

## 2. Fora do escopo do MVP

Envio automático pelo WhatsApp Business API, integração com ERP, inclusão automática no pedido, validade em minutos, alerta automático ao vendedor, multiempresa com RLS, grupo de controle, app mobile. O modelo de dados deixa espaço para essas fases sem retrabalho, mas nenhuma delas é implementada agora.

---

## 3. Arquivos de dados reais

Copiar para `data/real/` no repositório (pasta ignorada pelo git). Origem: pasta de arquivos do projeto CompraMais.

| Arquivo em `data/real/` | Origem no projeto | Uso |
|---|---|---|
| `clientes.xlsx` | `CompraMais/Lista clientes.xlsx` | Importação de clientes (T05) |
| `pedido-2707401471.pdf` | `uploads/hearth/d61b9973-4959-43c1-aa27-880c00abdc67` (renomear) | Teste do importador de pedido (T09) |
| `fichas-cafeteria.xlsx` | `uploads/hearth/36aae7cb-27d5-4e8d-b154-420d8d902260` (renomear) | Importação de receitas (T07) |
| `receitas_normalizadas.csv` | `compramais/receitas_normalizadas.csv` | Seed e teste de receitas (T07) |
| `segmentos_ramo.csv` | `compramais/segmentos_ramo.csv` | Seed de segmentos (T04) |
| `encartes/*.jpeg` | `CompraMais/Ofertas e promoções/Promoções/**` | Testes do importador de ofertas (T10) |
| `branding.zip` | `CompraMais/CompraMais branding completo.zip` | Design system (T02) |

Observação: a pasta `CompraMais/Ofertas e promoções/` (fora de `Promoções/`) tem principalmente prints da lista de clientes do app de pedidos, não encartes. Há imagens duplicadas entre subpastas; deduplicar por SHA-256 ao copiar.

### O que já se sabe desses arquivos

**Planilha de clientes:** 1 aba "Export", 242 clientes, células como strings inline (sem sharedStrings), datas como número serial do Excel. A última linha é um rodapé com os filtros da exportação (ignorar linhas sem "Código Cliente"). Colunas: `CPF/CNPJ | Código Cliente | Nome Cliente | Fantasia | Dt. Cadastro | Dt. Últ. Compra | Bloqueio | Endereço Entrega | Nº | Bairro Entrega | Município | Estado | Telefone | Ramo Atividade | CNAE`. Código e CPF/CNPJ são únicos. 36 clientes com Bloqueio = S. 51 valores de Ramo Atividade, todos mapeados em `segmentos_ramo.csv`. Telefones em formatos mistos (seção 6.1).

**Pedido 2707401471:** emitido por OESA Comércio e Representações S/A, representante 2707, data 02/07/2026, 3 itens, total R$ 134,70:
```
cod    | descricao                     | emb     | qtde | vlr_unit | total
166225 | VG VAGEM 2KG CG CONFRESCOR    | QUILO   | 2    | 16,64    | 33,28
108576 | VG GRAO DE BICO 1KG CG GRANO  | UNIDADE | 2    | 27,94    | 55,88
110647 | AMIDO DE MILHO PCT 5KG NUANCE | UNIDADE | 1    | 45,54    | 45,54
```
Nenhum desses itens aparece nas receitas da cafeteria. O resultado esperado do motor para esse pedido com essas receitas é "sem sugestão de receita" (regra da âncora).

**Receitas:** 9 receitas de cafeteria (4 cafés, 5 sanduíches/waffles), 45 linhas de ingrediente, 22 ingredientes distintos, sem código de produto. Colunas do CSV: `aba,receita,ingrediente,qtd_por_porcao,unidade,embalagem_g_ml,preco_embalagem_rs,custo_porcao_rs`. Erros conhecidos: "Peito de perú (2 Farias)"; Nescafé com unidade "ml" e quantidade 0,14 que na verdade é a embalagem inteira de 140.

**Encartes:** imagens JPEG da Dellys. Trazem código do produto em formatos variados ("Cód. 134911", "CÓDIGO 134.352", e ambíguos como "CÓD. 168.90" e "CÓD. 94.2"), descrição, embalagem e preço com unidades diferentes ("/pacote", "/un.", "cada", "R$/kg", "preço por caixa"). Nenhum traz vigência da oferta. Um traz "Validade do produto 14/12/2026", que é validade do produto, não da oferta. Um traz combo ("compre 2 caixas e ganhe 1").

---

## 4. Decisões técnicas (fixas para o MVP)

| Tema | Escolha | Motivo |
|---|---|---|
| Linguagem | TypeScript strict, Node.js 22 LTS | Um idioma só no front e no back |
| Gerenciador | pnpm | Rápido, lockfile confiável |
| App | **Um único projeto Next.js (App Router)** com Server Actions e Route Handlers | Menos peças que API + console separados; suficiente para 2 usuários |
| Worker | Processo Node separado (`worker/index.ts`) no mesmo repositório, usando **pg-boss** | Extração por IA leva de segundos a minutos; não pode rodar dentro do request |
| Banco | PostgreSQL 16 (Docker), **Drizzle ORM** + drizzle-kit para migrations | Tipagem forte, SQL legível |
| Extensões | `pg_trgm` (busca por similaridade de descrição), `unaccent` | Casamento de produtos por descrição |
| Validação | zod em todas as fronteiras (formulários, importadores, saída da IA) | Um schema serve para validar e tipar |
| Estilo | Tailwind CSS + tokens do branding como variáveis CSS | Tokens já existem no zip |
| Componentes | Componentes do branding convertidos para TSX + Radix UI para o que falta (Dialog, Select, Checkbox, Tabs, Toast) | O kit do branding não tem esses |
| Autenticação | E-mail e senha (hash argon2), usuários criados por script `pnpm user:create`, sessão por cookie httpOnly | Dois usuários; sem dependência de serviço de e-mail |
| Planilhas | `exceljs` para ler XLSX (testar com a planilha real; se não ler strings inline, trocar por SheetJS e registrar em decisões) e `papaparse` para CSV | |
| Imagens | `sharp` para gerar miniatura e reduzir imagem antes de enviar à IA | Custo e limite de tamanho |
| IA | SDK oficial `@anthropic-ai/sdk`, `client.messages.parse` com `zodOutputFormat` | Saída estruturada validada |
| Modelo da IA | `claude-opus-5-5` por padrão, configurável por `IMPORTER_MODEL`; `output_config.effort = "medium"` | Precisão na leitura de encartes densos; volume baixo. Testar `claude-sonnet-5-5` (metade do preço) com os testes de IA da T10 e trocar se a precisão se mantiver |
| Arquivos enviados | Guardados em disco em `storage/` (volume Docker), nome = SHA-256 | Simples; S3 fica para depois |
| Testes | Vitest (unidade e integração com Postgres de teste via Docker), Playwright (1 teste de ponta a ponta) | |
| Deploy | 1 VM (AWS EC2 t4g.small, sa-east-1) com Docker Compose: `app`, `worker`, `db`, `caddy` (HTTPS) | Barato e simples para o piloto |

**Multiempresa:** toda tabela de negócio tem `tenant_id` com um único tenant criado no seed ("Carteira Ricardo"). Todas as consultas filtram por `tenant_id` numa camada de repositório. Sem RLS no MVP (fica para quando houver segundo cliente).

---

## 5. Estrutura do repositório

```
compramais/
  CLAUDE.md
  README.md
  docs/decisoes.md
  docker-compose.yml          # db (dev), db-test
  docker-compose.prod.yml     # app, worker, db, caddy
  Caddyfile
  .env.example
  package.json
  drizzle.config.ts
  data/real/                  # ignorado pelo git
  storage/                    # ignorado pelo git
  src/
    app/                      # rotas Next.js (seção 9)
      (auth)/login/
      (app)/
        clientes/  produtos/  receitas/  ofertas/  pedidos/  importacoes/  painel/  configuracoes/
      api/files/[sha]/route.ts    # serve arquivos de storage/ para usuários logados
    components/
      brand/                  # Logo, etc. (do branding)
      core/                   # Button, Badge, Card, Input, SectionLabel (do branding) + Dialog, Select, Checkbox, Tabs, Toast (Radix)
      kitchen/                # FichaTecnica, OrderRow, WhatsAppOffer, FollowUpAlert (do branding)
    styles/tokens/            # colors.css, fonts.css, spacing.css, typography.css (do branding)
    server/
      db/
        schema.ts
        client.ts
        migrations/
        seed.ts
      auth/
      repos/                  # acesso a dados, sempre com tenant_id
      normalize/              # phone.ts, document.ts, money.ts, pack.ts, product-code.ts, excel-date.ts, text.ts
      importers/
        spreadsheet/          # customers.ts, products.ts, recipes-csv.ts, recipes-xlsx.ts
        ai/                   # client.ts, schemas.ts, prompts/, extract-order.ts, extract-promotion.ts, extract-recipe.ts
        matching/             # match-product.ts, match-customer.ts
        commit/               # grava import_rows aprovadas nas tabelas finais
      engine/                 # motor de sugestões (funções puras)
        types.ts  anchor.ts  candidates.ts  coverage.ts  regulars.ts  score.ts  promo.ts  decide.ts  message.ts
      jobs/                   # handlers pg-boss: import.extract, suggestion.run
      services/               # orquestração usada pelas Server Actions
  worker/index.ts
  scripts/
    create-user.ts
    import-cli.ts             # importar arquivos pela linha de comando (útil para testes e carga inicial)
  tests/
    unit/  integration/  ai/  e2e/
    fixtures/                 # dados sintéticos, sem dados reais
```

---

## 6. Regras de normalização (implementar em `src/server/normalize/`, com testes unitários)

### 6.1 Telefone (`phone.ts`)
Entrada: texto livre. Saída: `{ e164: string | null, kind: 'mobile' | 'landline' | 'invalid', fixedNinthDigit: boolean }`.
1. Remover tudo que não é dígito.
2. Se começar com `0`, remover o `0` e, se os 2 dígitos seguintes forem código de operadora conhecido (`12, 14, 15, 21, 25, 31, 41, 43, 49`) e sobrarem 12 ou 13 dígitos, remover também esses 2.
3. Se começar com `55` e tiver 12 ou 13 dígitos, remover o `55`.
4. Agora com DDD + número:
   - 11 dígitos e terceiro dígito = `9`: celular. `e164 = +55` + dígitos.
   - 10 dígitos e terceiro dígito entre `6` e `9`: celular antigo; inserir `9` após o DDD; `fixedNinthDigit = true`.
   - 10 dígitos e terceiro dígito entre `2` e `5`: fixo (`landline`); `e164` preenchido, sem WhatsApp provável.
   - qualquer outro caso (9 dígitos sem DDD, tamanho errado): `invalid`, `e164 = null`.
5. DDD válido: 11 a 99, sem zero no segundo dígito do DDD (lista dos DDDs brasileiros em constante).

Casos de teste obrigatórios: `5554996058391` → `+5554996058391` mobile; `54999314042` → `+5554999314042` mobile; `5436320079` → `+555436320079` landline; `5496123757` → `+5554996123757` mobile com `fixedNinthDigit`; `996123757` → invalid; `054 9961-23757` → `+5554996123757`.

### 6.2 CPF/CNPJ (`document.ts`)
Só dígitos. 11 dígitos = CPF, 14 = CNPJ. Validar dígitos verificadores; inválido não bloqueia a importação, mas vira aviso na revisão.

### 6.3 Dinheiro (`money.ts`)
`"R$ 1.234,56"`, `"1234,56"`, `"19,39"`, `"R$19,39/kg"` → número com 2 casas. Guardar em centavos (`integer`) no banco para evitar erro de ponto flutuante.

### 6.4 Embalagem (`pack.ts`)
Extrair de descrições e textos de embalagem: `"PCT 5KG"` → `{ qty: 1, unitSize: 5000, unit: 'g' }`; `"2KG"` → 2000 g; `"20X400G"` → `{ qty: 20, unitSize: 400, unit: 'g' }`; `"CX C/12 UN"` → `{ qty: 12, unit: 'un' }`; `"1,05 kg"` → 1050 g; `"12X1L"` → `{ qty: 12, unitSize: 1000, unit: 'ml' }`. Se não reconhecer, retornar `null` (não adivinhar).

### 6.5 Código de produto (`product-code.ts`)
Remover espaços, pontos e prefixos "CÓD.", "COD", "CÓDIGO". Resultado precisa ser só dígitos com 4 a 7 caracteres; senão `null`. Retornar também `ambiguous = true` quando o texto original tinha ponto e a parte após o último ponto tem menos de 3 dígitos (ex.: "168.90", "94.2"). Código ambíguo nunca casa automaticamente.

### 6.6 Datas
Serial do Excel → data (`excel-date.ts`; base 1899-12-30). Datas "dd/mm/aaaa" e "dd/mm" (assumir ano corrente, ou o próximo se a data já passou há mais de 6 meses).

### 6.7 Texto
`normalizeText`: maiúsculas, sem acento, espaços colapsados. Usado em chaves de busca, nunca para exibir.

---

## 7. Modelo de dados (Drizzle, `src/server/db/schema.ts`)

Convenções: chave primária `id uuid default gen_random_uuid()`; `tenant_id uuid not null` em todas as tabelas de negócio; `created_at`/`updated_at timestamptz`; dinheiro em centavos (`integer`); textos de enum como `text` com check constraint.

| Tabela | Colunas principais |
|---|---|
| `tenants` | id, name |
| `users` | id, tenant_id, email (único), name, password_hash, role (`admin`/`operator`) |
| `segments` | id, tenant_id, code (ex.: `lanches`), name, has_recipes (bool) |
| `segment_aliases` | id, tenant_id, raw_value (normalizado, único por tenant), segment_id |
| `customers` | id, tenant_id, external_code (único por tenant), document, document_valid, legal_name, trade_name, contact_name (null; editável), registered_at, last_purchase_at, blocked (bool), address, address_number, district, city, state, phone_raw, phone_e164, phone_kind, segment_raw, segment_id, cnae, notes |
| `products` | id, tenant_id, code (único por tenant), description, brand, pack_text, pack_qty, pack_unit_size, pack_unit, sale_unit (`un`/`pct`/`kg`/`cx`), list_price_cents (null), price_updated_at, category (null), sellable (bool, default true), source (`catalog`/`order`/`promotion`/`manual`), search_text (normalizado, com índice trigram) |
| `ingredients` | id, tenant_id, name, normalized_name (único), is_commodity (bool) |
| `ingredient_products` | id, tenant_id, ingredient_id, product_id, priority (int, 1 = preferido), status (`suggested`/`approved`/`rejected`), suggested_by (`ai`/`user`) |
| `recipes` | id, tenant_id, name, yield_portions (default 1), photo_sha (null), source_document_id (null), status (`draft`/`active`) |
| `recipe_segments` | recipe_id, segment_id (receita pode servir a vários segmentos) |
| `recipe_items` | id, recipe_id, ingredient_id, qty_per_portion (numeric), unit (`g`/`ml`/`un`), is_anchor (bool), is_essential (bool), pack_size_hint (numeric null), pack_price_hint_cents (null) |
| `customer_recipes` | id, tenant_id, customer_id, recipe_id, portions_per_day (numeric null), source (`user`/`segment_suggestion`), confirmed (bool) |
| `orders` | id, tenant_id, external_number (único por tenant), customer_id, rep_code, issued_at, payment_terms, total_cents, source_document_id, status (`draft`/`confirmed`) |
| `order_lines` | id, order_id, product_id, raw_code, raw_description, unit, qty (numeric), unit_price_cents, total_cents |
| `documents` | id, tenant_id, sha256 (único por tenant), filename, mime, size_bytes, kind (`customers`/`products`/`recipes`/`order`/`promotion`), uploaded_by, uploaded_at |
| `import_jobs` | id, tenant_id, document_id, kind, status (`queued`/`extracting`/`review`/`committing`/`done`/`failed`), model, input_tokens, output_tokens, cost_cents_estimate, raw_output (jsonb), error, created_by, confirmed_by, confirmed_at |
| `import_rows` | id, import_job_id, row_index, row_type (`customer`/`product`/`recipe`/`recipe_item`/`order_header`/`order_line`/`promotion_header`/`promotion_item`), data (jsonb, já normalizado), warnings (jsonb array), confidence (numeric 0-1 null), match_type (`code`/`document`/`description`/`new`/`none`), match_id (uuid null), match_score (numeric null), status (`pending`/`accepted`/`edited`/`rejected`) |
| `promotions` | id, tenant_id, name, supplier_brand, starts_on (date), ends_on (date), conditions_text, target_segments_hint (text[]), document_id, status (`active`/`expired`/`draft`) |
| `promotion_items` | id, promotion_id, product_id (null se sem vínculo), raw_code, raw_description, pack_text, price_cents, price_unit (`un`/`pct`/`kg`/`cx`), box_price_cents (null), regular_price_cents (null), price_type (`unit_price`/`min_qty`/`bundle`/`other`), min_qty (null), condition_text (null) |
| `suggestion_runs` | id, tenant_id, order_id, engine_version, settings_snapshot (jsonb), created_at |
| `suggestion_items` | id, run_id, list (`A`/`B`/`reminder`), product_id, recipe_ids (uuid[]), promotion_item_id (null), price_cents, price_unit, score (numeric), rank (int), reasons (jsonb) |
| `suggestion_messages` | id, run_id, text, edited_text (null), created_at |
| `suggestion_outcomes` | id, run_id, sent (bool), sent_at, result (`accepted`/`partial`/`declined`/`no_response`/`not_sent`), accepted_product_ids (uuid[]), note, recorded_by |
| `settings` | tenant_id, key, value (jsonb): parâmetros da seção 8.6 |
| `audit_log` | id, tenant_id, user_id, action, entity, entity_id, diff (jsonb), at |

**Histórico de compras** = `order_lines` de `orders` com `status = 'confirmed'`. Não há tabela separada.

**Produtos sem catálogo:** ainda não existe exportação do catálogo da Dellys. Por isso, produtos nascem de três fontes: linhas de pedido importadas, itens de encarte importados e planilha de catálogo (quando houver). Na revisão de importação, código que não existe vira produto novo (`match_type = 'new'`) com `source` correspondente. Quando um catálogo chegar, a importação de produtos atualiza descrição, embalagem e preço pelo código.

---

## 8. Motor de sugestões (`src/server/engine/`, funções puras, sem acesso a banco)

### 8.1 Entrada
```ts
type EngineInput = {
  now: Date;
  order: { id: string; issuedAt: Date; lines: { productId: string; qty: number }[] };
  customer: { id: string; blocked: boolean; segmentCode: string | null; phoneKind: string };
  customerRecipes: { recipeId: string; portionsPerDay: number | null }[];
  recipes: { id: string; name: string; items: { ingredientId: string; qtyPerPortion: number; unit: 'g'|'ml'|'un'; isAnchor: boolean; isEssential: boolean }[] }[];
  ingredientProducts: { ingredientId: string; productId: string; priority: number }[];   // só approved
  products: Record<string, { id: string; description: string; sellable: boolean; packTotal: number | null; packUnit: 'g'|'ml'|'un'|null; listPriceCents: number | null; category: string | null }>;
  history: { productId: string; qty: number; date: Date; orderId: string }[];            // pedidos confirmados anteriores, mais recentes primeiro
  activePromotions: { promotionItemId: string; productId: string; priceCents: number; priceUnit: string; priceType: string; minQty: number | null; endsOn: Date; regularPriceCents: number | null }[];
  settings: EngineSettings;
};
```

### 8.2 Passo 1: receitas ativadas (lista A)
Para cada receita do cliente, a receita está **ativada** se algum produto do pedido está mapeado (via `ingredientProducts`) para um ingrediente da receita com `isAnchor = true`. Sem receita ativada, a lista A fica vazia (motivo `no_anchor`). Se nenhum ingrediente da receita estiver marcado como âncora, considerar âncoras todos os ingredientes com `is_commodity = false`.

### 8.3 Passo 2: candidatos da lista A
Para cada receita ativada, cada ingrediente cujo produto não está no pedido vira candidato. Escolha do produto do ingrediente: (1) o que o cliente já comprou no histórico; (2) senão, o de menor `priority`. Descartar se `sellable = false` ou se o ingrediente não tem produto aprovado (registrar em `reasons` como "ingrediente sem produto vinculado", para aparecer na tela como pendência).

### 8.4 Passo 3: filtros
1. **Cobertura (cliente ainda tem estoque):** para produto comprado antes,
   - se houver `portionsPerDay` em alguma receita do cliente que usa o ingrediente e o produto tem `packTotal`: `diasCobertura = (qtdUltimaCompra × packTotal) / Σ(qtyPerPortion × portionsPerDay)`;
   - senão, se houver 3 ou mais compras do produto: `diasCobertura = mediana dos intervalos entre compras`;
   - senão: `diasCobertura = settings.defaultCoverageDays` (padrão 14).
   Descartar se `diasDesdeUltimaCompra < diasCobertura × settings.coverageFactor` (padrão 0,8).
2. **Item regular:** produto presente em pelo menos `regularMinHits` dos últimos `regularWindowOrders` pedidos (padrão 3 de 6). Item regular ausente do pedido **sem oferta vigente** sai das listas A e B e vai para `reminder` (lembrete ao vendedor, sem destaque de preço). Item regular **com** oferta vigente pode aparecer normalmente (o preço do encarte vale para todos, então omitir não traz vantagem ao cliente).
3. **Recusa recente:** produto marcado como recusado pelo cliente nas últimas `declineCooldownDays` (padrão 30) sai.

### 8.5 Passo 4: lista B (ofertas vigentes que servem ao cliente)
Itens de `activePromotions` com `priceType` em (`unit_price`, `min_qty`), cujo produto:
- é produto aprovado de algum ingrediente de **qualquer** receita do cliente (não precisa de âncora), **ou**, se o cliente não tem receitas, pertence a uma `category` que o cliente comprou nos últimos 90 dias (se categoria não existir, usar "produto do mesmo `brand`" como aproximação; se nada disso existir, não entra);
- não está no pedido; passa nos filtros 1 e 3 do passo 3.

### 8.6 Passo 5: pontuação, corte e preço
- Lista A: `score = 3 × receitasQueCompleta + 1 × essencial + 2 × temOfertaVigente`.
- Lista B: `score = 2 × receitasQueAtende + 1 × economiaRelativa (0 a 1, se houver preço regular) + 1 × compradoNaCategoriaEm90d`.
- Um produto aparece em uma só lista (A tem prioridade). Ordenar por score; limite total `maxSuggestions` (padrão 3), com até `maxListB` (padrão 2) da lista B.
- Preço: com oferta vigente, `priceCents` da oferta (e `minQty` se houver); sem oferta, `listPriceCents` do produto com `priceSource = 'list'`; sem nenhum dos dois, `price = null` e a tela mostra "consultar preço". **O motor nunca calcula desconto próprio.**
- Cliente bloqueado: o motor roda normalmente e marca `warnings: ['customer_blocked']`.
- Telefone `landline` ou `invalid`: `warnings: ['no_whatsapp']` (o botão de WhatsApp fica desabilitado; o texto pode ser copiado).

`EngineSettings` (tabela `settings`, com estes padrões): `maxSuggestions 3`, `maxListB 2`, `coverageFactor 0.8`, `defaultCoverageDays 14`, `regularMinHits 3`, `regularWindowOrders 6`, `declineCooldownDays 30`, `promotionDefaultDays 7`.

### 8.7 Saída
```ts
type EngineOutput = {
  engineVersion: string;            // ex.: "mvp-1"
  items: { list: 'A'|'B'|'reminder'; productId: string; recipeIds: string[]; promotionItemId: string | null;
           priceCents: number | null; priceUnit: string | null; priceSource: 'promotion'|'list'|null;
           score: number; reasons: Reason[] }[];
  warnings: ('customer_blocked'|'no_whatsapp'|'no_recipes'|'no_anchor'|'unmapped_ingredients')[];
};
type Reason =
  | { type: 'anchor'; anchorProductId: string; recipeId: string }
  | { type: 'completes_recipes'; recipeIds: string[] }
  | { type: 'last_purchase'; daysAgo: number | null; coverageDays: number }
  | { type: 'promotion'; endsOn: string; priceCents: number; regularPriceCents: number | null }
  | { type: 'regular_item_missing' }
  | { type: 'unmapped_ingredient'; ingredientId: string };
```
A tela converte `reasons` em frases (ex.: "O pedido tem Pão Australiano e faltou o Molho Grill. Completa 2 receitas. Última compra há 47 dias. Em oferta até 12/10 por R$ 40,25.").

### 8.8 Mensagem de WhatsApp (`message.ts`, determinística, sem IA)
Quem envia é o próprio Ricardo, então a mensagem é em primeira pessoa. Regras de tom do guia de marca: "você", número antes de adjetivo, sem "imperdível", no máximo um "!" (na saudação), sem emoji.

Modelo:
```
Oi, {saudacao}! Recebi seu pedido de hoje.
{linha por item, até 3}
Se quiser, incluo no mesmo pedido e vai na mesma entrega. É só me responder.
```
- `{saudacao}`: `contact_name` se preenchido; senão `trade_name` em formato título ("Restaurante e Cafe Cultura"); nunca a razão social.
- Linha item lista A: `Pro {receita}, faltou {produto curto}: R$ {preço}{/unidade}{, em oferta até dd/mm}.`
- Linha item lista B: `{produto curto} está em oferta esta semana: R$ {preço}{/unidade} até dd/mm.`
- Sem preço: `{produto curto}: posso te passar o preço.`
- `produto curto`: descrição em formato título, sem código.
- Link: `https://wa.me/{e164 sem +}?text={encodeURIComponent(texto)}`.
- Ricardo pode editar o texto na tela antes de enviar; salvar em `suggestion_messages.edited_text`.
- Itens `reminder` não entram na mensagem; aparecem só na tela, numa seção "Lembrar o cliente".

### 8.9 Testes do motor (Vitest, com fixtures sintéticas + receitas reais do CSV)
1. Pedido 2707401471 (vagem, grão de bico, amido) contra cliente com as 9 receitas da cafeteria → lista A vazia, warning `no_anchor`.
2. Pedido com Pão Australiano e sem Molho Grill Zafran → lista A contém o molho, com reason `anchor` apontando o pão.
3. Chantilly comprado há 2 dias, receita com 25 g/porção, 10 porções/dia, embalagem 1 kg (cobertura 4 dias) → não sugere.
4. Item regular (3 dos últimos 6 pedidos) ausente e sem oferta → vai para `reminder`, não para A nem B.
5. Mesmo item regular com oferta vigente → aparece na lista B com preço da oferta.
6. Oferta vigente de chantilly, cliente com receitas da cafeteria, sem compra de chantilly há 30 dias, pedido sem âncora → lista B sugere chantilly.
7. Produto sem preço de oferta nem de lista → `priceCents = null`.
8. Nunca mais de 3 itens; nunca mais de 2 da lista B; produto nunca nas duas listas.
9. Cliente bloqueado → sugestões geradas e warning `customer_blocked`.
10. `message.ts`: snapshot da mensagem para um caso com 1 item A e 1 item B; teste que a mensagem não contém "!!", "imperdível" nem emoji.

---

## 9. Telas

Layout: barra lateral com Logo e menu (Pedidos, Clientes, Receitas, Produtos, Ofertas, Importações, Painel, Configurações). Visual com os tokens e componentes do branding (seção 10). Todas as tabelas com busca e paginação de 50 linhas.

| Rota | Conteúdo |
|---|---|
| `/login` | E-mail e senha |
| `/pedidos` | Lista de pedidos (número, cliente, data, total, nº de sugestões, resultado). Botão **"Subir pedido"** (upload PDF/imagem) e **"Digitar pedido"** (formulário: cliente, linhas com código, quantidade, preço) |
| `/pedidos/[id]` | **Tela principal do MVP.** Coluna esquerda: componente `FichaTecnica` com as linhas do pedido (✓) e as sugestões ("+ oferta" / "+ sugerido"), cada uma com a justificativa em frases. Avisos (cliente bloqueado, sem WhatsApp, ingredientes sem produto vinculado). Seção "Lembrar o cliente" com os itens `reminder`. Coluna direita: `WhatsAppOffer` com a prévia da mensagem, textarea editável, botões **Copiar** e **Abrir no WhatsApp**. Abaixo: registrar resultado (enviado? aceitou / aceitou parte / recusou / sem resposta, itens aceitos, observação). Botão "Recalcular sugestões" (nova `suggestion_run`) |
| `/clientes` | Lista com filtros por segmento, cidade, bloqueado, tipo de telefone. Botão "Importar planilha" |
| `/clientes/[id]` | Dados do cliente (editar `contact_name`, telefone), receitas associadas (adicionar/remover, porções por dia), **receitas sugeridas pelo segmento** com botão "confirmar", histórico de pedidos e de sugestões |
| `/receitas` | Lista; botão "Importar" (CSV/XLSX/PDF) e "Nova receita" |
| `/receitas/[id]` | Editor: nome, segmentos, rendimento, ingredientes (quantidade por porção, unidade, âncora, essencial) e, por ingrediente, o produto vinculado (buscar produto; sugestões da IA com aprovar/rejeitar) |
| `/produtos` | Lista (código, descrição, embalagem, preço de lista, origem, vendável); editar; botão "Importar catálogo" |
| `/ofertas` | Encartes com vigência e status; ver itens; editar vigência; encerrar. Botão "Importar encartes" (vários arquivos de uma vez) |
| `/importacoes` | Fila de importações com status; abrir uma importação em revisão |
| `/importacoes/[id]` | **Tela de revisão.** Esquerda: o documento original (imagem com zoom, PDF embutido, ou a planilha). Direita: linhas extraídas editáveis, com destaque amarelo para confiança < 0,8 ou aviso, e vermelho para itens sem vínculo. Por linha: aceitar, editar, rejeitar, vincular a produto/cliente existente (busca), criar novo. Campos de cabeçalho (ex.: vigência do encarte, cliente do pedido). Botão **"Confirmar importação"** só habilita quando não houver pendência obrigatória |
| `/painel` | Pedidos processados, pedidos com sugestão, mensagens enviadas, taxa de aceite, valor aceito declarado, itens novos no mix, ofertas mais aceitas; filtro por período; exportar CSV |
| `/configuracoes` | Parâmetros do motor (8.6), segmentos e mapeamento de ramos, usuários |

---

## 10. Design system (do `branding.zip`)

O zip é saída do Claude Design. Antes de construir telas, ler `readme.md`, `SKILL.md`, os `*.prompt.md` de cada componente e o guia `CompraMais Guia de Marca.dc.html`.

- Copiar `tokens/*.css` para `src/styles/tokens/` e importar no layout raiz. Configurar Tailwind para usar as variáveis CSS (cores, raios, espaçamentos, fontes) em vez da paleta padrão.
- Copiar `assets/logo/*.svg` para `public/brand/`.
- Converter `components/core/*` e `components/kitchen/*` de JSX para TSX em `src/components/`, mantendo a API descrita nos `.d.ts`.
- Criar Dialog, Select, Checkbox, Tabs e Toast com Radix UI, estilizados com os mesmos tokens (raio 12 px em inputs e botões, foco com borda verde-noite e anel brasa a 25%).
- Tokens principais: verde-noite `#1F2A24`, farinha `#F7F3EC` (fundo), brasa `#D9822B` (botão primário), brasa-escura `#A35512` (texto de destaque em fundo claro), manjericão `#3F6B4E` (sucesso), sal `#FFFDF9` (cards), linho `#E8E0D2` (bordas). Fontes: Bricolage Grotesque (títulos), IBM Plex Sans (interface), IBM Plex Mono (rótulos, quantidades, preços com `font-variant-numeric: tabular-nums`).
- Proibido pelo guia: vermelho/amarelo de fast food, gradientes roxo/azul, neon, glassmorphism, animações com bounce, emoji na interface.

---

## 11. Tarefas (executar em ordem)

Cada tarefa lista objetivo, passos e critérios de aceite. Uma tarefa só termina quando todos os critérios passam.

### T01. Fundação do projeto
- Criar o projeto Next.js com TypeScript strict, ESLint, Prettier, Tailwind, Vitest, Playwright, pnpm.
- `docker-compose.yml` com `db` (Postgres 16, porta 5432) e `db-test` (porta 5433, tmpfs).
- `.env.example`: `DATABASE_URL`, `DATABASE_URL_TEST`, `ANTHROPIC_API_KEY`, `IMPORTER_MODEL=claude-opus-5-5`, `SESSION_SECRET`, `STORAGE_DIR=./storage`, `REAL_DATA_DIR=./data/real`.
- `.gitignore` inclui `data/real/`, `storage/`, `.env`.
- Scripts no `package.json`: `dev`, `worker:dev`, `build`, `lint`, `typecheck`, `test`, `test:ai`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `user:create`, `import`.
- Copiar este plano para `docs/plano-mvp.md` e o `CLAUDE.md` fornecido junto com ele para a raiz; criar `docs/decisoes.md` vazio.
- **Aceite:** `pnpm dev` abre uma página; `pnpm lint`, `pnpm typecheck`, `pnpm test` (um teste trivial) passam; `docker compose up -d` sobe os dois bancos.

### T02. Design system
- Extrair `data/real/branding.zip` para uma pasta temporária e aplicar a seção 10.
- Página interna `/dev/ui` (só em desenvolvimento) mostrando todos os componentes com seus estados.
- **Aceite:** `/dev/ui` renderiza Button (5 variantes), Badge, Card, Input, SectionLabel, FichaTecnica, OrderRow, WhatsAppOffer, FollowUpAlert, Dialog, Select, Checkbox, Tabs, Toast com as cores e fontes do guia; nenhum valor de cor fixo fora de `src/styles/tokens/` (verificar com grep por `#[0-9a-fA-F]{6}` em `src/components` e `src/app`).

### T03. Banco, autenticação e layout
- Schema completo da seção 7 em Drizzle; extensões `pg_trgm` e `unaccent` na primeira migration; índice trigram em `products.search_text`.
- `seed.ts`: tenant "Carteira Ricardo", configurações padrão do motor.
- Autenticação por e-mail e senha (argon2), sessão em cookie httpOnly assinado, middleware protegendo `(app)`. `pnpm user:create --email --name --role`.
- Layout com barra lateral e as rotas vazias da seção 9.
- Camada `repos/` com `tenantId` obrigatório em toda função.
- **Aceite:** migrations rodam do zero; login funciona; rota protegida redireciona para `/login`; teste de integração cria usuário e autentica; teste que nenhum repo aceita chamada sem `tenantId` (verificação de tipo).

### T04. Normalizadores e segmentos
- Implementar `src/server/normalize/*` conforme a seção 6, com todos os casos de teste listados.
- Seed de `segments` e `segment_aliases` a partir de `data/real/segmentos_ramo.csv` (segmentos: `restaurante`, `refeicoes_coletivas`, `lanches`, `pizzaria`, `panificacao`, `bar_cafeteria`, `sorveteria` com `has_recipes = true`; `revenda`, `industria`, `outros`, `sem_ramo` com `false`). Se o CSV não estiver disponível, usar uma cópia sintética em `tests/fixtures/`.
- **Aceite:** testes unitários de todos os normalizadores passam; seed cria 11 segmentos e 51 aliases.

### T05. Upload de documentos e importação de clientes
- Serviço de upload: calcula SHA-256, grava em `STORAGE_DIR/{sha}`, cria `documents` (dedupe por sha), gera miniatura para imagens.
- Importador de planilha de clientes: lê XLSX/CSV, mapeia colunas pelo cabeçalho (mapeamento padrão para o layout da seção 3; tela permite remapear se o cabeçalho for diferente), normaliza, casa por `external_code` (atualiza se existe, cria se novo), traduz ramo para segmento (ramo desconhecido vira pendência na revisão).
- Fluxo: upload → `import_job` com `import_rows` → tela de revisão (seção 9, versão planilha) → confirmar grava em `customers`.
- **Aceite:** teste de integração com `data/real/clientes.xlsx` (pular com aviso se o arquivo não existir): 242 linhas de cliente, linha de rodapé ignorada, 36 bloqueados, todos os ramos mapeados, nenhum código duplicado; reimportar o mesmo arquivo não duplica clientes; importação de 242 linhas leva menos de 10 s.

### T06. Telas de clientes e produtos
- `/clientes`, `/clientes/[id]`, `/produtos` com edição.
- Importador de catálogo de produtos por planilha (colunas mínimas: código, descrição; opcionais: marca, embalagem, unidade, preço, categoria), com o mesmo fluxo de revisão.
- **Aceite:** editar telefone de um cliente renormaliza e atualiza `phone_kind`; filtros funcionam; importar um CSV sintético de 7.000 produtos leva menos de 60 s.

### T07. Receitas
- Importador do CSV normalizado (`receitas_normalizadas.csv`): agrupa por `receita`, cria ingredientes (normalizando o nome; corrigir "perú" para "peru" na normalização de texto), `recipe_items` com quantidade por porção e unidade (kg → g, l → ml; Nescafé com "ml" e 0,14: quando `qtd_por_porcao × 1000 == embalagem_g_ml`, tratar como 1 unidade e registrar aviso).
- Importador de ficha XLSX (uma receita por aba, colunas `QTD, UND, PRODUTO, PESO/LITROS, PRECO, CUSTO/KG, CUSTO`; ignorar linhas vazias de modelo) gerando as mesmas `import_rows`.
- Editor de receita (`/receitas/[id]`) com segmentos, âncora e essencial por ingrediente, e vínculo ingrediente → produto (busca trigram por descrição; aprovar/rejeitar).
- Sugestão de vínculo por IA (botão "sugerir produtos"): para cada ingrediente sem vínculo, buscar os 10 produtos mais parecidos por trigram e pedir à IA para ranquear os 3 melhores com justificativa (schema zod `{ ingredientId, candidates: [{ productId, score, reason }] }`). Resultado entra como `suggested`; só `approved` vale para o motor.
- Associação cliente ↔ receita em `/clientes/[id]`, com sugestão por segmento (receitas cujo `recipe_segments` inclui o segmento do cliente).
- Ao importar as 9 receitas da cafeteria, atribuir os segmentos `bar_cafeteria` e `panificacao`.
- **Aceite:** importar o CSV cria 9 receitas, 22 ingredientes e 45 itens; importar `fichas-cafeteria.xlsx` gera as mesmas 9 receitas na revisão (teste compara contagens e nomes); vincular um ingrediente a um produto e marcá-lo como âncora persiste.

### T08. Fila de jobs e cliente de IA
- `worker/index.ts` com pg-boss: filas `import.extract` e `suggestion.run`; retry 2 vezes com backoff; status do job refletido em `import_jobs`.
- `src/server/importers/ai/client.ts`: wrapper do SDK oficial com `client.messages.parse` + `zodOutputFormat(schema)`, `model = process.env.IMPORTER_MODEL`, `output_config: { effort: "medium", format: ... }`, `max_tokens: 16000`. Envio de imagem como bloco `image` base64 (após `sharp` reduzir para no máximo 2000 px no lado maior, JPEG qualidade 90) e de PDF como bloco `document` base64 (`media_type: "application/pdf"`), sempre antes do bloco de texto.
- Tratar: `parsed_output` nulo (job `failed` com o texto bruto salvo em `raw_output`); `stop_reason === "refusal"` (job `failed`, motivo "a IA recusou; cadastrar manualmente"); erros da API pela hierarquia de exceções do SDK (429 e 5xx: deixar o pg-boss tentar de novo; 400: falha definitiva).
- Registrar `input_tokens`, `output_tokens` e custo estimado (tabela de preços em constante: Opus 5.5 US$ 4 / US$ 20 por milhão de tokens de entrada/saída; Sonnet 5.5 US$ 2 / US$ 10).
- **Aceite:** teste unitário do wrapper com o SDK mockado cobrindo sucesso, `parsed_output` nulo, recusa e 429; o worker processa um job fictício e atualiza o status.

### T09. Agente importador: pedido
- Schema zod `OrderExtraction`:
  ```ts
  { orderNumber: string; issuedAt: string /* dd/mm/aaaa */; customer: { code: string|null; document: string|null; name: string|null };
    repCode: string|null; paymentTerms: string|null; total: number|null;
    lines: { code: string; description: string; unit: string|null; qty: number; unitPrice: number; lineTotal: number|null; confidence: number }[] }
  ```
- Prompt (em `prompts/order.md`): extrair apenas o que está impresso; números no formato brasileiro convertidos para decimal; não inventar linhas; `confidence` de 0 a 1 por linha.
- Pós-processamento determinístico: normalizar código (6.5), valores (6.3); validar `Σ lineTotal == total` (tolerância R$ 0,05) e `qty × unitPrice == lineTotal` (tolerância R$ 0,02); divergência vira aviso na linha.
- Casamento: cliente por documento, depois por código, depois por nome (trigram, só sugere); produto por código exato; código inexistente vira produto novo (`source = 'order'`) com descrição e embalagem do pedido.
- Revisão e confirmação criam `orders` (status `confirmed`) e `order_lines`, e enfileiram `suggestion.run`.
- Também implementar **"Digitar pedido"** (formulário) que gera o mesmo resultado sem IA.
- **Aceite (`pnpm test:ai`, usa API real e `data/real/pedido-2707401471.pdf`):** número 2707401471, 3 linhas com códigos 166225, 108576 e 110647, quantidades 2, 2 e 1, preços 16,64, 27,94 e 45,54, total 134,70, nenhum aviso de soma. Teste normal (sem IA) cobre o pós-processamento com uma extração mockada.

### T10. Agente importador: encartes de oferta
- Schema zod `PromotionExtraction`:
  ```ts
  { title: string|null; supplierBrand: string|null;
    offerValidity: { startsOn: string|null; endsOn: string|null; evidence: string|null };   // só se o encarte disser explicitamente que a OFERTA vale até X
    targetSegmentsHint: string[];                                                            // ex.: "ideal para restaurantes, lanchonetes"
    items: { codeRaw: string|null; description: string; packText: string|null; price: number;
             priceUnit: 'un'|'pct'|'kg'|'cx'|'outro'; boxPrice: number|null; regularPrice: number|null;
             priceType: 'unit_price'|'min_qty'|'bundle'|'other'; minQty: number|null; conditionText: string|null;
             productExpiryDate: string|null; confidence: number }[] }
  ```
- Prompt (em `prompts/promotion.md`), regras explícitas:
  1. Leia apenas texto impresso. Se a foto da embalagem contradiz o texto (ex.: foto de 1 kg num item de 5 kg), vale o texto.
  2. Copie o código exatamente como impresso em `codeRaw` (com pontos), sem corrigir.
  3. "Validade do produto" é validade do produto (`productExpiryDate`), **nunca** vigência da oferta. Só preencha `offerValidity` se o encarte disser que a oferta/promoção vale até uma data, e cite o trecho em `evidence`.
  4. Unidade do preço: "/pacote" → `pct`; "/un.", "cada", "cada unidade", "un" → `un`; "/kg" → `kg`; "preço por caixa" → `boxPrice` e `priceUnit` do preço principal.
  5. Combos como "compre 2 caixas e ganhe 1" → `priceType = 'bundle'` com `conditionText`.
  6. Um encarte pode ter de 1 a 30 itens; extraia todos.
- Pós-processamento: normalizar código (6.5; ambíguo vira aviso e não casa sozinho), preço em centavos, embalagem (6.4).
- Casamento por código exato; código inexistente vira produto novo (`source = 'promotion'`) com descrição, marca e embalagem; código ambíguo ou ausente fica "sem vínculo" até o Ricardo vincular ou criar.
- Revisão: cabeçalho exige `starts_on` e `ends_on` (padrão hoje e hoje + `promotionDefaultDays`); itens sem vínculo bloqueiam a confirmação até serem vinculados, criados ou descartados.
- Importação em lote: vários arquivos geram um `import_job` cada; a tela `/importacoes` mostra o progresso.
- Atualizar `products.list_price_cents`? **Não.** Preço de oferta fica só em `promotion_items`.
- **Aceite (`pnpm test:ai`, imagens reais em `data/real/encartes/`; critério: ≥ 95% dos campos `codeRaw`, `price` e `priceUnit` corretos por encarte):**
  - Fritz & Frida arroz e feijão (12 itens): contém `134911` "ARROZ BRANCO PREMIUM 1 kg" R$ 4,95 `pct`; `134913` 5 kg R$ 21,99 `pct`; `163180` "FEIJÃO FRADINHO 500 g" R$ 3,49.
  - Fritz & Frida pudins e gelatinas (14 itens): `165059` gelatina cereja R$ 0,95 `un`; `165060` gelatina sem sabor R$ 1,95.
  - Ceratti (10 itens): `134.352` → `134352` salame italiano fatiado 100 g R$ 15,99 `un`; `137.396` → `137396` R$ 89,99.
  - BR Spices (7 itens): `159.756` → `159756` R$ 6,49 `un`, `packText` "CX C/12 UN".
  - Lamb Weston (1 item): `108624`, R$ 19,39 `kg`, `boxPrice` 193,90, `priceType` `bundle` com condição de 2 caixas + 1; `productExpiryDate` 14/12/2026 e `offerValidity.endsOn` **nulo**.
  - Rocha (20 itens): `168.90` e `94.2` marcados como ambíguos; `169.115` → `169115` R$ 2,99.
  - O nome de cada arquivo de teste fica em `tests/ai/encartes.manifest.json` (mapear a partir das imagens copiadas; deduplicadas por SHA-256).

### T11. Motor de sugestões
- Implementar a seção 8 em `src/server/engine/` como funções puras.
- `services/suggestions.ts`: monta `EngineInput` a partir do banco (pedidos confirmados anteriores ao pedido atual, promoções com `starts_on <= data do pedido <= ends_on`), roda o motor, grava `suggestion_runs`, `suggestion_items`, `suggestion_messages`.
- Handler `suggestion.run` no worker; também executável de forma síncrona pela tela ("Recalcular").
- **Aceite:** os 10 testes da seção 8.9 passam; teste de integração: pedido confirmado gera uma `suggestion_run` com itens e mensagem.

### T12. Tela do pedido e resultado
- `/pedidos` e `/pedidos/[id]` conforme a seção 9, usando `FichaTecnica` e `WhatsAppOffer`.
- Copiar para a área de transferência; "Abrir no WhatsApp" abre o link `wa.me` em nova aba; desabilitado com explicação quando `no_whatsapp`.
- Registro de resultado grava `suggestion_outcomes`; recusa alimenta o filtro `declineCooldownDays`.
- **Aceite:** teste Playwright: login → pedido de fixture → ver 2 sugestões → editar mensagem → copiar → registrar "aceitou" → painel mostra 1 aceite.

### T13. Painel
- Métricas da seção 9 por período, a partir de `suggestion_runs` e `suggestion_outcomes`; exportação CSV.
- **Aceite:** com uma base de fixture montada à mão (10 pedidos, 6 com sugestão, 4 enviados, 2 aceitos), os números batem.

### T14. Ofertas: ciclo de vida
- `/ofertas` com vigência editável; job diário (pg-boss schedule às 03:00, fuso America/Sao_Paulo) marca promoções vencidas como `expired`.
- **Aceite:** promoção com `ends_on` ontem não entra no motor; teste do job.

### T15. Carga inicial e demo
- `scripts/import-cli.ts`: `pnpm import --kind customers --file data/real/clientes.xlsx --auto-confirm` (auto-confirm só aceita linhas sem pendência; o restante fica em revisão). Mesmo para `recipes` e `promotion`.
- Script `pnpm demo:reset` que limpa o banco local, roda seed, importa clientes, receitas e encartes reais e cria um cliente de cafeteria com as 9 receitas e histórico sintético, para demonstração.
- `README.md` com o passo a passo da demo da seção 1.
- **Aceite:** a demo da seção 1 roda do zero seguindo o README.

### T16. Deploy
- `Dockerfile` multi-stage (app e worker na mesma imagem, comandos diferentes), `docker-compose.prod.yml` com `app`, `worker`, `db` (volume persistente), `caddy` (HTTPS automático para o domínio em `DOMAIN`).
- Backup diário: `pg_dump` + `tar` de `storage/` enviados para um bucket S3 (`BACKUP_BUCKET`), retenção de 14 dias.
- Documento `docs/deploy.md` com criação da VM (EC2 t4g.small, Ubuntu LTS, sa-east-1), DNS, variáveis e restauração do backup.
- **Aceite:** `docker compose -f docker-compose.prod.yml up` funciona localmente com um domínio de teste ou `localhost`; restauração do backup testada uma vez em ambiente local.

---

## 12. Testes: resumo

| Comando | O que roda | Custo |
|---|---|---|
| `pnpm test` | Unidade + integração (Postgres de teste), sem chamar a IA; testes com dados reais pulam se `data/real/` não existir | Grátis |
| `pnpm test:ai` | Extração real de pedido e encartes (T09, T10) | Paga a API; estimativa abaixo de US$ 2 por rodada completa com Opus 5.5 (não medido; registrar o custo real na primeira execução) |
| `pnpm test:e2e` | Playwright (T12) | Grátis |

CI (GitHub Actions): `lint`, `typecheck`, `test`. `test:ai` só manual.

---

## 13. Segurança e LGPD no MVP

- Dados de clientes da Dellys só entram no sistema depois de o Ricardo ter o aval da Dellys (decisão já registrada). Até lá, usar dados sintéticos e os arquivos reais apenas localmente.
- HTTPS obrigatório; cookies `httpOnly`, `secure`, `sameSite=lax`; senhas com argon2; rate limit simples no login (5 tentativas por minuto por IP).
- `ANTHROPIC_API_KEY` só no servidor e no worker.
- Arquivos em `storage/` servidos só por rota autenticada; nunca públicos.
- Logs sem telefone e documento completos (mascarar: `+55549****1234`).
- Documentos e imagens enviados à Claude API saem do Brasil; registrar isso no aviso de privacidade antes de usar com dados reais.

---

## 14. Pendências que não bloqueiam o desenvolvimento

1. Exportação do catálogo de produtos da Dellys (melhora descrições, embalagens e preços de lista).
2. Mais pedidos antigos dos mesmos clientes (o histórico começa vazio sem eles).
3. Receitas dos chefs para restaurante, lanches, pizzaria e panificação (hoje só existem as 9 da cafeteria).
4. Confirmação de como a Dellys comunica a vigência das ofertas.
5. Relação OESA × Dellys (o pedido sai em nome da OESA).
