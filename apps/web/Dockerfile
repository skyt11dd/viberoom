FROM node:20-alpine AS base

# Install openssl for Prisma
RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app

# Declare build args so Railway passes env vars at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_BOT_USERNAME

# Make them available as env vars during build
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_BOT_USERNAME=$NEXT_PUBLIC_BOT_USERNAME

# Copy root configs
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./

# Copy packages and web app
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @viberoom/shared build
RUN pnpm --filter web build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
