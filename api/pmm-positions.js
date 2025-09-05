import { ethers } from 'ethers';

// Chain configurations
const CHAIN_CONFIGS = {
  1: {
    name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    creditVaultAddress: '0xe3D41d19564922C9952f692C5Dd0563030f5f2EF',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  },
  56: {
    name: 'BSC',
    rpcUrl: 'https://bsc.llamarpc.com',
    creditVaultAddress: '0xBA8dB0CAf781cAc69b6acf6C848aC148264Cc05d',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  },
  42161: {
    name: 'Arbitrum',
    rpcUrl: 'https://arb.llamarpc.com',
    creditVaultAddress: '0xbA1cf8A63227b46575AF823BEB4d83D1025eff09',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  },
  8453: {
    name: 'Base',
    rpcUrl: 'https://base.llamarpc.com',
    creditVaultAddress: '0x74a4Cd023e5AfB88369E3f22b02440F2614a1367',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11'
  }
};

// Contract ABIs
const CREDIT_VAULT_ABI = [
  "function allLPTokens(uint256 index) view returns (address)",
  "function positions(address trader, address token) view returns (int256)"
];

const NATIVE_LP_TOKEN_ABI = [
  "function underlying() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"
];

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pmmAddress, chainId, targetBlock, debug } = req.body;

    if (!pmmAddress || !chainId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (!ethers.isAddress(pmmAddress)) {
      return res.status(400).json({ error: 'Invalid PMM address' });
    }

    const config = CHAIN_CONFIGS[chainId];
    if (!config) {
      return res.status(400).json({ error: 'Unsupported chain ID' });
    }

    // Create provider
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, chainId, {
      polling: false,
      staticNetwork: true,
      batchMaxCount: 1,
      batchStallTime: 0,
      batchMaxSize: 1
    });

    // Create contracts
    const creditVault = new ethers.Contract(config.creditVaultAddress, CREDIT_VAULT_ABI, provider);
    const multicall = new ethers.Contract(config.multicall3Address, MULTICALL3_ABI, provider);

    const startTime = Date.now();

    // Get all LP tokens
    const lpTokens = [];
    let index = 0;
    
    while (true) {
      try {
        const lpTokenAddress = await creditVault.allLPTokens(index, { blockTag: targetBlock });
        
        if (lpTokenAddress && lpTokenAddress !== ethers.ZeroAddress) {
          lpTokens.push(lpTokenAddress);
          index++;
          
          if (index > 1000) break; // Safety limit
        } else {
          break;
        }
      } catch (error) {
        if (error.message.includes('revert') || error.message.includes('execution reverted')) {
          break;
        }
        throw error;
      }
    }

    if (lpTokens.length === 0) {
      return res.json({
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
      });
    }

    // Get underlying tokens using multicall
    const tokenData = [];
    const batchSize = 10;
    
    for (let i = 0; i < lpTokens.length; i += batchSize) {
      const batch = lpTokens.slice(i, i + batchSize);
      const batchCalls = [];
      
      for (const lpTokenAddress of batch) {
        const lpTokenContract = new ethers.Contract(lpTokenAddress, NATIVE_LP_TOKEN_ABI, null);
        
        batchCalls.push({
          target: lpTokenAddress,
          allowFailure: true,
          callData: lpTokenContract.interface.encodeFunctionData('underlying', [])
        });
        batchCalls.push({
          target: lpTokenAddress,
          allowFailure: true,
          callData: lpTokenContract.interface.encodeFunctionData('decimals', [])
        });
        batchCalls.push({
          target: lpTokenAddress,
          allowFailure: true,
          callData: lpTokenContract.interface.encodeFunctionData('symbol', [])
        });
      }
      
      try {
        const results = await multicall.aggregate3(batchCalls, { blockTag: targetBlock });
        
        for (let j = 0; j < batch.length; j++) {
          const lpTokenAddress = batch[j];
          const underlyingResult = results[j * 3];
          const decimalsResult = results[j * 3 + 1];
          const symbolResult = results[j * 3 + 2];

          if (underlyingResult.success && decimalsResult.success && symbolResult.success) {
            try {
              const underlyingAddress = ethers.AbiCoder.defaultAbiCoder().decode(['address'], underlyingResult.returnData)[0];
              const decimals = Number(ethers.AbiCoder.defaultAbiCoder().decode(['uint8'], decimalsResult.returnData)[0]);
              const symbol = ethers.AbiCoder.defaultAbiCoder().decode(['string'], symbolResult.returnData)[0];

              if (underlyingAddress && underlyingAddress !== ethers.ZeroAddress) {
                tokenData.push({ lpTokenAddress, underlyingAddress, decimals, symbol, isLPToken: true });
              } else {
                tokenData.push({ lpTokenAddress, underlyingAddress: lpTokenAddress, decimals: 18, symbol: 'LP', isLPToken: false });
              }
            } catch (decodeError) {
              tokenData.push({ lpTokenAddress, underlyingAddress: lpTokenAddress, decimals: 18, symbol: 'LP', isLPToken: false });
            }
          } else {
            tokenData.push({ lpTokenAddress, underlyingAddress: lpTokenAddress, decimals: 18, symbol: 'LP', isLPToken: false });
          }
        }
      } catch (error) {
        // Fallback to individual calls
        for (const lpTokenAddress of batch) {
          try {
            const lpTokenContract = new ethers.Contract(lpTokenAddress, NATIVE_LP_TOKEN_ABI, provider);
            const underlyingAddress = await lpTokenContract.underlying({ blockTag: targetBlock });
            const decimals = await lpTokenContract.decimals({ blockTag: targetBlock });
            const symbol = await lpTokenContract.symbol({ blockTag: targetBlock });

            if (underlyingAddress && underlyingAddress !== ethers.ZeroAddress) {
              tokenData.push({ lpTokenAddress, underlyingAddress, decimals: Number(decimals), symbol, isLPToken: true });
            } else {
              tokenData.push({ lpTokenAddress, underlyingAddress: lpTokenAddress, decimals: 18, symbol: 'LP', isLPToken: false });
            }
          } catch (error) {
            tokenData.push({ lpTokenAddress, underlyingAddress: lpTokenAddress, decimals: 18, symbol: 'LP', isLPToken: false });
          }
        }
      }
    }

    // Get positions using multicall
    const underlyingAddresses = tokenData.map(t => t.underlyingAddress);
    const positions = [];
    const positionBatchSize = 20;
    
    for (let i = 0; i < underlyingAddresses.length; i += positionBatchSize) {
      const batch = underlyingAddresses.slice(i, i + positionBatchSize);
      const batchCalls = [];
      
      for (const tokenAddress of batch) {
        batchCalls.push({
          target: config.creditVaultAddress,
          allowFailure: true,
          callData: creditVault.interface.encodeFunctionData('positions', [pmmAddress, tokenAddress])
        });
      }
      
      try {
        const results = await multicall.aggregate3(batchCalls, { blockTag: targetBlock });
        
        for (let j = 0; j < batch.length; j++) {
          const tokenAddress = batch[j];
          const result = results[j];
          
          if (result.success) {
            try {
              const position = ethers.AbiCoder.defaultAbiCoder().decode(['int256'], result.returnData)[0];
              positions.push({
                tokenAddress,
                position: position.toString(),
                success: true
              });
            } catch (decodeError) {
              positions.push({
                tokenAddress,
                position: '0',
                success: false
              });
            }
          } else {
            positions.push({
              tokenAddress,
              position: '0',
              success: false
            });
          }
        }
      } catch (error) {
        // Fallback to individual calls
        for (const tokenAddress of batch) {
          try {
            const position = await creditVault.positions(pmmAddress, tokenAddress, { blockTag: targetBlock });
            positions.push({
              tokenAddress,
              position: position.toString(),
              success: true
            });
          } catch (error) {
            positions.push({
              tokenAddress,
              position: '0',
              success: false
            });
          }
        }
      }
    }

    // Process results
    const finalPositions = [];
    
    for (let i = 0; i < tokenData.length; i++) {
      const { lpTokenAddress, underlyingAddress, decimals, symbol, isLPToken } = tokenData[i];
      const positionResult = positions[i];
      
      if (positionResult.success && positionResult.position !== '0') {
        const position = BigInt(positionResult.position);
        const positionData = {
          tokenAddress: underlyingAddress,
          tokenSymbol: symbol,
          lpTokenAddress: isLPToken ? lpTokenAddress : null,
          position: position.toString(),
          positionFormatted: ethers.formatUnits(position, decimals),
          decimals: decimals
        };
        
        finalPositions.push(positionData);
      }
    }

    const fetchTime = Date.now() - startTime;

    res.json({
      chainId,
      chainName: config.name,
      pmmAddress,
      targetBlock: targetBlock || 'latest',
      positions: finalPositions,
      summary: {
        totalTokens: tokenData.length,
        tokensWithPositions: finalPositions.length,
        fetchTime
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
