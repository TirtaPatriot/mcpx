FROM oven/bun:alpine

WORKDIR /app

# Buat symlink agar npx & node diarahkan langsung ke runtime bunx & bun bawaan tanpa perlu apk add
RUN ln -sf /usr/local/bin/bunx /usr/local/bin/npx && \
    ln -sf /usr/local/bin/bun /usr/local/bin/node

# Buat direktori data untuk persistensi SQLite dan beri izin ke user bun
RUN mkdir -p /app/data && chown -R bun:bun /app/data

# Layer dependensi dipisah agar cache tetap terpakai saat hanya src yang berubah
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/tokens.db

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["bun", "run", "src/index.ts"]
