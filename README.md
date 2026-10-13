# CompraMais

Cruza o pedido de um cliente de food service com as receitas e o histórico de compras dele e sugere itens adicionais, usando as ofertas vigentes da distribuidora. O resultado é uma mensagem pronta que o representante envia pelo próprio WhatsApp. Especificação completa em [`docs/plano-mvp.md`](docs/plano-mvp.md); decisões de implementação em [`docs/decisoes.md`](docs/decisoes.md).

## Requisitos

Node 22+, pnpm, Docker (bancos de desenvolvimento e teste). Para ler pedido e encarte com IA: `ANTHROPIC_API_KEY`.

## Primeira execução

```bash
cp .env.example .env            # ajuste SESSION_SECRET e, se for usar IA, ANTHROPIC_API_KEY
docker compose up -d            # Postgres de dev (5432) e de teste (5433)
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm user:create --email voce@exemplo.com --name "Seu nome" --role admin
pnpm dev                        # http://localhost:3000
pnpm worker:dev                 # em outro terminal: executa leitura por IA e vencimento de ofertas
```

Os dados reais ficam em `data/real/` (fora do git): `clientes.xlsx`, `receitas_normalizadas.csv`, `fichas-cafeteria.xlsx`, `pedido-2707401471.pdf` e `encartes/`.

## Demo rápida (sem IA)

```bash
pnpm demo:reset
```

Apaga o banco local, roda as migrations e o seed, importa os clientes e as 9 receitas reais, e monta um cliente fictício de cafeteria ("Café Cultura Demo") com as receitas associadas, produtos sintéticos vinculados aos ingredientes, 8 semanas de histórico, duas ofertas vigentes e um pedido de hoje. Entre com `demo@compramais.local` / `demo-compramais` e abra o pedido `DEMO-0001`: a ficha mostra o molho grill e o chantilly em oferta e o presunto sugerido, a seção "Lembrar o cliente" traz o queijo e outros itens do hábito, e a mensagem sai pronta para copiar ou abrir no WhatsApp. Registre o resultado e confira o painel.

O comando recusa bancos remotos sem `--force`. Preços e produtos da demo são sintéticos (identificados como `DEMO-nnn`); `--with-ai` também lê os 6 encartes reais pela API paga.

## Demo completa (a da seção 1 do plano)

Com o banco vazio (`pnpm db:migrate && pnpm db:seed`, usuário criado e `pnpm dev` rodando):

1. **Clientes**: Importações, "Clientes", `data/real/clientes.xlsx`, revisar, confirmar (242 clientes). Pela linha de comando: `pnpm import --kind customers --file data/real/clientes.xlsx --auto-confirm`.
2. **Receitas**: Receitas, "Importar", `data/real/receitas_normalizadas.csv` (ou `fichas-cafeteria.xlsx`), confirmar. No editor de cada receita, vincule os ingredientes aos produtos e marque a âncora.
3. **Encartes**: Ofertas, "Importar encartes", selecione as imagens de `data/real/encartes/`, revise a vigência e os itens de cada um e confirme. Requer worker e `ANTHROPIC_API_KEY`.
4. **Cliente**: em Clientes, abra um cliente de cafeteria, confirme as receitas sugeridas pelo segmento.
5. **Pedido**: Pedidos, "Subir pedido", `data/real/pedido-2707401471.pdf`, confirme o cliente e as linhas.
6. **Resultado**: a tela do pedido mostra até 3 sugestões com justificativa e preço, mais a mensagem editável; "Abrir no WhatsApp" já leva o texto.

`pnpm import` aceita `--kind customers|products|recipes|order|promotion`. Com `--auto-confirm`, só confirma quando não sobra pendência; senão a importação fica em revisão na tela.

## Comandos

| Comando                                              | O que faz                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev` / `pnpm worker:dev`                       | App e worker (pg-boss)                                                               |
| `pnpm db:generate` / `db:migrate` / `db:seed`        | Migrations Drizzle e seed                                                            |
| `pnpm user:create --email x --name y --role admin`   | Cria usuário                                                                         |
| `pnpm import --kind ... --file ... [--auto-confirm]` | Importa arquivo pelo mesmo caminho da tela                                           |
| `pnpm demo:reset`                                    | Recria o banco local com a demo                                                      |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`         | Verificações (sem chamar a IA)                                                       |
| `pnpm test:ai`                                       | Testes com a API da Claude (pago; rode só de propósito)                              |
| `pnpm test:e2e`                                      | Playwright contra o banco de teste (`PW_CHROMIUM_PATH` usa um Chromium já instalado) |

## Regras que o código garante

O motor de sugestões (`src/server/engine/`) é feito de funções puras. O sistema nunca inventa desconto: o preço vem da oferta cadastrada, do preço de lista, ou vira "posso te passar o preço". Nada importado pela IA entra nas tabelas finais sem revisão e confirmação humana. Dinheiro é sempre inteiro em centavos e toda consulta filtra por `tenant_id` pela camada `src/server/repos/`.
