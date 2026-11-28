# Multi-stage production Dockerfile for Medicub v2 (Frontend + Backend API)
# Stage 1: Build web static assets
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY v2/package.json v2/package-lock.json ./v2/

RUN npm ci && cd v2 && npm ci

COPY . .

RUN npm run v2:build

# Stage 2: Production full-stack runner (serves built frontend + /api on port 3000)
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV MEDICUB_STATIC_DIR=/app/v2/dist

RUN npm install -g tsx

COPY v2/server/ ./v2/server/
COPY v2/src/ ./v2/src/
COPY v2/package.json ./v2/package.json
COPY --from=builder /app/v2/dist ./v2/dist

RUN mkdir -p /app/v2/server/data

EXPOSE 3000

VOLUME ["/app/v2/server/data"]

CMD ["tsx", "v2/server/index.ts"]
