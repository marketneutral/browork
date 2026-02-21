# Browork — production multi-stage build
#
# Stage 1: Build server + web
# Stage 2: Production runtime (Node.js only)
#
# docker build -t browork .

# ── Build stage ──
FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/skills/package.json packages/skills/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/server packages/server
COPY packages/web packages/web
COPY packages/skills packages/skills

RUN npm run build --workspace=packages/server \
 && npm run build --workspace=packages/web

# ── Production stage ──
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy production dependencies
COPY package.json package-lock.json* ./
COPY packages/server/package.json packages/server/
COPY packages/skills/package.json packages/skills/
RUN npm ci --omit=dev --workspace=packages/server

# Copy built artifacts
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist packages/web/dist
COPY packages/skills packages/skills

# Data volume
RUN mkdir -p /data
VOLUME /data

ENV NODE_ENV=production
ENV DATA_ROOT=/data
ENV PORT=3001

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
