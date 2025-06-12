import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

interface TrendAnalysisRequest {
  bars: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  contract_id: string;
  timeframe: string;
  debug?: boolean;
}

interface TrendSignal {
  type: 'CUS' | 'CDS';
  timestamp: string;
  barIndex: number;
  price: number;
  contractId: string;
  timeframe: string;
}

export async function POST(request: Request) {
  try {
    const data: TrendAnalysisRequest = await request.json();
    
    // Validate input
    if (!data.bars || data.bars.length === 0) {
      return NextResponse.json(
        { error: 'No bars data provided' },
        { status: 400 }
      );
    }

    // Get project root directory (cwd is already the web folder when running Next.js)
    const projectRoot = path.resolve(process.cwd(), '..');
    const pythonScriptPath = path.join(projectRoot, 'src', 'strategies', 'trend_start_finder.py');
    
    console.log('Running trend analysis with Python script:', pythonScriptPath);
    console.log(`Script exists: ${fs.existsSync(pythonScriptPath)}`);
    console.log(`Analyzing ${data.bars.length} bars for ${data.contract_id} ${data.timeframe}`);

    // Call Python trend finder with proper environment
    const pythonProcess = spawn('python3', [pythonScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        PYTHONPATH: projectRoot // Set PYTHONPATH to project root so imports work
      },
      cwd: projectRoot // Set working directory to project root
    });

    // Send data to Python process
    const inputData = JSON.stringify({
      bars: data.bars,
      contract_id: data.contract_id,
      timeframe: data.timeframe,
      debug: data.debug || false
    });
    
    pythonProcess.stdin.write(inputData);
    pythonProcess.stdin.end();

    // Collect output and errors
    const output = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      pythonProcess.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Python process failed:', stderr);
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      pythonProcess.on('error', (err) => {
        console.error('Failed to start Python process:', err);
        reject(err);
      });
    });

    // Parse signals from Python output
    const signals = parseSignalsFromOutput(output, data.contract_id, data.timeframe);
    
    console.log(`Found ${signals.length} trend signals`);

    return NextResponse.json({
      success: true,
      signals,
      count: signals.length
    });

  } catch (error) {
    console.error('Error in trend analysis:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze trends' 
      },
      { status: 500 }
    );
  }
}

/**
 * Parse signals from Python script output
 */
function parseSignalsFromOutput(output: string, contractId: string, timeframe: string): TrendSignal[] {
  const signals: TrendSignal[] = [];
  
  try {
    // Split output into lines
    const lines = output.split('\n');
    let inSignalsSection = false;
    
    for (const line of lines) {
      // Look for signals section
      if (line.includes('--- Signals Found ---')) {
        inSignalsSection = true;
        continue;
      }
      
      if (line.includes('--- Debug Logs Collected ---')) {
        inSignalsSection = false;
        break;
      }
      
      if (inSignalsSection && line.startsWith('Signal')) {
        // Parse signal line
        // Format: "Signal 1: {'type': 'CUS', 'timestamp': '2023-01-01T10:00:00', ...}"
        const jsonMatch = line.match(/Signal \d+: (.+)/);
        if (jsonMatch) {
          try {
            // Replace single quotes with double quotes for valid JSON
            const jsonStr = jsonMatch[1]?.replace(/'/g, '"');
            if (!jsonStr) continue;
            const signalData = JSON.parse(jsonStr);
            
            // Map Python output to our TrendSignal interface
            const signalType = signalData.signal_type || signalData.type;
            if (signalType === 'uptrend_start') {
              signals.push({
                type: 'CUS',
                timestamp: signalData.bar_timestamp || signalData.timestamp,
                barIndex: signalData.bar_index || signalData.barIndex || signals.length + 1,
                price: signalData.bar_close || signalData.price || 0,
                contractId: contractId,
                timeframe: timeframe
              });
            } else if (signalType === 'downtrend_start') {
              signals.push({
                type: 'CDS',
                timestamp: signalData.bar_timestamp || signalData.timestamp,
                barIndex: signalData.bar_index || signalData.barIndex || signals.length + 1,
                price: signalData.bar_close || signalData.price || 0,
                contractId: contractId,
                timeframe: timeframe
              });
            }
          } catch (parseError) {
            console.warn('Failed to parse signal:', line, parseError);
          }
        }
      }
    }
    
    // If no signals found in structured format, return empty array
    if (signals.length === 0 && output.includes('No signals generated')) {
      console.log('No signals found in data');
    }
    
  } catch (error) {
    console.error('Error parsing signals:', error);
  }
  
  return signals;
}