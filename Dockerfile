# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install native dependencies required for node-canvas compilation
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev

# Copy package manifests and install all dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source code and build TypeScript to dist
COPY . .
RUN npm run build

# Remove development dependencies to keep production footprint minimal
RUN npm prune --omit=dev

# -----------------------------------------------------------------------------
# Stage 2: Minimal Production Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime libraries for node-canvas, fonts, and CUPS printing tools
RUN apk add --no-cache \
    cairo \
    pango \
    jpeg \
    giflib \
    librsvg \
    pixman \
    fontconfig \
    ttf-dejavu \
    cups-client

ENV NODE_ENV=production

# Copy node_modules, compiled dist, and package.json from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create workspace volume directory for SQLite DB and job history
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

# Default command runs as standalone, can be overridden via docker-compose command
CMD ["node", "dist/api/server.js"]
