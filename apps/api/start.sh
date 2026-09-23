#!/bin/sh
set -e

echo "Running Prisma DB push..."
./node_modules/.bin/prisma db push --schema=packages/database/prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 || echo "Warning: db push failed, continuing..."

echo "Starting API server..."
exec node apps/api/dist/main.js
