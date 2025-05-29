#!/bin/sh

# Create logs directory if it doesn't exist

# Kill existing services to prevent "address already in use" errors
echo "Attempting to stop any existing services..."
pkill -f "src.services.broadcaster"
pkill -f "src.data.ingestion.live_ingester"
pkill -f "src.analysis.analyzer_service"
echo "Waiting for ports to release..."
sleep 1 # Add a 1-second delay
echo "Existing services (if any) should be stopped and ports released."

# Check if TimescaleDB is ready
echo "Checking TimescaleDB connection..."
if pg_isready -h localhost -p 5433 -U postgres -d projectx; then
    echo "TimescaleDB is ready."
else
    echo "TimescaleDB is not ready. Please ensure it is running and accessible."
    echo "You might need to run: sh run_timescaledb_docker.sh"
    exit 1
fi

# Start the live ingester in the background with nohup and output redirection
echo "Starting live_ingester.py in background (see logs/ingester.log)..."
nohup python3 -m src.data.ingestion.live_ingester > logs/ingester.log 2>&1 &

# Start the broadcaster service in the background with nohup and output redirection
echo "Starting broadcaster.py in background (see logs/broadcaster.log)..."
nohup python3 -m src.services.broadcaster > logs/broadcaster.log 2>&1 &

# Add a small delay to allow background services to attempt startup and potentially fail fast
sleep 2

# Start the analyzer service in the foreground
echo "Starting analyzer_service.py in foreground..."
python3 -m src.analysis.analyzer_service

echo "Services have been launched (or analyzer_service has finished/terminated)." 