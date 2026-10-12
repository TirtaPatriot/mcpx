FROM oven/bun:alpine

WORKDIR /app

# Copy tool uv & uvx resmi dari Astral (binary statically linked musl)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Install python3, pip, go, git untuk mengeksekusi server MCP berbasis Python & Go
RUN apk add --no-cache python3 py3-pip go git

# Buat symlink agar npx & node diarahkan ke bunx/bun bawaan, dan python diarahkan ke python3
RUN ln -sf /usr/local/bin/bunx /usr/local/bin/npx && \
    ln -sf /usr/local/bin/bun /usr/local/bin/node && \
    ln -sf /usr/bin/python3 /usr/local/bin/python

# Buat direktori data untuk SQLite dan cache build untuk user bun (Go & UV)
RUN mkdir -p /app/data /home/bun/.cache /home/bun/go && \
    chown -R bun:bun /app/data /home/bun

# Layer dependensi dipisah agar cache tetap terpakai saat hanya src yang berubah
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/tokens.db \
    HOME=/home/bun \
    GOCACHE=/home/bun/.cache/go-build \
    GOPATH=/home/bun/go \
    UV_CACHE_DIR=/home/bun/.cache/uv \
    PYTHONUNBUFFERED=1

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["bun", "run", "src/index.ts"]
