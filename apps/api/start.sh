#!/bin/sh
set -e

echo "=== VibeRoom API Starting ==="

# Find local prisma CLI
PRISMA_CMD=""
if [ -f "./packages/database/node_modules/.bin/prisma" ]; then
  PRISMA_CMD="./packages/database/node_modules/.bin/prisma"
elif [ -f "./packages/database/node_modules/prisma/build/index.js" ]; then
  PRISMA_CMD="node ./packages/database/node_modules/prisma/build/index.js"
elif [ -f "./node_modules/.bin/prisma" ]; then
  PRISMA_CMD="./node_modules/.bin/prisma"
elif [ -f "./node_modules/prisma/build/index.js" ]; then
  PRISMA_CMD="node ./node_modules/prisma/build/index.js"
fi

if [ -n "$PRISMA_CMD" ]; then
  echo "Running Prisma DB push via $PRISMA_CMD..."
  $PRISMA_CMD db push --schema=packages/database/prisma/schema.prisma --skip-generate --accept-data-loss || {
    echo "Warning: Prisma db push failed, continuing..."
  }
else
  echo "Prisma local binary not found, attempting npx prisma@5.10.0..."
  npx prisma@5.10.0 db push --schema=packages/database/prisma/schema.prisma --skip-generate --accept-data-loss || {
    echo "Warning: npx prisma push failed, continuing..."
  }
fi

echo "Starting API server..."
exec node apps/api/dist/main.js

