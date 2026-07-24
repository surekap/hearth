#!/bin/sh
set -eu

cd /app

echo "Waiting for Postgres..."
node ./scripts/wait-for-db.mjs

echo "Applying database schema..."
npm run db:push

echo "Backfilling AI conversation topics..."
./node_modules/.bin/tsx scripts/backfill-ai-conversations.ts

echo "Seeding default data..."
npm run db:seed

echo "Starting Hearth..."
exec npm run start
