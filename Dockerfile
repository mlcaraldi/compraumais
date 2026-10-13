# App e worker usam a mesma imagem; o comando muda (ver docker-compose.prod.yml).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
# argon2 e sharp trazem binários prontos; o toolchain cobre o caso de precisarem compilar
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production STORAGE_DIR=/app/storage
# tsx (worker e scripts) vem das devDependencies, por isso a imagem leva o node_modules completo
COPY --from=build /app /app
RUN mkdir -p /app/storage && chown -R node:node /app/storage /app/.next
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
