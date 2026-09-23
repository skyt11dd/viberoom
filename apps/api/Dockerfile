FROM node:20-alpine AS base

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app

# Copy root workspace configs
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./

# Copy packages and api app
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @viberoom/database generate
RUN pnpm --filter api build

FROM base AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/start.sh ./apps/api/start.sh

RUN chmod +x ./apps/api/start.sh

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "./apps/api/start.sh"]
