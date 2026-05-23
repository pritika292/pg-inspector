# syntax=docker/dockerfile:1.7

# ─── Build stage ────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps using the lockfile only — no source yet so this layer is reused
# across code-only changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY build ./build
COPY src ./src
RUN npm run build

# Drop dev deps from the install we just did. Smaller node_modules to copy.
RUN npm prune --omit=dev

# ─── Runtime stage ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# wget is in the busybox shipped with alpine — used by the healthcheck.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

USER node
EXPOSE 3014

# Migrations + seed runner get wired into boot in Epic 2/3. For now, just
# start the server.
CMD ["node", "--enable-source-maps", "dist/server/index.js"]
