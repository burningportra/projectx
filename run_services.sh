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