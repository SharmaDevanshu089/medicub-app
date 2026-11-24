# Multi-stage production Dockerfile for Medicub Server
# Stage 1: Build web static assets
FROM node:24-alpine AS builder
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY v2/package.json v2/package-lock.json ./v2/

# Install build dependencies
RUN npm ci && cd v2 && npm ci

# Copy full source
COPY . .

# Build web distributions
RUN npm run build && npm run v2:build

# Stage 2: Production server runner
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8788
ENV HOST=0.0.0.0

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Copy server code and built assets from builder
COPY server/ ./server/
COPY v2/ ./v2/
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/v2/dist ./v2/dist

# Create SQLite data persistence directory
RUN mkdir -p /app/server/data /app/v2/server/data

# Expose ports (8788 for v2 API/WebSocket, 8787 for v1)
EXPOSE 8788 8787

# Volume for SQLite database persistence
VOLUME ["/app/server/data", "/app/v2/server/data"]

# Start Medicub v2 server
CMD ["tsx", "v2/server/index.ts"]
