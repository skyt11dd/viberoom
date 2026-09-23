#!/bin/sh
set -e

echo "Running Prisma DB push..."
npx prisma db push --schema=packages/database/prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 || echo "Warning: db push failed, continuing anyway..."

echo "Starting API server..."
exec node apps/api/dist/main.js
