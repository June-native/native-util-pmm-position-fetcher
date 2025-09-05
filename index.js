import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { PMMPositionFetcher } from './pmmPositionFetcher.js';
import { getChainConfig, SUPPORTED_CHAIN_IDS } from './config.js';

// Load environment variables
dotenv.config();

// Example usage function
async function exampleUsage() {
  console.log('PMM Position Fetcher - Example Usage\n');

  // Example parameters
  const pmmAddress = '0x26a5652812905cc994009902c4b4dff950f96775'; // Real PMM address
  const chainId = 1; // Ethereum mainnet
  const targetBlock = null; // Use latest block

  try {
    const fetcher = new PMMPositionFetcher();
    
    // Test connection to all supported chains
    console.log('Testing connections to supported chains...');
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      try {
        const networkInfo = await fetcher.getNetworkInfo(chainId);
        console.log(`${networkInfo.name} (${chainId}): Block ${networkInfo.blockNumber}`);
      } catch (error) {
        console.log(`Chain ${chainId}: ${error.message}`);
      }
    }
    console.log('');

    // Example: Fetch positions for a specific PMM address
    console.log('Example: Fetching PMM positions...');
    console.log(`   PMM Address: ${pmmAddress}`);
    console.log(`   Chain ID: ${chainId}`);
    console.log('');

    const result = await fetcher.listPmmPositions(pmmAddress, chainId, targetBlock);
    
    console.log('\nResults:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error in example usage:', error.message);
  }
}

// Main execution
async function main() {
  try {
    console.log('PMM Position Fetcher with Multichain Support\n');

    // Check if we have any configured RPC URLs
    const hasConfiguredRPC = SUPPORTED_CHAIN_IDS.some(chainId => {
      const config = getChainConfig(chainId);
      return !config.rpcUrl.includes('YOUR_PROJECT_ID');
    });

    if (!hasConfiguredRPC) {
      console.log('No RPC URLs configured. Please set up your .env file with RPC URLs.');
      console.log('\nRequired environment variables:');
      console.log('   ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID');
      console.log('   BSC_RPC_URL=https://bsc-dataseed.binance.org/');
      console.log('   ARB_RPC_URL=https://arb1.arbitrum.io/rpc');
      console.log('   BASE_RPC_URL=https://mainnet.base.org');
      console.log('\nCreditVault addresses (replace with actual addresses):');
      console.log('   ETH_CREDIT_VAULT_ADDRESS=0x...');
      console.log('   BSC_CREDIT_VAULT_ADDRESS=0x...');
      console.log('   ARB_CREDIT_VAULT_ADDRESS=0x...');
      console.log('   BASE_CREDIT_VAULT_ADDRESS=0x...');
      
      console.log('\nPMM Position Fetcher initialized successfully!');
      console.log('\nNext steps:');
      console.log('1. Configure your .env file with RPC URLs and CreditVault addresses');
      console.log('2. Get free RPC access from Infura, Alchemy, or QuickNode');
      console.log('3. Update the CreditVault addresses for each chain');
      console.log('4. Run the example usage or call listPmmPositions() directly');
      
      return;
    }

    // Run example usage
    await exampleUsage();

  } catch (error) {
    console.error('Error initializing PMM Position Fetcher:', error);
    process.exit(1);
  }
}

// Run the main function
main();
