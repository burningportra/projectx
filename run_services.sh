#!/bin/sh

# Create logs directory if it doesn't exist
mkdir -p logs

# Kill existing services to prevent "address already in use" errors
echo "Attempting to stop any existing services..."
pkill -f "src.services.broadcaster"
pkill -f "src.data.ingestion.live_ingester"
pkill -f "src.analysis.analyzer_service"
echo "Waiting for ports to release..."
sleep 1 # Add a 1-second delay
echo "Existing services (if any) should be stopped and ports released."

# Check database configuration from environment or use defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-projectx_test}"
DB_USER="${DB_USER:-postgres}"

echo "Checking database connection at ${DB_HOST}:${DB_PORT}..."
if pg_isready -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME}; then
    echo "Database is ready."
else
    echo "Database is not ready. Please ensure it is running and accessible."
    echo "Current configuration:"
    echo "  Host: ${DB_HOST}"
    echo "  Port: ${DB_PORT}"
    echo "  Database: ${DB_NAME}"
    echo "  User: ${DB_USER}"
    echo ""
    echo "To use a different database, set environment variables:"
    echo "  DB_HOST=localhost DB_PORT=5434 DB_NAME=projectx_test ./run_services.sh"
    exit 1
fi

# Start the live ingester in the background with nohup and output redirection
echo "Starting live_ingester.py in background (see logs/ingester.log)..."
nohup python3 -m src.data.ingestion.live_ingester > logs/ingester.log 2>&1 &

# Start the broadcaster service in the background with nohup and output redirection
echo "Starting broadcaster.py in background (see logs/broadcaster.log)..."
nohup env LOCAL_DB_NAME=${DB_NAME} python3 -m src.services.broadcaster > logs/broadcaster.log 2>&1 &
BROADCASTER_PID=$!

# Add a small delay to allow background services to attempt startup and potentially fail fast
sleep 2

# Check if the broadcaster is still running
if ! ps -p $BROADCASTER_PID > /dev/null; then
    echo "ERROR: broadcaster.py failed to start. Displaying log:"
    cat logs/broadcaster.log
    # Also kill the ingester since the pipeline is broken
    pkill -f "src.data.ingestion.live_ingester"
    exit 1
fi

# Start the analyzer service in the foreground
echo "Starting analyzer_service.py in foreground..."
python3 -m src.analysis.analyzer_service

echo "Services have been launched (or analyzer_service has finished/terminated)." 