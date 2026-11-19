# One image for everything: the API, the built web app and the reminder worker, in one container.
# - docker-compose.yml runs it next to its own Postgres (passes DATABASE_URL).
# - render.yaml runs it alone: with no DATABASE_URL, start.sh starts a Postgres inside the container.

# 1. Build the web app (React).
FROM node:22-alpine3.21 AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. The backend with all its dependencies. `docker compose run --rm test` stops here and runs the tests.
FROM node:22-alpine3.21 AS test
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
CMD ["npm", "test"]

# 3. Compile the backend and keep only what production needs.
FROM test AS api
RUN npm run build && npm prune --omit=dev

# 4. The final image.
FROM node:22-alpine3.21
# Postgres 17 (+ "contrib" for btree_gist), only used when no DATABASE_URL is given (Render demo).
RUN apk add --no-cache postgresql17 postgresql17-contrib
ENV PATH="/usr/libexec/postgresql17:$PATH"

WORKDIR /app
COPY --from=api /app/package.json ./
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY --from=api /app/openapi.yaml ./openapi.yaml
COPY --from=web /web/dist ./public
COPY start.sh ./start.sh

ENV NODE_ENV=production \
    STATIC_DIR=/app/public \
    RUN_REMINDER_WORKER=true \
    SEED_DEMO_DATA=true \
    PGDATA=/data/pgdata

# Postgres refuses to run as root, so everything runs as the image's "node" user.
RUN mkdir -p /data && chown -R node:node /data && chmod +x ./start.sh
USER node
EXPOSE 4000
CMD ["./start.sh"]
