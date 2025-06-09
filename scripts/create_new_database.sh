#!/bin/bash

# Script to create a new database with the same schema as projectx
# Usage: ./create_new_database.sh <new_database_name>

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if database name is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Please provide a new database name${NC}"
    echo "Usage: $0 <new_database_name>"
    exit 1
fi

NEW_DB_NAME=$1
OLD_DB_NAME="projectx"
DB_USER="postgres"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5433"

echo -e "${YELLOW}Creating new database: ${NEW_DB_NAME}${NC}"

# Export environment variables for psql
export PGPASSWORD=$DB_PASSWORD

# Step 1: Check if new database already exists
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $NEW_DB_NAME; then
    echo -e "${RED}Error: Database '$NEW_DB_NAME' already exists${NC}"
    exit 1
fi

# Step 2: Export schema from existing database
echo -e "${YELLOW}Exporting schema from $OLD_DB_NAME...${NC}"
pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $OLD_DB_NAME --schema-only --no-owner --no-privileges > /tmp/projectx_schema.sql

# Step 3: Create new database
echo -e "${YELLOW}Creating database $NEW_DB_NAME...${NC}"
createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $NEW_DB_NAME

# Step 4: Import schema to new database
echo -e "${YELLOW}Importing schema to $NEW_DB_NAME...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $NEW_DB_NAME < /tmp/projectx_schema.sql

# Step 5: Enable TimescaleDB extension if needed
echo -e "${YELLOW}Enabling TimescaleDB extension...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $NEW_DB_NAME -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"

# Step 6: Convert ohlc_bars to hypertable if it exists
echo -e "${YELLOW}Converting ohlc_bars to hypertable...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $NEW_DB_NAME -c "SELECT create_hypertable('ohlc_bars', 'timestamp', if_not_exists => TRUE);" 2>/dev/null || echo "Note: ohlc_bars table might not exist yet or is already a hypertable"

# Clean up
rm -f /tmp/projectx_schema.sql

echo -e "${GREEN}✓ Database '$NEW_DB_NAME' created successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update your .env file:"
echo "   DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$NEW_DB_NAME\""
echo ""
echo "2. Update web/.env.local file:"
echo "   DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$NEW_DB_NAME\""
echo ""
echo "3. Run Prisma generate in the web directory:"
echo "   cd web && npx prisma generate"
echo ""
echo "4. (Optional) Run Prisma migrate to ensure schema is in sync:"
echo "   cd web && npx prisma db push"

unset PGPASSWORD 