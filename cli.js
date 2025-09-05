#!/usr/bin/env node

import { PMMPositionFetcher } from './pmmPositionFetcher.js';
import { getChainConfig, SUPPORTED_CHAIN_IDS } from './config.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * CLI tool for fetching PMM positions
 * Usage: node cli.js <pmmAddress> <chainId> [targetBlock] [debug]
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node cli.js <pmmAddress> <chainId> [targetBlock] [debug]');
    console.log('');
    console.log('Arguments:');
    console.log('  pmmAddress  - The PMM trader address');
    console.log('  chainId     - The chain ID (1=ETH, 56=BSC, 42161=ARB, 8453=BASE)');
    console.log('  targetBlock - Optional target block number (defaults to latest)');
    console.log('  debug       - Optional debug flag to show verbose output');
    console.log('');
    console.log('Examples:');
    console.log('  node cli.js 0x1234... 1');
    console.log('  node cli.js 0x1234... 1 18500000');
    console.log('  node cli.js 0x1234... 56 latest debug');
    process.exit(1);
  }

  const [pmmAddress, chainIdStr, targetBlockStr, debugFlag] = args;
  const chainId = parseInt(chainIdStr);
  const targetBlock = targetBlockStr === 'latest' || !targetBlockStr ? null : parseInt(targetBlockStr);
  const debug = debugFlag === 'debug';

  // Validate inputs
  if (!ethers.isAddress(pmmAddress)) {
    console.error('Invalid PMM address:', pmmAddress);
    process.exit(1);
  }

  if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
    console.error('Unsupported chain ID:', chainId);
    console.error('   Supported chains:', SUPPORTED_CHAIN_IDS.join(', '));
    process.exit(1);
  }

  try {
    if (debug) {
      console.log('PMM Position Fetcher CLI\n');
      console.log(`   PMM Address: ${pmmAddress}`);
      console.log(`   Chain ID: ${chainId}`);
      console.log(`   Target Block: ${targetBlock || 'latest'}`);
      console.log('');
    }

    const fetcher = new PMMPositionFetcher();
    const result = await fetcher.listPmmPositions(pmmAddress, chainId, targetBlock, debug);
    
    // Output results as JSON
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Import ethers for validation
import { ethers } from 'ethers';

// Run the CLI
main();
