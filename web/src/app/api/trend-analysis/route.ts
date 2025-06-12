import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

interface TrendAnalysisRequest {
  bars: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  contract_id: string;
  timeframe: string;
  debug?: boolean;
}

interface TrendStartSignal {
  signal_type: 'CUS' | 'CDS' | 'PUS' | 'PDS' | 'FORCED_CUS' | 'FORCED_CDS';
  bar_index: number;
  timestamp: string;
  price: number;
  message?: string;
  confidence?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: TrendAnalysisRequest = await request.json();
    
    if (!body.bars || !Array.isArray(body.bars) || body.bars.length === 0) {
      return NextResponse.json({ error: 'bars array is required and must not be empty' }, { status: 400 });
    }
    
    if (!body.contract_id || !body.timeframe) {
      return NextResponse.json({ error: 'contract_id and timeframe are required' }, { status: 400 });
    }

    console.log(`[TrendAnalysis API] Processing ${body.bars.length} bars for ${body.contract_id} ${body.timeframe}`);
    console.log(`[TrendAnalysis API] First 3 bars:`, body.bars.slice(0, 3));
    console.log(`[TrendAnalysis API] Last 3 bars:`, body.bars.slice(-3));

    // Prepare data for Python script
    const pythonInput = {
      bars: body.bars,
      contract_id: body.contract_id,
      timeframe: body.timeframe,
      debug: true // Force debug mode to see what's happening
    };

    // Call Python trend_start_finder.py
    const signals = await callPythonTrendFinder(pythonInput);
    
    console.log(`[TrendAnalysis API] Generated ${signals.length} trend signals`);
    if (signals.length > 0) {
      console.log(`[TrendAnalysis API] First signal:`, signals[0]);
    }

    return NextResponse.json({
      signals,
      metadata: {
        total_bars: body.bars.length,
        total_signals: signals.length,
        contract_id: body.contract_id,
        timeframe: body.timeframe
      }
    }, { status: 200 });

  } catch (error) {
    console.error('[TrendAnalysis API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to analyze trend data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function callPythonTrendFinder(input: any): Promise<TrendStartSignal[]> {
  return new Promise((resolve, reject) => {
    // Path to your Python trend_start_finder.py - Updated to correct location
    const projectRoot = path.join(process.cwd(), '..');
    const pythonScriptPath = path.join(projectRoot, 'src', 'strategies', 'trend_start_finder.py');
    
    console.log(`[Python Call] Project root: ${projectRoot}`);
    console.log(`[Python Call] Executing: python3 ${pythonScriptPath}`);
    console.log(`[Python Call] Script exists: ${require('fs').existsSync(pythonScriptPath)}`);
    
    // Spawn Python process with correct environment
    const pythonProcess = spawn('python3', [pythonScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        PYTHONPATH: projectRoot // Set PYTHONPATH to project root
      },
      cwd: projectRoot // Set working directory to project root
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      console.log(`[Python Call] Process exited with code ${code}`);
      console.log(`[Python Call] Full stdout:`, stdout);
      if (stderr) {
        console.log(`[Python Call] stderr:`, stderr);
      }
      
      if (code !== 0) {
        console.error('[Python Call] stderr:', stderr);
        reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Parse the output from Python script
        const lines = stdout.trim().split('\n');
        const signals: TrendStartSignal[] = [];
        
        let parsingSignals = false;
        
        for (const line of lines) {
          if (line.includes('--- Signals Found ---')) {
            parsingSignals = true;
            console.log(`[Python Call] Found signals section`);
            continue;
          }
          
          if (line.includes('--- Debug Logs') || line.includes('No signals')) {
            parsingSignals = false;
            console.log(`[Python Call] End of signals section`);
            continue;
          }
          
          if (parsingSignals && line.trim()) {
            console.log(`[Python Call] Parsing signal line:`, line);
            try {
              // Expected format: "Signal 1: {'signal_type': 'CUS', 'bar_index': 5, ...}"
              const match = line.match(/Signal \d+: ({.+})/);
              if (match && match[1]) {
                // Parse the Python dict-like string to JSON
                const signalStr = match[1]
                  .replace(/'/g, '"')  // Replace single quotes with double quotes
                  .replace(/True/g, 'true')
                  .replace(/False/g, 'false')
                  .replace(/None/g, 'null');
                  
                const signal = JSON.parse(signalStr);
                signals.push(signal);
                console.log(`[Python Call] Parsed signal:`, signal);
              }
            } catch (parseError) {
              console.warn('[Python Call] Failed to parse signal line:', line, parseError);
            }
          }
        }
        
        console.log(`[Python Call] Successfully parsed ${signals.length} signals`);
        resolve(signals);
        
      } catch (error) {
        console.error('[Python Call] Failed to parse output:', error);
        console.log('[Python Call] Raw stdout:', stdout);
        reject(new Error(`Failed to parse Python output: ${error}`));
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('[Python Call] Process error:', error);
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });

    // Send input data to Python script via stdin
    pythonProcess.stdin.write(JSON.stringify(input));
    pythonProcess.stdin.end();
  });
} 