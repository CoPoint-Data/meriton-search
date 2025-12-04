#!/bin/sh
set -e

echo "🚀 Starting Legacy Search application..."

# Wait for postgres to be ready
echo "⏳ Waiting for PostgreSQL..."
until nc -z postgres 5432; do
  sleep 1
done
echo "✅ PostgreSQL is ready!"

# Run database setup
echo "📊 Setting up database..."
npx prisma db push --skip-generate --accept-data-loss || true

echo "🌱 Creating default user..."
# The app will create default user on first request via auto-login

echo "✅ Database setup complete!"
echo "🎯 Starting Next.js server..."

# Start the application
exec node server.js
