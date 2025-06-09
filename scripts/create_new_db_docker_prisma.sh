#!/bin/bash

# Script to create a new TimescaleDB Docker container and use Prisma to create schema
# Usage: ./create_new_db_docker_prisma.sh <new_database_name> [port]

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Please provide a new database name${NC}"
    echo "Usage: $0 <new_database_name> [port]"
    echo "Example: $0 projectx_test 5434"
    exit 1
fi

NEW_DB_NAME=$1
NEW_PORT=${2:-5434}  # Default to 5434 if not specified
CONTAINER_NAME="${NEW_DB_NAME}_timescaledb"
USERNAME="postgres"
PASSWORD="password"
DATA_DIR="./${NEW_DB_NAME}_data"

echo -e "${YELLOW}Creating new TimescaleDB container: ${CONTAINER_NAME}${NC}"
echo -e "${YELLOW}Database name: ${NEW_DB_NAME}${NC}"
echo -e "${YELLOW}Port: ${NEW_PORT}${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}Error: Container '${CONTAINER_NAME}' already exists${NC}"
    echo "To remove it: docker rm -f ${CONTAINER_NAME}"
    exit 1
fi

# Check if port is already in use
if lsof -Pi :${NEW_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}Error: Port ${NEW_PORT} is already in use${NC}"
    exit 1
fi

# Create data directory
mkdir -p ${DATA_DIR}
echo -e "${YELLOW}Data will be stored in ${DATA_DIR}${NC}"

# Step 1: Create and start new TimescaleDB container
echo -e "${YELLOW}Starting new TimescaleDB container...${NC}"
docker run -d \
    --name ${CONTAINER_NAME} \
    -e POSTGRES_PASSWORD=${PASSWORD} \
    -e POSTGRES_USER=${USERNAME} \
    -e POSTGRES_DB=${NEW_DB_NAME} \
    -v ${DATA_DIR}:/var/lib/postgresql/data \
    -p ${NEW_PORT}:5432 \
    timescale/timescaledb:latest-pg15

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to start Docker container${NC}"
    exit 1
fi

# Wait for database to be ready
echo -e "${YELLOW}Waiting for database to initialize...${NC}"
sleep 10

# Check if database is ready
export PGPASSWORD=${PASSWORD}
until psql -h localhost -p ${NEW_PORT} -U ${USERNAME} -d ${NEW_DB_NAME} -c '\q' 2>/dev/null; do
    echo "Waiting for database to be ready..."
    sleep 2
done

# Step 2: Enable TimescaleDB extension
echo -e "${YELLOW}Enabling TimescaleDB extension...${NC}"
psql -h localhost -p ${NEW_PORT} -U ${USERNAME} -d ${NEW_DB_NAME} \
    -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"

# Step 3: Create temporary .env file for Prisma
TEMP_ENV_FILE="web/.env.temp"
echo "DATABASE_URL=\"postgresql://${USERNAME}:${PASSWORD}@localhost:${NEW_PORT}/${NEW_DB_NAME}\"" > ${TEMP_ENV_FILE}

# Step 4: Run Prisma db push to create schema
echo -e "${YELLOW}Creating schema using Prisma...${NC}"
cd web

# Export the DATABASE_URL for Prisma to use
export DATABASE_URL="postgresql://${USERNAME}:${PASSWORD}@localhost:${NEW_PORT}/${NEW_DB_NAME}"

# Run Prisma db push
npx prisma db push --skip-generate

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to create schema with Prisma${NC}"
    cd ..
    rm -f ${TEMP_ENV_FILE}
    exit 1
fi

# Step 5: Convert ohlc_bars to hypertable
echo -e "${YELLOW}Converting ohlc_bars to TimescaleDB hypertable...${NC}"
PGPASSWORD=${PASSWORD} psql -h localhost -p ${NEW_PORT} -U ${USERNAME} -d ${NEW_DB_NAME} \
    -c "SELECT create_hypertable('ohlc_bars', 'timestamp', if_not_exists => TRUE);" 2>/dev/null || \
    echo "Note: ohlc_bars might already be a hypertable"

# Clean up
rm -f ${TEMP_ENV_FILE}
cd ..
unset PGPASSWORD
unset DATABASE_URL

echo -e "${GREEN}✓ New database container created successfully with Prisma schema!${NC}"
echo ""
echo -e "${GREEN}Container: ${CONTAINER_NAME}${NC}"
echo -e "${GREEN}Database: ${NEW_DB_NAME}${NC}"
echo -e "${GREEN}Port: ${NEW_PORT}${NC}"
echo -e "${GREEN}Username: ${USERNAME}${NC}"
echo -e "${GREEN}Password: ${PASSWORD}${NC}"
echo ""
echo -e "${YELLOW}Connection URL:${NC}"
echo "postgresql://${USERNAME}:${PASSWORD}@localhost:${NEW_PORT}/${NEW_DB_NAME}"
echo ""
echo -e "${YELLOW}To use this database:${NC}"
echo "1. Update your .env file:"
echo "   DATABASE_URL=\"postgresql://${USERNAME}:${PASSWORD}@localhost:${NEW_PORT}/${NEW_DB_NAME}\""
echo ""
echo "2. Update web/.env.local file:"
echo "   DATABASE_URL=\"postgresql://${USERNAME}:${PASSWORD}@localhost:${NEW_PORT}/${NEW_DB_NAME}\""
echo ""
echo "3. The Prisma client is already configured!"
echo ""
echo -e "${YELLOW}Docker commands:${NC}"
echo "Stop container:   docker stop ${CONTAINER_NAME}"
echo "Start container:  docker start ${CONTAINER_NAME}"
echo "Remove container: docker rm -f ${CONTAINER_NAME}"
echo "View logs:        docker logs ${CONTAINER_NAME}"