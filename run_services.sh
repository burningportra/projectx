#!/bin/sh

# Start the live ingester in the background
echo "Starting live_ingester.py in background..."
python -m src.data.ingestion.live_ingester &

# Start the analyzer service in the foreground
echo "Starting analyzer_service.py in foreground..."
python -m src.analysis.analyzer_service

echo "Services have been launched." 