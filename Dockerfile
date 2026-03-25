# Use official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Copy backend files first for dependency installation
COPY backend/package.json backend/bun.lock* ./backend/
WORKDIR /app/backend
RUN bun install --frozen-lockfile

WORKDIR /app

# Copy all source code
COPY backend/src ./backend/src/
COPY backend/drizzle.config.ts ./backend/
COPY backend/drizzle ./backend/drizzle/
COPY frontend ./frontend/

# Build frontend
WORKDIR /app/frontend
RUN bun install --frozen-lockfile
RUN bun run build

# Copy built frontend to backend public folder
WORKDIR /app
RUN mkdir -p backend/public && cp -r frontend/dist/* backend/public/

WORKDIR /app/backend

# Expose port
EXPOSE 3000

# Start the server (run migrations first, then start app)
CMD ["/bin/sh", "-c", "bunx drizzle-kit migrate && bun src/index.ts"]
