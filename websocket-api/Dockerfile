# Builds the whole realtime-chat app (api + web) into a single image: the
# API serves both the WebSocket/health endpoints and the built frontend, so
# the deployed app is reachable from one origin, on one port. Build context
# is this directory (workshops/04-streaming-websockets/), not api/ or web/.

# ---- build the frontend ----
FROM node:20-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- build the api ----
FROM node:20-alpine AS api-build
WORKDIR /api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/ ./
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=api-build /api/dist ./dist
COPY --from=web-build /web/dist ./public

EXPOSE 3000
CMD ["node", "dist/server.js"]
