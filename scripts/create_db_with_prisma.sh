#!/bin/bash

# Script to create a new database using Prisma schema
# Usage: ./create_db_with_prisma.sh <new_database_name>

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Please provide a new database name${NC}"
    echo "Usage: $0 <new_database_name>"
    exit 1
fi

NEW_DB_NAME=$1
DB_USER="postgres"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5433"

echo -e "${YELLOW}Creating new database: ${NEW_DB_NAME}${NC}"

# Create the database first
export PGPASSWORD=$DB_PASSWORD

# Check if database exists
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $NEW_DB_NAME; then
    echo -e "${RED}Error: Database '$NEW_DB_NAME' already exists${NC}"
    exit 1
fi

# Create database
echo -e "${YELLOW}Creating database...${NC}"
createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $NEW_DB_NAME

# Enable TimescaleDB
echo -e "${YELLOW}Enabling TimescaleDB extension...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $NEW_DB_NAME -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"

# Create temporary .env file for Prisma
TEMP_ENV_FILE="web/.env.temp"
echo "DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$NEW_DB_NAME\"" > $TEMP_ENV_FILE

# Run Prisma db push to create schema
echo -e "${YELLOW}Creating schema using Prisma...${NC}"
cd web
npx dotenv -e .env.temp -- prisma db push --skip-generate

# Convert ohlc_bars to hypertable
echo -e "${YELLOW}Converting ohlc_bars to TimescaleDB hypertable...${NC}"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $NEW_DB_NAME -c "SELECT create_hypertable('ohlc_bars', 'timestamp', if_not_exists => TRUE);" 2>/dev/null || echo "Note: ohlc_bars might already be a hypertable"

# Clean up temp file
rm -f .env.temp
cd ..

echo -e "${GREEN}✓ Database '$NEW_DB_NAME' created successfully with Prisma schema!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update your .env file:"
echo "   DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$NEW_DB_NAME\""
echo ""
echo "2. Update web/.env.local file:"
echo "   DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$NEW_DB_NAME\""
echo ""
echo "3. The Prisma client is already configured for the new database!"

unset PGPASSWORD 