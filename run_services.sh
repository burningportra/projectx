#!/bin/sh

# Start the live ingester in the background
echo "Starting live_ingester.py in background..."
python3 -m src.data.ingestion.live_ingester &

# Start the broadcaster service in the background
echo "Starting broadcaster.py in background..."
python3 -m src.services.broadcaster &

# Start the analyzer service in the foreground
echo "Starting analyzer_service.py in foreground..."
python3 -m src.analysis.analyzer_service

echo "Services have been launched." 