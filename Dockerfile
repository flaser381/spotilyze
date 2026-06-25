# syntax=docker/dockerfile:1

# ── build stage: install all workspace deps and build the web bundle ──────────
FROM oven/bun:1 AS build
WORKDIR /app

# copy manifests first so `bun install` is cached unless deps change
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile

# copy the rest of the source and build the Vue dashboard (apps/web/dist)
COPY . .
RUN bun run build:web

# ── runtime stage: slim image that serves the API + built dashboard ───────────
FROM oven/bun:1-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    IN_DOCKER=1
WORKDIR /app

# only what the server needs at runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/data ./data

# runtime-writable dirs: resolved artist→genre cache + UI-managed config/secrets.
# declared as volumes so they survive container re-creation.
RUN mkdir -p cache config
VOLUME ["/app/cache", "/app/config"]

EXPOSE 3001
# serve.ts runs from the repo root (process.cwd() === /app)
CMD ["bun", "run", "apps/server/src/serve.ts"]
