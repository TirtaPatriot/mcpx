FROM oven/bun:alpine AS web
WORKDIR /build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY web ./web
RUN bun --smol run build

# ── Stage 2: the gateway ──
FROM oven/bun:alpine

WORKDIR /app

# Copy the official uv & uvx tools from Astral (statically linked musl binaries)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
# Copy toolchain Go resmi versi spesifik / latest
COPY --from=golang:1.24-alpine /usr/local/go /usr/local/go

# Tambahkan /usr/local/go/bin ke PATH
ENV PATH="/usr/local/go/bin:${PATH}"

# Update metadata dulu
RUN apk update

# Install git terpisah
RUN apk add --no-cache git ca-certificates

# Install python runtime saja (tanpa pip dulu)
RUN apk add --no-cache python3

# Install pip jika memang dibutuhkan secara native
RUN apk add --no-cache py3-pip

# Symlink npx & node to the bundled bunx/bun, and python to python3
RUN ln -sf /usr/local/bin/bunx /usr/local/bin/npx && \
    ln -sf /usr/local/bin/bun /usr/local/bin/node && \
    ln -sf /usr/bin/python3 /usr/local/bin/python

# Create the data directory for SQLite and the build caches for the bun user (Go, UV, Bun, NPM)
RUN mkdir -p /app/data/cache /home/bun/.cache /home/bun/go && \
    chown -R bun:bun /app/data /home/bun

# Dependencies get their own layer so the cache survives when only src changes
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY public ./public
COPY --from=web /build/web/dist ./web/dist

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/tokens.db \
    HOME=/home/bun \
    GOCACHE=/app/data/cache/go-build \
    GOPATH=/app/data/cache/go \
    UV_CACHE_DIR=/app/data/cache/uv \
    BUN_INSTALL_CACHE_DIR=/app/data/cache/bun \
    npm_config_cache=/app/data/cache/npm \
    PYTHONUNBUFFERED=1

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["bun", "run", "src/index.ts"]
