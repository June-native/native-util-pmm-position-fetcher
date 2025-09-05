import { ethers } from 'ethers';
import { getChainConfig, isValidChainId } from './config.js';
import { Multicall3, createContractCall, decodeResults } from './multicall.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load ABI files
const NativeLPTokenABI = JSON.parse(readFileSync(join(__dirname, 'abi', 'NativeLPToken.json'), 'utf8'));
const CreditVaultABI = JSON.parse(readFileSync(join(__dirname, 'abi', 'CreditVault.json'), 'utf8'));

/**
 * PMM Position Fetcher with multichain support
 */
export class PMMPositionFetcher {
  constructor() {
    this.providers = new Map();
    this.contracts = new Map();
    this.multicalls = new Map();
  }

  /**
   * Get or create provider for a specific chain
   */
  async getProvider(chainId) {
    if (!isValidChainId(chainId)) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    if (this.providers.has(chainId)) {
      return this.providers.get(chainId);
    }

    const config = getChainConfig(chainId);
    
    // Create provider with timeout and retry configuration
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
      polling: false, // Disable automatic polling
      staticNetwork: true, // Use static network detection
      batchMaxCount: 1, // Disable batching to prevent retry issues
      batchStallTime: 0, // Disable batch stalling
      batchMaxSize: 1 // Disable batch size limits
    });
    
    // Test connection with timeout
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );
      
      const blockNumber = await Promise.race([
        provider.getBlockNumber(),
        timeoutPromise
      ]);
      
      console.log(`✅ Connected to ${config.name} (Chain ID: ${chainId}) - Block: ${blockNumber}`);
    } catch (error) {
      console.error(`❌ Failed to connect to ${config.name}:`, error.message);
      throw error;
    }

    this.providers.set(chainId, provider);
    return provider;
  }

  /**
   * Get or create Multicall3 instance for a specific chain
   */
  async getMulticall(chainId, debug = false) {
    const cacheKey = `${chainId}-${debug}`;
    if (this.multicalls.has(cacheKey)) {
      return this.multicalls.get(cacheKey);
    }

    const provider = await this.getProvider(chainId);
    const config = getChainConfig(chainId);
    
    if (!config.multicall3Address) {
      throw new Error(`Multicall3 address not configured for chain ${chainId}`);
    }

    const multicall = new Multicall3(provider, config.multicall3Address, debug);
    this.multicalls.set(cacheKey, multicall);
    return multicall;
  }

  /**
   * Clean up all providers to prevent retry loops
   */
  cleanup() {
    for (const [chainId, provider] of this.providers) {
      try {
        // Remove any listeners and cleanup
        provider.removeAllListeners();
        // Destroy the provider if it has a destroy method
        if (typeof provider.destroy === 'function') {
          provider.destroy();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    this.providers.clear();
    this.contracts.clear();
    this.multicalls.clear();
  }

  /**
   * Get CreditVault contract for a specific chain
   */
  async getCreditVaultContract(chainId) {
    const cacheKey = `${chainId}-creditVault`;
    
    if (this.contracts.has(cacheKey)) {
      return this.contracts.get(cacheKey);
    }

    const provider = await this.getProvider(chainId);
    const config = getChainConfig(chainId);
    
    if (config.creditVaultAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error(`CreditVault address not configured for chain ${chainId}`);
    }

    const contract = new ethers.Contract(
      config.creditVaultAddress,
      CreditVaultABI,
      provider
    );

    this.contracts.set(cacheKey, contract);
    return contract;
  }

  /**
   * Get NativeLPToken contract
   */
  getNativeLPTokenContract(provider, lpTokenAddress) {
    return new ethers.Contract(
      lpTokenAddress,
      NativeLPTokenABI,
      provider
    );
  }

  /**
   * Fetch all LP tokens from CreditVault (fallback to individual calls)
   */
  async getAllLPTokens(chainId, blockNumber = null, debug = false) {
    if (debug) console.log(`Fetching all LP tokens for chain ${chainId}...`);
    
    const creditVault = await this.getCreditVaultContract(chainId);
    
    try {
      const lpTokens = [];
      let index = 0;
      let foundTokens = 0;
      
      if (debug) console.log(`Fetching LP tokens by index until revert...`);
      
      // Loop through indices until we get a revert (indicating end of array)
      while (true) {
        try {
          const lpTokenAddress = await creditVault.allLPTokens(index, { blockTag: blockNumber });
          
          // Check if we got a valid address (not zero address)
          if (lpTokenAddress && lpTokenAddress !== ethers.ZeroAddress) {
            lpTokens.push(lpTokenAddress);
            foundTokens++;
            if (debug) console.log(`  ${foundTokens}: ${lpTokenAddress}`);
          } else {
            // Zero address indicates end of array
            break;
          }
          
          index++;
          
          // Safety check to prevent infinite loops
          if (index > 1000) {
            if (debug) console.warn(`Reached safety limit of 1000 tokens, stopping`);
            break;
          }
        } catch (error) {
          // Revert indicates end of array or invalid index
          if (error.message.includes('revert') || error.message.includes('execution reverted')) {
            if (debug) console.log(`Reached end of LP tokens array at index ${index}`);
            break;
          } else {
            if (debug) console.warn(`Error at index ${index}:`, error.message);
            break;
          }
        }
      }
      
      if (debug) console.log(`Found ${foundTokens} LP tokens`);
      return lpTokens;
    } catch (error) {
      console.error(`Error fetching LP tokens:`, error.message);
      throw error;
    }
  }

  /**
   * Get underlying token address, decimals, and symbol for an LP token
   */
  async getUnderlyingToken(chainId, lpTokenAddress, blockNumber = null) {
    try {
      const provider = await this.getProvider(chainId);
      const lpTokenContract = this.getNativeLPTokenContract(provider, lpTokenAddress);
      
      const [underlyingAddress, decimals, symbol] = await Promise.all([
        lpTokenContract.underlying({ blockTag: blockNumber }),
        lpTokenContract.decimals({ blockTag: blockNumber }),
        lpTokenContract.symbol({ blockTag: blockNumber })
      ]);
      
      return {
        address: underlyingAddress,
        decimals: Number(decimals),
        symbol: symbol
      };
    } catch (error) {
      console.warn(`⚠️  Failed to get underlying token for ${lpTokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Batch fetch underlying tokens, decimals, and symbols for multiple LP tokens
   */
  async batchGetUnderlyingTokens(chainId, lpTokenAddresses, blockNumber = null, debug = false) {
    if (debug) console.log(`Batch fetching underlying tokens for ${lpTokenAddresses.length} LP tokens...`);
    
    const multicall = await this.getMulticall(chainId, debug);
    const batchSize = 10; // Smaller batch size to avoid RPC limits
    const tokenData = [];
    
    // Process in smaller batches
    for (let i = 0; i < lpTokenAddresses.length; i += batchSize) {
      const batch = lpTokenAddresses.slice(i, i + batchSize);
      if (debug) console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(lpTokenAddresses.length / batchSize)}: ${batch.length} tokens`);
      
      const batchCalls = [];
      
      // Create calls for underlying(), decimals(), and symbol() for each LP token in this batch
      for (const lpTokenAddress of batch) {
        batchCalls.push(createContractCall(
          lpTokenAddress,
          NativeLPTokenABI,
          'underlying',
          [],
          debug
        ));
        batchCalls.push(createContractCall(
          lpTokenAddress,
          NativeLPTokenABI,
          'decimals',
          [],
          debug
        ));
        batchCalls.push(createContractCall(
          lpTokenAddress,
          NativeLPTokenABI,
          'symbol',
          [],
          debug
        ));
      }
      
      try {
        const results = await multicall.batchCallWithRetry(batchCalls, 1, blockNumber);
        
        // Process results in triplets (underlying, decimals, symbol)
        for (let j = 0; j < batch.length; j++) {
          const lpTokenAddress = batch[j];
          const underlyingResult = results[j * 3];
          const decimalsResult = results[j * 3 + 1];
          const symbolResult = results[j * 3 + 2];
          
          if (underlyingResult.success && decimalsResult.success && symbolResult.success) {
            try {
              // Decode the raw bytes using the contract ABI
              const underlyingAddress = ethers.AbiCoder.defaultAbiCoder().decode(['address'], underlyingResult.data)[0];
              const decimals = Number(ethers.AbiCoder.defaultAbiCoder().decode(['uint8'], decimalsResult.data)[0]);
              const symbol = ethers.AbiCoder.defaultAbiCoder().decode(['string'], symbolResult.data)[0];
              
              if (underlyingAddress && underlyingAddress !== ethers.ZeroAddress) {
                tokenData.push({
                  lpTokenAddress,
                  underlyingAddress,
                  decimals,
                  symbol,
                  isLPToken: true
                });
                console.log(`    ${i + j + 1}/${lpTokenAddresses.length}: ${underlyingAddress} (${symbol}, ${decimals} decimals)`);
              } else {
                // Fallback to LP token itself
                tokenData.push({
                  lpTokenAddress,
                  underlyingAddress: lpTokenAddress,
                  decimals: 18,
                  symbol: 'LP',
                  isLPToken: false
                });
                console.log(`    ${i + j + 1}/${lpTokenAddresses.length}: Using LP token as underlying (LP, 18 decimals fallback)`);
              }
            } catch (decodeError) {
              console.warn(`⚠️  Failed to decode token ${i + j + 1}:`, decodeError.message);
              tokenData.push({
                lpTokenAddress,
                underlyingAddress: lpTokenAddress,
                decimals: 18,
                symbol: 'LP',
                isLPToken: false
              });
            }
          } else {
            console.warn(`⚠️  Failed to fetch data for token ${i + j + 1}, using fallback`);
            tokenData.push({
              lpTokenAddress,
              underlyingAddress: lpTokenAddress,
              decimals: 18,
              symbol: 'LP',
              isLPToken: false
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️  Batch ${Math.floor(i / batchSize) + 1} failed, falling back to individual calls:`, error.message);
        
        // Fallback to individual calls for this batch
        for (const lpTokenAddress of batch) {
          try {
            const underlyingData = await this.getUnderlyingToken(chainId, lpTokenAddress, blockNumber);
            
            if (underlyingData && underlyingData.address !== ethers.ZeroAddress) {
              tokenData.push({
                lpTokenAddress,
                underlyingAddress: underlyingData.address,
                decimals: underlyingData.decimals,
                symbol: underlyingData.symbol,
                isLPToken: true
              });
              console.log(`    ${i + batch.indexOf(lpTokenAddress) + 1}/${lpTokenAddresses.length}: ${underlyingData.address} (${underlyingData.symbol}, ${underlyingData.decimals} decimals)`);
            } else {
              tokenData.push({
                lpTokenAddress,
                underlyingAddress: lpTokenAddress,
                decimals: 18,
                symbol: 'LP',
                isLPToken: false
              });
              console.log(`    ${i + batch.indexOf(lpTokenAddress) + 1}/${lpTokenAddresses.length}: Using LP token as underlying (LP, 18 decimals fallback)`);
            }
          } catch (individualError) {
            console.warn(`⚠️  Individual call failed for ${lpTokenAddress}:`, individualError.message);
            tokenData.push({
              lpTokenAddress,
              underlyingAddress: lpTokenAddress,
              decimals: 18,
              symbol: 'LP',
              isLPToken: false
            });
          }
        }
      }
    }
    
    return tokenData;
  }

  /**
   * Get position amount for a specific token and trader
   */
  async getPosition(chainId, traderAddress, tokenAddress, blockNumber = null) {
    try {
      const creditVault = await this.getCreditVaultContract(chainId);
      
      const position = await creditVault.positions(traderAddress, tokenAddress, { blockTag: blockNumber });
      return position;
    } catch (error) {
      console.warn(`⚠️  Failed to get position for trader ${traderAddress}, token ${tokenAddress}:`, error.message);
      return BigInt(0);
    }
  }

  /**
   * Batch fetch positions for multiple tokens
   */
  async batchGetPositions(chainId, traderAddress, tokenAddresses, blockNumber = null, debug = false) {
    if (debug) console.log(`Batch fetching positions for ${tokenAddresses.length} tokens...`);
    
    const creditVault = await this.getCreditVaultContract(chainId);
    const multicall = await this.getMulticall(chainId, debug);
    const batchSize = 20; // Larger batch size for positions as they're simpler calls
    const positions = [];
    
    // Process in smaller batches
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      if (debug) console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tokenAddresses.length / batchSize)}: ${batch.length} tokens`);
      
      const batchCalls = [];
      
      // Create calls for positions() for each token in this batch
      for (const tokenAddress of batch) {
        batchCalls.push(createContractCall(
          creditVault.target,
          CreditVaultABI,
          'positions',
          [traderAddress, tokenAddress],
          debug
        ));
      }
      
      try {
        const results = await multicall.batchCallWithRetry(batchCalls, 1, blockNumber);
        
        for (let j = 0; j < batch.length; j++) {
          const tokenAddress = batch[j];
          const result = results[j];
          
          if (result.success) {
            try {
              // Decode the raw bytes using the contract ABI
              const position = ethers.AbiCoder.defaultAbiCoder().decode(['int256'], result.data)[0];
              positions.push({
                tokenAddress,
                position: position.toString(),
                success: true
              });
              
              if (position !== BigInt(0)) {
                console.log(`    ${i + j + 1}/${tokenAddresses.length}: ${tokenAddress} → Position: ${position.toString()}`);
              } else {
                console.log(`    ${i + j + 1}/${tokenAddresses.length}: ${tokenAddress} → No position`);
              }
            } catch (decodeError) {
              console.warn(`⚠️  Failed to decode position for token ${i + j + 1}:`, decodeError.message);
              positions.push({
                tokenAddress,
                position: '0',
                success: false,
                error: decodeError.message
              });
            }
          } else {
            console.warn(`⚠️  Failed to fetch position for token ${i + j + 1}:`, result.error || 'Unknown error');
            positions.push({
              tokenAddress,
              position: '0',
              success: false,
              error: result.error || 'Call failed'
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️  Batch ${Math.floor(i / batchSize) + 1} failed, falling back to individual calls:`, error.message);
        
        // Fallback to individual calls for this batch
        for (const tokenAddress of batch) {
          try {
            const position = await this.getPosition(chainId, traderAddress, tokenAddress, blockNumber);
            positions.push({
              tokenAddress,
              position: position.toString(),
              success: true
            });
            
            if (position !== BigInt(0)) {
              console.log(`    ${i + batch.indexOf(tokenAddress) + 1}/${tokenAddresses.length}: ${tokenAddress} → Position: ${position.toString()}`);
            } else {
              console.log(`    ${i + batch.indexOf(tokenAddress) + 1}/${tokenAddresses.length}: ${tokenAddress} → No position`);
            }
          } catch (individualError) {
            console.warn(`⚠️  Individual call failed for ${tokenAddress}:`, individualError.message);
            positions.push({
              tokenAddress,
              position: '0',
              success: false,
              error: individualError.message
            });
          }
        }
      }
    }
    
    return positions;
  }

  /**
   * Main function to list PMM positions
   * @param {string} pmmAddress - The PMM trader address
   * @param {number} chainId - The chain ID
   * @param {number} targetBlock - The target block number (optional, defaults to latest)
   * @returns {Object} Position data for all tokens
   */
  async listPmmPositions(pmmAddress, chainId, targetBlock = null, debug = false) {
    if (debug) {
      console.log(`Starting PMM position fetch...`);
      console.log(`   PMM Address: ${pmmAddress}`);
      console.log(`   Chain ID: ${chainId}`);
      console.log(`   Target Block: ${targetBlock || 'latest'}`);
      console.log('');
    }

    // Validate inputs
    if (!ethers.isAddress(pmmAddress)) {
      throw new Error(`Invalid PMM address: ${pmmAddress}`);
    }

    if (!isValidChainId(chainId)) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    const config = getChainConfig(chainId);
    const startTime = Date.now();

    try {
      // Step 1: Get all LP tokens
      if (debug) console.log('Step 1: Fetching all LP tokens...');
      const lpTokens = await this.getAllLPTokens(chainId, targetBlock, debug);
      
      if (lpTokens.length === 0) {
        if (debug) console.log('No LP tokens found');
        return {
          chainId,
          chainName: config.name,
          pmmAddress,
          targetBlock: targetBlock || 'latest',
          positions: [],
          summary: {
            totalTokens: 0,
            tokensWithPositions: 0,
            fetchTime: Date.now() - startTime
          }
        };
      }

      // Step 2: Get underlying tokens for each LP using multicall
      if (debug) console.log('\nStep 2: Resolving underlying tokens using multicall...');
      const tokenData = await this.batchGetUnderlyingTokens(chainId, lpTokens, targetBlock, debug);

      // Step 3: Get positions for each token using multicall
      if (debug) console.log('\nStep 3: Fetching positions using multicall...');
      const underlyingAddresses = tokenData.map(t => t.underlyingAddress);
      const positionResults = await this.batchGetPositions(chainId, pmmAddress, underlyingAddresses, targetBlock, debug);
      
      const positions = [];

      for (let i = 0; i < tokenData.length; i++) {
        const { lpTokenAddress, underlyingAddress, decimals, symbol, isLPToken } = tokenData[i];
        const positionResult = positionResults[i];
        
        if (debug) console.log(`  ${i + 1}/${tokenData.length}: ${underlyingAddress} (${symbol})`);
        
        if (positionResult.success && positionResult.position !== '0') {
          const position = BigInt(positionResult.position);
          const positionData = {
            tokenAddress: underlyingAddress,
            tokenSymbol: symbol,
            lpTokenAddress: isLPToken ? lpTokenAddress : null,
            position: position.toString(),
            positionFormatted: ethers.formatUnits(position, decimals), // Use actual token decimals
            decimals: decimals
          };
          
          positions.push(positionData);
          
          if (debug) console.log(`    → Position: ${ethers.formatUnits(position, decimals)} ${symbol}`);
        } else {
          if (debug) console.log(`    → No position`);
        }
      }

      const endTime = Date.now();
      const fetchTime = endTime - startTime;

      if (debug) {
        console.log('\nPosition fetch completed!');
        console.log(`   Total tokens checked: ${tokenData.length}`);
        console.log(`   Tokens with positions: ${positions.length}`);
        console.log(`   Fetch time: ${fetchTime}ms`);
      }

      return {
        chainId,
        chainName: config.name,
        pmmAddress,
        targetBlock: targetBlock || 'latest',
        positions,
        summary: {
          totalTokens: tokenData.length,
          tokensWithPositions: positions.length,
          fetchTime
        }
      };

    } catch (error) {
      console.error(`❌ Error fetching PMM positions:`, error.message);
      throw error;
    }
  }

  /**
   * Get current block number for a chain
   */
  async getCurrentBlock(chainId) {
    const provider = await this.getProvider(chainId);
    return await provider.getBlockNumber();
  }

  /**
   * Get network information for a chain
   */
  async getNetworkInfo(chainId) {
    const provider = await this.getProvider(chainId);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    
    return {
      chainId: Number(network.chainId),
      name: network.name,
      blockNumber,
      provider: provider.connection?.url || 'unknown'
    };
  }
}
