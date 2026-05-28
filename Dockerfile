FROM node:22-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* package-lock.json* ./
# Install dependencies in non-interactive mode; skip frozen checks since pnpm-lock.yaml is outdated
RUN \
  if [ -f pnpm-lock.yaml ]; then npm install -g pnpm@9 && pnpm i --no-frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Production image, copy all files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy everything from builder to ensure all scripts, configs, and dependencies are available
COPY --from=builder /app ./

EXPOSE 3000

CMD ["npm", "run", "start"]
