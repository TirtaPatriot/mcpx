# ── Stage 1: Build the dashboard (Vite + Preact) ──
FROM oven/bun:alpine AS web
WORKDIR /build

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY web ./web

# Gunakan --smol untuk menekan memory footprint saat Vite build
RUN bun --smol run build

# ── Stage 2: The Gateway ──
FROM oven/bun:alpine

WORKDIR /app

# 1. Kunci sequence: Ambil hasil build web lebih dulu agar BuildKit tidak memparalelkan build
COPY --from=web /build/web/dist ./web/dist

# 2. Multi-stage tooling: Astral uv, Go toolchain resmi, dan bundle CA certs (bypass ca-certificates.trigger)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
COPY --from=golang:alpine /usr/local/go /usr/local/go
COPY --from=alpine:latest /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# 3. APK hanya untuk git (tanpa ca-certificates trigger agar terhindar dari signal 9)
RUN apk add --no-cache git

# 4. Direktori global untuk Python runtime & cache (chown ke user bun)
RUN mkdir -p /opt/uv/python \
             /app/data/cache/go \
             /app/data/cache/go-build \
             /app/data/cache/uv \
             /app/data/cache/bun \
             /home/bun/.cache && \
    chown -R bun:bun /opt/uv /app/data /home/bun

# 5. Pasang Python default via uv ke direktori global /opt/uv/python
RUN --mount=type=cache,target=/root/.cache/uv \
    UV_PYTHON_INSTALL_DIR=/opt/uv/python uv python install 3.12 --default && \
    ln -sf $(UV_PYTHON_INSTALL_DIR=/opt/uv/python uv python find 3.12) /usr/local/bin/python3 && \
    ln -sf /usr/local/bin/python3 /usr/local/bin/python && \
    ln -sf /usr/local/bin/bunx /usr/local/bin/npx && \
    ln -sf /usr/local/bin/bun /usr/local/bin/node

# 6. Gateway backend dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# 7. Application source
COPY src ./src
COPY public ./public

# 8. Environment & Multi-runtime configurations
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/tokens.db \
    HOME=/home/bun \
    GOCACHE=/app/data/cache/go-build \
    GOPATH=/app/data/cache/go \
    GOTOOLCHAIN=auto \
    UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    UV_CACHE_DIR=/app/data/cache/uv \
    BUN_INSTALL_CACHE_DIR=/app/data/cache/bun \
    npm_config_cache=/app/data/cache/npm \
    PATH="/app/data/cache/go/bin:/usr/local/go/bin:/opt/uv/python/current/bin:${PATH}" \
    PYTHONUNBUFFERED=1

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["bun", "--smol", "run", "src/index.ts"]
