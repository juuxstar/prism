# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /app

RUN apk add --no-cache git

COPY package*.json ./
COPY scripts/prepare-http-decorators.mjs ./scripts/prepare-http-decorators.mjs
RUN npm ci

COPY . .
RUN npx vite build && npx tsc -p src/server/tsconfig.json

FROM node:24-alpine AS production

ENV NODE_ENV=production
ENV PORT=3002

WORKDIR /app

RUN apk add --no-cache git
RUN addgroup -S app && adduser -S app -G app

COPY package*.json ./
COPY scripts/prepare-http-decorators.mjs ./scripts/prepare-http-decorators.mjs
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist

USER app

EXPOSE 3002

CMD ["node", "build/server/index.js"]
