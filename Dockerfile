FROM oven/bun:alpine

WORKDIR /app

# Layer dependensi dipisah agar cache tetap terpakai saat hanya src yang berubah
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

ENV NODE_ENV=production \
    PORT=3000

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["bun", "run", "src/index.ts"]
