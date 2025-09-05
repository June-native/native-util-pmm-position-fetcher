import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load Multicall3 ABI
const Multicall3ABI = JSON.parse(readFileSync(join(__dirname, 'abi', 'Multicall3.json'), 'utf8'));

/**
 * Multicall3 utility for batch contract calls
 */
export class Multicall3 {
  constructor(provider, multicall3Address, debug = false) {
    this.provider = provider;
    this.multicallAddress = ethers.getAddress(multicall3Address); // Ensure checksummed address
    this.contract = new ethers.Contract(multicall3Address, Multicall3ABI, provider);
    this.debug = debug;
  }

  /**
   * Create a call object for multicall
   */
  createCall(target, callData) {
    return {
      target,
      callData
    };
  }

  /**
   * Execute multiple calls in a single transaction
   */
  async aggregate(calls, blockNumber = null) {
    try {
      const options = blockNumber ? { blockTag: blockNumber } : {};
      const result = await this.contract.aggregate.staticCall(calls, { ...options, value: 0 });
      return result;
    } catch (error) {
      console.error('Multicall aggregate failed:', error.message);
      throw error;
    }
  }

  /**
   * Execute multiple calls with individual success/failure tracking
   */
  async aggregate3(calls, blockNumber = null) {
    try {
      const options = blockNumber ? { blockTag: blockNumber } : {};
      
      // Debug logging (only if enabled)
      if (this.debug) {
        console.log('Multicall3 Debug Info:');
        console.log('  Target Address:', this.multicallAddress);
        console.log('  Number of calls:', calls.length);
        console.log('  Block Number:', blockNumber || 'latest');
        
        // Log first few calls for debugging
        for (let i = 0; i < Math.min(3, calls.length); i++) {
          console.log(`  Call ${i + 1}:`);
          console.log(`    Target: ${calls[i].target}`);
          console.log(`    AllowFailure: ${calls[i].allowFailure}`);
          console.log(`    CallData: ${calls[i].callData}`);
          console.log(`    Full call object:`, JSON.stringify(calls[i], null, 4));
        }
        if (calls.length > 3) {
          console.log(`  ... and ${calls.length - 3} more calls`);
        }
      }
      
      const result = await this.contract.aggregate3.staticCall(calls, { ...options, value: 0 });
      return result;
    } catch (error) {
      console.error('Multicall aggregate3 failed:', error.message);
      console.error('Error details:', error);
      throw error;
    }
  }

  /**
   * Batch call multiple contract functions
   */
  async batchCall(contractCalls, blockNumber = null) {
    // Pass the calls directly to aggregate3 without recreating them
    const results = await this.aggregate3(contractCalls, blockNumber);
    
    return results.map((result, index) => ({
      success: result.success,
      data: result.returnData,
      call: contractCalls[index]
    }));
  }

  /**
   * Batch call with automatic retry for failed calls
   */
  async batchCallWithRetry(contractCalls, maxRetries = 2, blockNumber = null) {
    let results = await this.batchCall(contractCalls, blockNumber);
    let retryCount = 0;

    while (retryCount < maxRetries) {
      const failedCalls = results
        .map((result, index) => ({ result, index, call: contractCalls[index] }))
        .filter(({ result }) => !result.success);

      if (failedCalls.length === 0) {
        break;
      }

      console.log(`🔄 Retrying ${failedCalls.length} failed calls (attempt ${retryCount + 1}/${maxRetries})`);
      
      const retryCalls = failedCalls.map(({ call }) => call);
      const retryResults = await this.batchCall(retryCalls, blockNumber);

      // Update results with retry data
      failedCalls.forEach(({ index }, retryIndex) => {
        results[index] = retryResults[retryIndex];
      });

      retryCount++;
    }

    return results;
  }

  /**
   * Get current block number
   */
  async getCurrentBlock() {
    try {
      return await this.contract.getBlockNumber();
    } catch (error) {
      console.error('Failed to get current block:', error.message);
      throw error;
    }
  }
}

/**
 * Helper function to create contract call data
 */
export function createContractCall(target, abi, method, params = [], debug = false) {
  const contract = new ethers.Contract(target, abi, null);
  const callData = contract.interface.encodeFunctionData(method, params);
  
  // Debug logging
  if (debug) {
    console.log(`Creating contract call:`);
    console.log(`  Target: ${target}`);
    console.log(`  Method: ${method}`);
    console.log(`  Params:`, params);
    console.log(`  CallData: ${callData}`);
  }
  
  return {
    target,
    allowFailure: true, // Required for aggregate3
    callData
  };
}

/**
 * Helper function to decode multicall results
 */
export function decodeResults(results, abi, method) {
  const contract = new ethers.Contract(ethers.ZeroAddress, abi, null);
  const decoder = contract.interface.getFunction(method);

  return results.map(result => {
    if (!result.success) {
      return {
        success: false,
        error: 'Call failed',
        data: null
      };
    }

    try {
      const decoded = decoder.decode(result.data);
      return {
        success: true,
        data: decoded,
        raw: result.data
      };
    } catch (error) {
      return {
        success: false,
        error: `Decode failed: ${error.message}`,
        data: null,
        raw: result.data
      };
    }
  });
}
