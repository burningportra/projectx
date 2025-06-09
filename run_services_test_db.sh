#!/bin/bash

# Script to run services with the test database on port 5434
# This sets up the environment for using projectx_test database

# Set database configuration for the shell script checks
export DB_HOST="localhost"
export DB_PORT="5434"
export DB_NAME="projectx_test"
export DB_USER="postgres"

# Set the password that the analyzer service expects
export LOCAL_DB_PASSWORD="password"

# Also set DATABASE_URL for any services that use it
export DATABASE_URL="postgresql://postgres:password@localhost:5434/projectx_test"

# For TimescaleDB URL (in case any service uses this)
export TIMESCALE_DB_URL="postgresql://postgres:password@localhost:5434/projectx_test"

echo "Running services with test database configuration:"
echo "  Database: projectx_test"
echo "  Port: 5434"
echo "  User: postgres"
echo ""
echo "Note: The analyzer service is still configured to use port 5433 in settings.yaml"
echo "You'll need to either:"
echo "  1. Temporarily modify config/settings.yaml to use port 5434, or"
echo "  2. Create a new database on port 5433 with the same schema"
echo ""

# Run the main services script
./run_services.sh 