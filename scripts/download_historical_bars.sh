#!/bin/bash

# ====================================================================
# HISTORICAL DATA DOWNLOAD SCRIPT
# ====================================================================
# Script to download historical data to the test database
# 
# USAGE EXAMPLES:
# ---------------
# 
# 1. Download all timeframes including 1s (default):
#    ./scripts/download_historical_bars.sh
# 
# 2. Download only 1s data for specific period:
#    ./scripts/download_historical_bars.sh --timeframes "1s" --start-date "2024-12-15" --end-date "2024-12-16"
# 
# 3. Download 1s data with custom contracts:
#    ./scripts/download_historical_bars.sh --contracts "CON.F.US.MES.M25,CON.F.US.NQ.M25" --timeframes "1s"
# 
# 4. Download multiple timeframes:
#    ./scripts/download_historical_bars.sh --timeframes "1s,1m,5m" --batch-size 500
# 
# TIMEFRAME SUPPORT:
# ------------------
# - 1s  = 1-second bars (high volume, 7-day default lookback)
# - 1m  = 1-minute bars
# - 5m  = 5-minute bars
# - 15m = 15-minute bars
# - 30m = 30-minute bars
# - 1h  = 1-hour bars
# - 4h  = 4-hour bars
# - 1d  = 1-day bars
# - 1w  = 1-week bars
# 
# IMPORTANT NOTES:
# ----------------
# - 1s data is VERY voluminous (~86,400 bars/day/contract)
# - Default lookback for 1s data is limited to 1 week
# - Rate limiting is increased for 1s data requests
# - Ensure database can handle the volume before downloading
# 
# ====================================================================

# Set the password environment variable that the scripts expect
export LOCAL_DB_PASSWORD=password

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Downloading historical data to test database...${NC}"
echo -e "${YELLOW}Database: projectx_test on port 5434${NC}"

# Check if test database container is running
if ! docker ps --format "{{.Names}}" | grep -q "projectx_test_timescaledb"; then
    echo -e "${RED}Error: Test database container is not running${NC}"
    echo "Please run: ./scripts/create_new_db_docker_prisma.sh projectx_test 5434"
    exit 1
fi

# Default parameters
CONTRACTS="CON.F.US.MES.M25"
TIMEFRAMES="1s,1m,5m,15m,30m,1h,4h,1d"
BATCH_SIZE=1000

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --contracts)
            CONTRACTS="$2"
            shift 2
            ;;
        --timeframes)
            TIMEFRAMES="$2"
            shift 2
            ;;
        --batch-size)
            BATCH_SIZE="$2"
            shift 2
            ;;
        --start-date)
            START_DATE="--start-date $2"
            shift 2
            ;;
        --end-date)
            END_DATE="--end-date $2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --contracts <list>     Comma-separated list of contracts (default: CON.F.US.MES.M25)"
            echo "  --timeframes <list>    Comma-separated list of timeframes (default: 1s,1m,5m,15m,30m,1h,4h,1d)"
            echo "  --batch-size <num>     Bars per request (default: 1000)"
            echo "  --start-date <date>    Start date (YYYY-MM-DD, YYYY-M-D, etc.)"
            echo "  --end-date <date>      End date (YYYY-MM-DD, YYYY-M-D, etc.)"
            echo "  -h, --help             Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}Configuration:${NC}"
echo "  Contracts: $CONTRACTS"
echo "  Timeframes: $TIMEFRAMES"
echo "  Batch size: $BATCH_SIZE"
if [ -n "$START_DATE" ]; then echo "  Start date: ${START_DATE#--start-date }"; fi
if [ -n "$END_DATE" ]; then echo "  End date: ${END_DATE#--end-date }"; fi
echo ""

# Run the download script
python download_historical_projectx.py \
    --contracts "$CONTRACTS" \
    --timeframes "$TIMEFRAMES" \
    --batch-size "$BATCH_SIZE" \
    $START_DATE \
    $END_DATE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Data download completed successfully!${NC}"
    
    # Show summary of downloaded data
    echo -e "${YELLOW}Checking downloaded data...${NC}"
    PGPASSWORD=password psql -h localhost -p 5434 -U postgres -d projectx_test -c \
        "SELECT 
            contract_id,
            CASE 
                WHEN timeframe_unit = 1 THEN timeframe_value || 's'
                WHEN timeframe_unit = 2 THEN timeframe_value || 'm'
                WHEN timeframe_unit = 3 THEN timeframe_value || 'h'
                WHEN timeframe_unit = 4 THEN timeframe_value || 'd'
                WHEN timeframe_unit = 5 THEN timeframe_value || 'w'
            END as timeframe,
            COUNT(*) as bars,
            MIN(timestamp) as earliest,
            MAX(timestamp) as latest
        FROM ohlc_bars 
        GROUP BY contract_id, timeframe_unit, timeframe_value 
        ORDER BY contract_id, timeframe_unit, timeframe_value;"
else
    echo -e "${RED}✗ Data download failed${NC}"
    exit 1
fi 