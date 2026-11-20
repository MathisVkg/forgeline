# syntax=docker/dockerfile:1

# 1. deps: install all workspace dependencies from the lockfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci

# 2. build: compile the Svelte SPA to web/dist
FROM deps AS build
COPY shared/ shared/
COPY web/ web/
RUN npm run build

# 3. runtime: production dependencies of server + shared only
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci --omit=dev --workspace server --workspace shared && npm cache clean --force
COPY shared/ shared/
COPY server/ server/
COPY --from=build /app/web/dist web/dist/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server/app.js"]
