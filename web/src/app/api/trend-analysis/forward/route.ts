import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bars, contract_id, timeframe, current_bar_index, debug = false } = body;

    // Validate request
    if (!bars || !Array.isArray(bars) || bars.length === 0) {
      return NextResponse.json({ error: 'No bars provided' }, { status: 400 });
    }

    if (typeof current_bar_index !== 'number' || current_bar_index < 1) {
      return NextResponse.json({ error: 'Invalid current_bar_index' }, { status: 400 });
    }

    console.log(`[Forward Trend API] Processing ${bars.length} bars up to index ${current_bar_index} for ${contract_id} ${timeframe}`);

    // Convert bars to the format expected by our Python forward testing script
    const formattedBars = bars.map((bar: any, index: number) => ({
      contract_id: contract_id || 'UNKNOWN',
      timestamp: bar.timestamp,
      open: parseFloat(bar.open),
      high: parseFloat(bar.high),
      low: parseFloat(bar.low),
      close: parseFloat(bar.close),
      volume: parseFloat(bar.volume || '0'),
      timeframe_unit: 4, // Assuming daily for now, could be parameterized
      timeframe_value: 1
    }));

    // Create input for Python script
    const pythonInput = {
      bars: formattedBars,
      contract_id: contract_id || 'UNKNOWN',
      timeframe: timeframe || '1d',
      current_bar_index: current_bar_index,
      process_single_bar: true // Flag to indicate we want single bar processing
    };

    // Get the absolute path to the Python script
    const projectRoot = path.resolve(process.cwd(), '..');
    const pythonScriptPath = path.join(projectRoot, 'trend_analysis', 'trend_start_forward_test.py');
    
    console.log(`[Forward Trend API] Calling Python script at: ${pythonScriptPath}`);
    console.log(`[Forward Trend API] Input data: ${formattedBars.length} bars, processing up to bar ${current_bar_index}`);

    // Execute Python script for forward testing
    const result = await new Promise<any>((resolve, reject) => {
      const pythonProcess = spawn('python3', ['-c', `
import sys
import json
import os
sys.path.insert(0, '${projectRoot}')

from trend_analysis.trend_start_forward_test import ForwardTrendAnalyzer
from trend_analysis.trend_models import Bar
import trend_analysis.trend_utils as trend_utils
import datetime

# Disable debug mode for API calls to prevent stdout interference
trend_utils.DEBUG_MODE_ACTIVE = False

# Read input from stdin
input_data = json.loads(sys.stdin.read())

try:
    # Create analyzer
    analyzer = ForwardTrendAnalyzer(
        contract_id=input_data.get('contract_id', 'UNKNOWN'),
        timeframe_str=input_data.get('timeframe', '1d')
    )
    
    # Convert bars to Bar objects
    bars = []
    for i, bar_data in enumerate(input_data['bars']):
        # Create Bar object with proper indexing (1-based)
        bar = Bar(
            index=i + 1,
            timestamp=datetime.datetime.fromisoformat(bar_data['timestamp'].replace('Z', '+00:00')),
            o=bar_data['open'],
            h=bar_data['high'],
            l=bar_data['low'],
            c=bar_data['close'],
            volume=bar_data['volume']
        )
        bars.append(bar)
    
    # Process bars up to current_bar_index using forward testing
    current_bar_index = input_data['current_bar_index']
    new_signals_for_current_bar = []
    
    # Process each bar sequentially up to the current bar
    for bar_idx in range(min(current_bar_index, len(bars))):
        bar = bars[bar_idx]
        signals_for_this_bar = analyzer.process_new_bar(bar)
        
        # Only return signals for the current bar (last processed bar)
        if bar_idx == current_bar_index - 1:  # Convert to 0-based
            new_signals_for_current_bar = signals_for_this_bar
    
    # Get all signals found so far for reference
    all_signals = analyzer.get_all_signals()
    
    # Convert datetime objects to strings for JSON serialization
    def serialize_datetime(obj):
        if hasattr(obj, 'timestamp') and hasattr(obj.timestamp, 'isoformat'):
            obj_dict = obj.__dict__.copy() if hasattr(obj, '__dict__') else obj
            if isinstance(obj_dict, dict) and 'timestamp' in obj_dict:
                obj_dict['timestamp'] = obj_dict['timestamp'].isoformat()
            return obj_dict
        elif isinstance(obj, dict):
            for key, value in obj.items():
                if hasattr(value, 'isoformat'):  # datetime object
                    obj[key] = value.isoformat()
                elif isinstance(value, dict):
                    obj[key] = serialize_datetime(value)
        return obj
    
    # Serialize all signals to handle datetime objects
    serialized_new_signals = []
    for signal in new_signals_for_current_bar:
        if isinstance(signal, dict):
            serialized_signal = serialize_datetime(signal.copy())
        else:
            serialized_signal = signal
        serialized_new_signals.append(serialized_signal)
    
    serialized_all_signals = []
    for signal in all_signals:
        if isinstance(signal, dict):
            serialized_signal = serialize_datetime(signal.copy())
        else:
            serialized_signal = signal
        serialized_all_signals.append(serialized_signal)
    
    # Format output
    output = {
        'success': True,
        'new_signals': serialized_new_signals,  # Only new signals for current bar
        'all_signals': serialized_all_signals,  # All signals up to current bar
        'total_signals': len(all_signals),
        'current_bar_index': current_bar_index,
        'bars_processed': len(bars)
    }
    
    print(json.dumps(output))
    
except Exception as e:
    import traceback
    error_output = {
        'success': False,
        'error': str(e),
        'traceback': traceback.format_exc()
    }
    print(json.dumps(error_output), file=sys.stderr)
    print(json.dumps({'success': False, 'error': str(e)}))
      `], {
        cwd: projectRoot,
        env: { ...process.env, PYTHONPATH: projectRoot }
      });

      let output = '';
      let error = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`[Forward Trend API] Python process exited with code ${code}`);
          console.error(`[Forward Trend API] Python stderr:`, error);
          reject(new Error(`Python process failed with code ${code}: ${error}`));
        } else {
          try {
            const result = JSON.parse(output);
            if (debug && error) {
              console.log(`[Forward Trend API] Python stderr (debug):`, error);
            }
            resolve(result);
          } catch (parseError) {
            console.error(`[Forward Trend API] Failed to parse Python output:`, output);
            reject(new Error(`Failed to parse Python output: ${parseError}`));
          }
        }
      });

      pythonProcess.on('error', (err) => {
        console.error(`[Forward Trend API] Failed to start Python process:`, err);
        reject(err);
      });

      // Send input to Python script
      pythonProcess.stdin.write(JSON.stringify(pythonInput));
      pythonProcess.stdin.end();
    });

    if (!result.success) {
      console.error(`[Forward Trend API] Python script error:`, result.error);
      return NextResponse.json({ 
        error: 'Trend analysis failed', 
        details: result.error,
        traceback: result.traceback
      }, { status: 500 });
    }

    console.log(`[Forward Trend API] Success! Found ${result.new_signals?.length || 0} new signals for bar ${current_bar_index}, ${result.total_signals} total signals`);

    return NextResponse.json({
      success: true,
      signals: result.all_signals || [], // All signals for compatibility
      new_signals: result.new_signals || [], // Only new signals for current bar
      total_signals: result.total_signals || 0,
      current_bar_index: result.current_bar_index,
      bars_processed: result.bars_processed,
      contract_id,
      timeframe
    });

  } catch (error: any) {
    console.error('[Forward Trend API] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
} 