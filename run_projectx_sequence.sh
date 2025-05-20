#!/bin/bash

# --- Configuration ---
# Absolute path to your project directory
PROJECT_DIR="/Users/kevtrinh/Github/projectx" # Based on your workspace path

# Command to run Python from your virtual environment (if you use one)
# If your venv python is just 'python', change this.
PYTHON_EXECUTABLE="python3" 

# Path to your virtual environment's activation script (if you use one)
# Common venv names are 'venv', '.venv', 'env'. Adjust if yours is different.
VENV_ACTIVATE_PATH="$PROJECT_DIR/venv/bin/activate" 
# --- End Configuration ---

echo "Project directory: $PROJECT_DIR"
echo "Python executable: $PYTHON_EXECUTABLE"
echo "Venv activate path: $VENV_ACTIVATE_PATH"
echo "(If the venv path is incorrect, please edit this script)"
echo ""

# Function to activate venv if present
activate_venv() {
    if [ -f "$VENV_ACTIVATE_PATH" ]; then
        echo "Activating virtual environment..."
        source "$VENV_ACTIVATE_PATH"
    else
        echo "Warning: Virtual environment not found at $VENV_ACTIVATE_PATH."
        echo "Attempting to run scripts with system/current Python: $PYTHON_EXECUTABLE"
    fi
}

# Function to deactivate venv if it was sourced
deactivate_venv() {
    # Check if 'deactivate' function exists (common way venv is deactivated)
    if command -v deactivate &> /dev/null && [[ "$(type -t deactivate)" == "function" ]]; then
        echo "Deactivating virtual environment (if active)..."
        deactivate
    fi
}

# Navigate to project directory
cd "$PROJECT_DIR" || { echo "ERROR: Failed to navigate to project directory '$PROJECT_DIR'. Exiting."; exit 1; }
echo "Changed directory to $PROJECT_DIR"
echo ""

echo "STEP 0: Setting up database schema..."
echo "-------------------------------------"
activate_venv
"$PYTHON_EXECUTABLE" -m scripts.setup_local_db
DB_SETUP_STATUS=$?
deactivate_venv

if [ $DB_SETUP_STATUS -ne 0 ]; then
    echo "Failed to set up database schema. Exiting."
    exit 1
fi

echo "----------------------------------------"
echo "STEP 1: Starting Live Data Ingester..."
echo "(This will open a new Terminal window)"
echo "----------------------------------------"
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_DIR' && echo '--- Live Ingester Terminal ---' && if [ -f '$VENV_ACTIVATE_PATH' ]; then source '$VENV_ACTIVATE_PATH'; fi && echo 'Starting Live Ingester (src/data/ingestion/live_ingester.py)...' && '$PYTHON_EXECUTABLE' -m src.data.ingestion.live_ingester; echo 'Live Ingester process ended. Press any key to close.' && read -n 1\""

echo "Waiting 10 seconds for Live Ingester to initialize..."
sleep 10

echo "---------------------------------------------"
echo "STEP 2: Running Historical Data Download..."
echo "(Output will appear in this window)"
echo "---------------------------------------------"
activate_venv
"$PYTHON_EXECUTABLE" -m download_historical
HISTORICAL_DOWNLOAD_STATUS=$?
deactivate_venv

if [ $HISTORICAL_DOWNLOAD_STATUS -ne 0 ]; then
    echo "Failed to download historical data. Exiting."
    exit 1
fi

echo "--------------------------------------------------"
echo "STEP 3: Starting Analyzer Service (Trend Finder)..."
echo "(This will open a new Terminal window)"
echo "--------------------------------------------------"
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_DIR' && echo '--- Analyzer Service Terminal ---' && if [ -f '$VENV_ACTIVATE_PATH' ]; then source '$VENV_ACTIVATE_PATH'; fi && echo 'Starting Analyzer Service (src/analysis/analyzer_service.py)...' && '$PYTHON_EXECUTABLE' -m src.analysis.analyzer_service; echo 'Analyzer Service process ended. Press any key to close.' && read -n 1\""

echo ""
echo "-------------------------------------" 