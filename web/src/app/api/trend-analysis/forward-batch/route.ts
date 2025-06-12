import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { bars, contract_id, timeframe, start_bar_index, end_bar_index, debug = false } = body;

    if (!bars || !Array.isArray(bars)) {
      return NextResponse.json({ error: 'Bars array is required' }, { status: 400 });
    }

    if (!contract_id || !timeframe) {
      return NextResponse.json({ error: 'Contract ID and timeframe are required' }, { status: 400 });
    }

    // Define paths
    const projectRoot = path.join(process.cwd(), '..');
    const scriptPath = path.join(projectRoot, 'trend_analysis', 'trend_start_forward_batch.py');
    
    console.log(`[Forward Batch API] Processing ${end_bar_index - start_bar_index + 1} bars from ${start_bar_index} to ${end_bar_index} for ${contract_id} ${timeframe}`);

    // Create Python script arguments for batch processing
    const pythonArgs = [
      scriptPath,
      JSON.stringify({
        bars: bars,
        contract_id: contract_id,
        timeframe: timeframe,
        start_bar_index: start_bar_index,
        end_bar_index: end_bar_index,
        debug: debug
      })
    ];

    // Execute Python script with batch processing
    const result = await new Promise<any>((resolve, reject) => {
      console.log(`[Forward Batch API] Calling Python batch script at: ${scriptPath}`);
      console.log(`[Forward Batch API] Input data: ${bars.length} bars, processing batch ${start_bar_index}-${end_bar_index}`);
      
      const pythonProcess = spawn('python3', pythonArgs, {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONPATH: projectRoot }
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
        if (code !== 0) {
          console.error('[Forward Batch API] Python script error:', stderr);
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          // Parse the JSON response from Python
          const lines = stdout.trim().split('\n');
          const jsonOutput = lines[lines.length - 1]; // Last line should be JSON
          const result = JSON.parse(jsonOutput || '{}');
          
          console.log(`[Forward Batch API] Success! Found ${result.batch_signals?.length || 0} total signals for batch ${start_bar_index}-${end_bar_index}`);
          resolve(result);
        } catch (parseError) {
          console.error('[Forward Batch API] Failed to parse Python output:', parseError);
          console.error('[Forward Batch API] Raw stdout:', stdout);
          reject(new Error(`Failed to parse Python output: ${parseError}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('[Forward Batch API] Failed to start Python process:', error);
        reject(error);
      });
    });

    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // Return batch results
    return NextResponse.json({
      success: true,
      batch_signals: result.batch_signals || [],
      total_signals: result.total_signals || 0,
      processing_time_ms: processingTime,
      start_bar_index: start_bar_index,
      end_bar_index: end_bar_index,
      bars_processed: end_bar_index - start_bar_index + 1
    });

  } catch (error: any) {
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.error('[Forward Batch API] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      processing_time_ms: processingTime
    }, { status: 500 });
  }
} 