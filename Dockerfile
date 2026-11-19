# One image with everything, for single-service hosting such as Render (see render.yaml):
# the API, the built web app (served by the API), and the reminder worker (inside the API).
# For local use, docker-compose.yml runs these as separate services instead.

FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    STATIC_DIR=/app/public \
    RUN_REMINDER_WORKER=true
COPY --from=api /app/package.json ./
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY --from=api /app/openapi.yaml ./openapi.yaml
COPY --from=web /web/dist ./public
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
