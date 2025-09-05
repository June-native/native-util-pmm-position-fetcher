import { PMMPositionFetcher } from './pmmPositionFetcher.js';
import { SUPPORTED_CHAIN_IDS, getChainConfig } from './config.js';

/**
 * Test script to demonstrate PMM Position Fetcher functionality
 */
async function testPMMPositionFetcher() {
  console.log('Testing PMM Position Fetcher\n');

  const fetcher = new PMMPositionFetcher();

  try {
    // Test 1: Check network connections
    console.log('Test 1: Testing network connections...');
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      try {
        // Add timeout for each connection test
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 15000)
        );
        
        const networkInfo = await Promise.race([
          fetcher.getNetworkInfo(chainId),
          timeoutPromise
        ]);
        
        console.log(`${networkInfo.name} (${chainId}): Block ${networkInfo.blockNumber}`);
      } catch (error) {
        console.log(`Chain ${chainId}: ${error.message}`);
      }
    }
    console.log('');

    // Test 1.5: Show CreditVault addresses
    console.log('Test 1.5: CreditVault addresses configuration...');
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      const config = getChainConfig(chainId);
      console.log(`   ${config.name} (${chainId}): ${config.creditVaultAddress}`);
    }
    console.log('');

    // Test 2: Test with BSC (which should work with public RPC)
    console.log('Test 2: Testing PMM position fetch on BSC...');
    const testPmmAddress = '0x26a5652812905cc994009902c4b4dff950f96775'; // Real PMM address
    const chainId = 56; // BSC
    
    try {
      // Add timeout for position fetching test
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Position fetch timeout')), 60000)
      );
      
      const result = await Promise.race([
        fetcher.listPmmPositions(testPmmAddress, chainId),
        timeoutPromise
      ]);
      
      console.log('Position fetch completed successfully!');
      console.log('Results summary:');
      console.log(`   Chain: ${result.chainName} (${result.chainId})`);
      console.log(`   PMM Address: ${result.pmmAddress}`);
      console.log(`   Total tokens checked: ${result.summary.totalTokens}`);
      console.log(`   Tokens with positions: ${result.summary.tokensWithPositions}`);
      console.log(`   Fetch time: ${result.summary.fetchTime}ms`);
    } catch (error) {
      console.log(`Position fetch failed: ${error.message}`);
    }

    console.log('\nAll tests completed!');
    console.log('\nNext steps:');
    console.log('1. Configure your .env file with real RPC URLs and CreditVault addresses');
    console.log('2. Use the CLI tool: npm run cli <pmmAddress> <chainId>');
    console.log('3. Or use programmatically: new PMMPositionFetcher().listPmmPositions(...)');

  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    // Clean up providers to prevent retry loops
    console.log('\nCleaning up providers...');
    fetcher.cleanup();
    console.log('Cleanup completed!');
  }
}

// Run the test
testPMMPositionFetcher().then(() => {
  // Force exit after a short delay to ensure cleanup completes
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}).catch((error) => {
  console.error('Test script failed:', error);
  process.exit(1);
});
