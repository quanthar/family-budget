FROM node:20-slim

# Install OpenSSL for Prisma engine
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install all dependencies (including devDeps needed for build)
RUN npm install

# Copy application source code
COPY . .

# Build Next.js application
ENV DATABASE_URL="file:./prisma/dev.db"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# Production configuration
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

# Initialize SQLite database schema, seed demo data, and start server
CMD sh -c "npx prisma db push && npx tsx prisma/seed.ts && npx next start -p ${PORT:-10000} -H 0.0.0.0"
