# Deploy em VM própria

Produção do MVP em uma VM única com Docker Compose: `app` (Next.js), `worker` (pg-boss), `db` (Postgres 16 com volume), `caddy` (HTTPS automático) e `backup` (diário para S3). A homologação do Marcelo roda na Vercel com Supabase e não segue este documento.

## 1. Criar a VM

- EC2 `t4g.small` (ARM, 2 GB), Ubuntu LTS, região `sa-east-1` (São Paulo), disco de 30 GB gp3.
- Security group: entrada 22 (só seu IP), 80 e 443 (qualquer origem). A porta 5432 não é exposta.
- IP elástico associado à instância.
- Instale Docker e o plugin compose: `curl -fsSL https://get.docker.com | sh` e `sudo usermod -aG docker $USER`.

## 2. DNS

Crie um registro `A` do domínio escolhido (ex.: `compramais.seudominio.com.br`) apontando para o IP elástico. O Caddy emite o certificado sozinho quando o DNS já resolve e as portas 80 e 443 estão abertas.

## 3. Variáveis

```bash
git clone https://github.com/mlcaraldi/compraumais.git && cd compraumais
cp .env.prod.example .env.prod
```

| Variável | Para quê |
|---|---|
| `DOMAIN` | Domínio do HTTPS; `localhost` para testar na própria máquina |
| `POSTGRES_PASSWORD` | Senha do banco (gere com `openssl rand -base64 24`) |
| `SESSION_SECRET` | 32+ caracteres (`openssl rand -hex 32`) |
| `ANTHROPIC_API_KEY`, `IMPORTER_MODEL` | Leitura de pedidos e encartes pela IA (`claude-opus-5-5` ou `claude-sonnet-5-5`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Primeiro administrador, criado só se o banco não tiver usuários |
| `BACKUP_BUCKET`, `AWS_*` | Destino do backup; vazio guarda só no volume local `backups` |

`.env.prod` não vai para o git. Os dados reais da Dellys só entram depois do aval dela (decisão registrada).

## 4. Subir

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f app
```

O `app` roda `pnpm predeploy` (migrations, seed do tenant e primeiro admin) antes de iniciar; o `worker` espera o `app` ficar saudável. Abra `https://<DOMAIN>/login`. Para criar outro usuário:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec app \
  pnpm user:create --email x@exemplo.com --name "Nome" --role operator
```

Para testar localmente sem domínio, use `DOMAIN=localhost`: o Caddy usa um certificado local (o navegador pede para confiar).

## 5. Atualizar

```bash
git pull && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

As migrations rodam no início do `app`. Faça um backup manual antes de atualizações grandes (seção 6).

## 6. Backup

O serviço `backup` roda `deploy/backup.sh` todo dia às 02:00 (Brasília): `pg_dump` em formato custom e `tar.gz` do volume de arquivos, enviados para `s3://$BACKUP_BUCKET` como `db-AAAAMMDDTHHMMSSZ.dump` e `storage-AAAAMMDDTHHMMSSZ.tar.gz`. Backups com mais de 14 dias (`BACKUP_RETENTION_DAYS`) são apagados pelo próprio script; configure também uma regra de ciclo de vida de 30 dias no bucket como rede de segurança. Crie um usuário IAM só com `s3:PutObject`, `s3:ListBucket` e `s3:DeleteObject` nesse bucket.

Backup manual:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec backup bash /deploy/backup.sh
```

## 7. Restaurar

```bash
# 1. baixe os dois arquivos do bucket
aws s3 cp s3://$BACKUP_BUCKET/db-20261013T050000Z.dump .
aws s3 cp s3://$BACKUP_BUCKET/storage-20261013T050000Z.tar.gz .
# 2. pare quem escreve
docker compose --env-file .env.prod -f docker-compose.prod.yml stop app worker backup
# 3. restaure o banco (apaga public, drizzle e pgboss do destino) e os arquivos
export DATABASE_URL=postgres://compramais:$POSTGRES_PASSWORD@localhost:5432/compramais   # publique a 5432 só durante a restauração, ou rode dentro do container db
bash deploy/restore.sh db-20261013T050000Z.dump storage-20261013T050000Z.tar.gz
# 4. suba de novo
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Os arquivos do `storage` voltam para o volume `storage` (por exemplo, extraia o tar em um container que monte esse volume). Teste a restauração em uma máquina de teste pelo menos uma vez antes de confiar no backup.

## 8. Verificado até aqui

`docker compose config` valida o arquivo; `deploy/backup.sh` e `deploy/restore.sh` foram testados contra um Postgres 16 local (banco e arquivos voltaram idênticos). A construção da imagem e o `docker compose up` completo não puderam ser executados no ambiente em que o código foi escrito (não há daemon Docker lá); faça essa primeira subida em `DOMAIN=localhost` antes de apontar o DNS.
