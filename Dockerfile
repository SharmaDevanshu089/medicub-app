# Multi-stage production Dockerfile strictly for Medicub v2 (Frontend + Backend API)
# Stage 1: Install v2 dependencies & build v2 web frontend
FROM node:24-alpine AS builder
WORKDIR /app/v2

COPY v2/package.json v2/package-lock.json ./
RUN npm ci

COPY v2/ ./
RUN npm run build

# Stage 2: Production v2 server runner (serves built UI + /api on port 3000)
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
