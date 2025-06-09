#!/bin/bash
#
# Script to start a TimescaleDB instance in Docker for development
#

# Default values
CONTAINER_NAME="projectx_timescaledb"
DATABASE_NAME="projectx"
USERNAME="postgres"
PASSWORD="password"
PORT=5433
VOLUME_NAME="projectx_ts_data" # Using a named volume instead of a host directory

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "TimescaleDB container '${CONTAINER_NAME}' already exists."
    
    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "TimescaleDB is already running at localhost:${PORT}."
        echo "Database: ${DATABASE_NAME}"
        echo "Username: ${USERNAME}"
        echo "Password: ${PASSWORD}"
        echo "Volume: ${VOLUME_NAME}"
        echo
        echo "Connection URL: postgresql://${USERNAME}:${PASSWORD}@localhost:${PORT}/${DATABASE_NAME}"
        exit 0
    else
        # Start the container if it exists but is not running
        echo "Starting existing TimescaleDB container..."
        docker start ${CONTAINER_NAME}
        
        echo "TimescaleDB started successfully at localhost:${PORT}."
        echo "Database: ${DATABASE_NAME}"
        echo "Username: ${USERNAME}"
        echo "Password: ${PASSWORD}"
        echo "Volume: ${VOLUME_NAME}"
        echo
        echo "Connection URL: postgresql://${USERNAME}:${PASSWORD}@localhost:${PORT}/${DATABASE_NAME}"
        exit 0
    fi
fi

# Create Docker volume if it doesn't exist
if ! docker volume ls --format '{{.Name}}' | grep -q "^${VOLUME_NAME}$"; then
    echo "Creating Docker volume '${VOLUME_NAME}' for data persistence..."
    docker volume create ${VOLUME_NAME}
fi
echo "Data will be stored in Docker volume '${VOLUME_NAME}'"

# Run TimescaleDB container
echo "Starting TimescaleDB container..."

docker run -d \
    --name ${CONTAINER_NAME} \
    -e POSTGRES_PASSWORD=${PASSWORD} \
    -e POSTGRES_USER=${USERNAME} \
    -e POSTGRES_DB=${DATABASE_NAME} \
    -v ${VOLUME_NAME}:/var/lib/postgresql/data \
    -p ${PORT}:5432 \
    timescale/timescaledb:latest-pg15

# Check if the container started successfully
if [ $? -eq 0 ]; then
    echo "TimescaleDB started successfully at localhost:${PORT}."
    echo "Database: ${DATABASE_NAME}"
    echo "Username: ${USERNAME}"
    echo "Password: ${PASSWORD}"
    echo "Volume: ${VOLUME_NAME}"
    echo
    echo "Connection URL: postgresql://${USERNAME}:${PASSWORD}@localhost:${PORT}/${DATABASE_NAME}"
    echo
    echo "To stop the database:  docker stop ${CONTAINER_NAME}"
    echo "To start the database: docker start ${CONTAINER_NAME}"
else
    echo "Failed to start TimescaleDB container."
    exit 1
fi

# Wait for the database to fully start
echo
echo "Waiting for TimescaleDB to initialize..."
sleep 5

echo "TimescaleDB is ready for use with ProjectX!"
echo "Update your .env file with: TIMESCALE_DB_URL=postgresql://${USERNAME}:${PASSWORD}@localhost:${PORT}/${DATABASE_NAME}" 