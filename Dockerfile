# ViteHub Finance on any Node host: SQLite and KV in /app/.data (mount a volume there), the daily sync in-process.
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm run postinstall && FINANCE_HOST=node pnpm build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
# The server bundles its migrations and applies them on start.
COPY --from=build /app/.output ./.output
VOLUME /app/.data
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
