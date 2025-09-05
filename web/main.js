// Import ethers for client-side use
import { ethers } from 'ethers';

// Chain configurations
const CHAIN_CONFIGS = {
  1: {
    name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    creditVaultAddress: '0xe3D41d19564922C9952f692C5Dd0563030f5f2EF',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    explorerUrl: 'https://etherscan.io'
  },
  56: {
    name: 'BSC',
    rpcUrl: 'https://bsc.llamarpc.com',
    creditVaultAddress: '0xBA8dB0CAf781cAc69b6acf6C848aC148264Cc05d',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    explorerUrl: 'https://bscscan.com'
  },
  42161: {
    name: 'Arbitrum',
    rpcUrl: 'https://arbitrum.gateway.tenderly.co',
    creditVaultAddress: '0xbA1cf8A63227b46575AF823BEB4d83D1025eff09',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    explorerUrl: 'https://arbiscan.io'
  },
  8453: {
    name: 'Base',
    rpcUrl: 'https://base.llamarpc.com',
    creditVaultAddress: '0x74a4Cd023e5AfB88369E3f22b02440F2614a1367',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    explorerUrl: 'https://basescan.org'
  }
};

// Contract ABIs (simplified for client-side)
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

class PMMPositionFetcher {
  constructor() {
    this.providers = new Map();
    this.multicalls = new Map();
  }

  async getProvider(chainId) {
    if (this.providers.has(chainId)) {
      return this.providers.get(chainId);
    }

    const config = CHAIN_CONFIGS[chainId];
    if (!config) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl, chainId, {
      polling: false,
      staticNetwork: true,
      batchMaxCount: 1,
      batchStallTime: 0,
      batchMaxSize: 1
    });

    this.providers.set(chainId, provider);
    return provider;
  }

  async getCreditVaultContract(chainId) {
    const provider = await this.getProvider(chainId);
    const config = CHAIN_CONFIGS[chainId];
    return new ethers.Contract(config.creditVaultAddress, CREDIT_VAULT_ABI, provider);
  }

  async getMulticall(chainId) {
    if (this.multicalls.has(chainId)) {
      return this.multicalls.get(chainId);
    }

    const provider = await this.getProvider(chainId);
    const config = CHAIN_CONFIGS[chainId];
    const multicall = new ethers.Contract(config.multicall3Address, MULTICALL3_ABI, provider);
    this.multicalls.set(chainId, multicall);
    return multicall;
  }

  async getAllLPTokens(chainId, blockNumber = null, debug = false) {
    if (debug) this.log(`Fetching all LP tokens for chain ${chainId}...`);
    
    const creditVault = await this.getCreditVaultContract(chainId);
    
    try {
      const lpTokens = [];
      let index = 0;
      let foundTokens = 0;
      
      if (debug) this.log(`Fetching LP tokens by index until revert...`);
      
      while (true) {
        try {
          const lpTokenAddress = await creditVault.allLPTokens(index, { blockTag: blockNumber });
          
          if (lpTokenAddress && lpTokenAddress !== ethers.ZeroAddress) {
            lpTokens.push(lpTokenAddress);
            foundTokens++;
            if (debug) this.log(`  ${foundTokens}: ${lpTokenAddress}`);
          } else {
            break;
          }
          
          index++;
          
          if (index > 1000) {
            if (debug) this.log(`Reached safety limit of 1000 tokens, stopping`);
            break;
          }
        } catch (error) {
          if (error.message.includes('revert') || error.message.includes('execution reverted')) {
            if (debug) this.log(`Reached end of LP tokens array at index ${index}`);
            break;
          } else {
            if (debug) this.log(`Error at index ${index}: ${error.message}`);
            break;
          }
        }
      }
      
      if (debug) this.log(`Found ${foundTokens} LP tokens`);
      return lpTokens;
    } catch (error) {
      this.log(`Error fetching LP tokens: ${error.message}`);
      throw error;
    }
  }

  async batchGetUnderlyingTokens(chainId, lpTokenAddresses, blockNumber = null, debug = false) {
    if (debug) this.log(`Batch fetching underlying tokens for ${lpTokenAddresses.length} LP tokens...`);
    
    const multicall = await this.getMulticall(chainId);
    const batchSize = 10;
    const tokenData = [];
    
    for (let i = 0; i < lpTokenAddresses.length; i += batchSize) {
      const batch = lpTokenAddresses.slice(i, i + batchSize);
      if (debug) this.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(lpTokenAddresses.length / batchSize)}: ${batch.length} tokens`);
      
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
        const results = await multicall.aggregate3.staticCall(batchCalls, { blockTag: blockNumber, value: 0 });
        
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
                if (debug) this.log(`    ${i + j + 1}/${lpTokenAddresses.length}: ${underlyingAddress} (${symbol}, ${decimals} decimals)`);
              } else {
                tokenData.push({ lpTokenAddress, underlyingAddress: lpTokenAddress, decimals: 18, symbol: 'LP', isLPToken: false });
                if (debug) this.log(`    ${i + j + 1}/${lpTokenAddresses.length}: Using LP token as underlying (LP, 18 decimals fallback)`);
              }
            } catch (decodeError) {
              this.log(`Failed to decode token ${i + j + 1}: ${decodeError.message}`);
              tokenData.push({ lpTokenAddress, underlyingAddress: lpTokenAddress, decimals: 18, symbol: 'LP', isLPToken: false });
            }
          } else {
            if (debug) this.log(`Failed to fetch data for token ${i + j + 1}, using fallback`);
            tokenData.push({ lpTokenAddress, underlyingAddress: lpTokenAddress, decimals: 18, symbol: 'LP', isLPToken: false });
          }
        }
      } catch (error) {
        this.log(`Batch ${Math.floor(i / batchSize) + 1} failed, falling back to individual calls: ${error.message}`);
        // Fallback to individual calls
        for (const lpTokenAddress of batch) {
          try {
            const lpTokenContract = new ethers.Contract(lpTokenAddress, NATIVE_LP_TOKEN_ABI, await this.getProvider(chainId));
            const underlyingAddress = await lpTokenContract.underlying({ blockTag: blockNumber });
            const decimals = await lpTokenContract.decimals({ blockTag: blockNumber });
            const symbol = await lpTokenContract.symbol({ blockTag: blockNumber });

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
    
    return tokenData;
  }

  async batchGetPositions(chainId, traderAddress, tokenAddresses, blockNumber = null, debug = false) {
    if (debug) this.log(`Batch fetching positions for ${tokenAddresses.length} tokens...`);
    
    const creditVault = await this.getCreditVaultContract(chainId);
    const multicall = await this.getMulticall(chainId);
    const batchSize = 20;
    const positions = [];
    
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      if (debug) this.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tokenAddresses.length / batchSize)}: ${batch.length} tokens`);
      
      const batchCalls = [];
      
      for (const tokenAddress of batch) {
        batchCalls.push({
          target: creditVault.target,
          allowFailure: true,
          callData: creditVault.interface.encodeFunctionData('positions', [traderAddress, tokenAddress])
        });
      }
      
      try {
        const results = await multicall.aggregate3.staticCall(batchCalls, { blockTag: blockNumber, value: 0 });
        
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
              this.log(`Failed to decode position for token ${tokenAddress}: ${decodeError.message}`);
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
        this.log(`Position batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`);
        // Fallback to individual calls
        for (const tokenAddress of batch) {
          try {
            const position = await creditVault.positions(traderAddress, tokenAddress, { blockTag: blockNumber });
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
    
    return positions;
  }

  async listPmmPositions(pmmAddress, chainId, targetBlock = null, debug = false) {
    const startTime = Date.now();
    
    if (debug) {
      this.log(`Starting PMM position fetch...`);
      this.log(`   PMM Address: ${pmmAddress}`);
      this.log(`   Chain ID: ${chainId}`);
      this.log(`   Target Block: ${targetBlock || 'latest'}`);
    }

    if (!ethers.isAddress(pmmAddress)) {
      throw new Error(`Invalid PMM address: ${pmmAddress}`);
    }

    const config = CHAIN_CONFIGS[chainId];
    if (!config) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    try {
      if (debug) this.log('Step 1: Fetching all LP tokens...');
      const lpTokens = await this.getAllLPTokens(chainId, targetBlock, debug);
      
      if (lpTokens.length === 0) {
        if (debug) this.log('No LP tokens found');
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

      if (debug) this.log('\nStep 2: Resolving underlying tokens using multicall...');
      const tokenData = await this.batchGetUnderlyingTokens(chainId, lpTokens, targetBlock, debug);

      if (debug) this.log('\nStep 3: Fetching positions using multicall...');
      const underlyingAddresses = tokenData.map(t => t.underlyingAddress);
      const positionResults = await this.batchGetPositions(chainId, pmmAddress, underlyingAddresses, targetBlock, debug);
      
      const positions = [];

      for (let i = 0; i < tokenData.length; i++) {
        const { lpTokenAddress, underlyingAddress, decimals, symbol, isLPToken } = tokenData[i];
        const positionResult = positionResults[i];
        
        if (debug) this.log(`  ${i + 1}/${tokenData.length}: ${underlyingAddress} (${symbol})`);
        
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
          
          positions.push(positionData);
          
          if (debug) this.log(`    → Position: ${ethers.formatUnits(position, decimals)} ${symbol}`);
        } else {
          if (debug) this.log(`    → No position`);
        }
      }

      const endTime = Date.now();
      const fetchTime = endTime - startTime;

      if (debug) {
        this.log('\nPosition fetch completed!');
        this.log(`   Total tokens checked: ${tokenData.length}`);
        this.log(`   Tokens with positions: ${positions.length}`);
        this.log(`   Fetch time: ${fetchTime}ms`);
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
      this.log(`Error: ${error.message}`);
      throw error;
    }
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span><span class="log-message">${message}</span>`;
    
    const logsOutput = document.getElementById('logsOutput');
    logsOutput.appendChild(logEntry);
    logsOutput.scrollTop = logsOutput.scrollHeight;
  }

  cleanup() {
    this.providers.clear();
    this.multicalls.clear();
  }
}

// UI Logic
class UI {
  constructor() {
    this.fetcher = new PMMPositionFetcher();
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    const form = document.getElementById('queryForm');
    const tabButtons = document.querySelectorAll('.tab-button');
    
    form.addEventListener('submit', (e) => this.handleSubmit(e));
    
    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
  }

  async handleSubmit(e) {
    e.preventDefault();
    
    const pmmAddress = document.getElementById('pmmAddress').value.trim();
    const chainId = parseInt(document.getElementById('chainId').value);
    const targetBlock = document.getElementById('targetBlock').value.trim();
    const debugMode = document.getElementById('debugMode').checked;
    
    const targetBlockNumber = targetBlock ? parseInt(targetBlock) : null;
    
    this.setLoading(true);
    this.clearOutputs();
    
    try {
      const result = await this.fetcher.listPmmPositions(
        pmmAddress, 
        chainId, 
        targetBlockNumber, 
        debugMode
      );
      
      this.displayResults(result);
      this.showSuccess('Positions fetched successfully!');
      
    } catch (error) {
      this.showError(`Error: ${error.message}`);
    } finally {
      this.setLoading(false);
    }
  }

  setLoading(loading) {
    const button = document.getElementById('fetchButton');
    const buttonText = button.querySelector('.button-text');
    const buttonSpinner = button.querySelector('.button-spinner');
    
    button.disabled = loading;
    
    if (loading) {
      buttonText.style.display = 'none';
      buttonSpinner.style.display = 'inline';
    } else {
      buttonText.style.display = 'inline';
      buttonSpinner.style.display = 'none';
    }
  }

  clearOutputs() {
    document.getElementById('positionsOutput').innerHTML = '<p class="placeholder">Click "Fetch Positions" to see results</p>';
    document.getElementById('logsOutput').innerHTML = '<p class="placeholder">Debug logs will appear here</p>';
  }

  displayResults(result) {
    const positionsOutput = document.getElementById('positionsOutput');
    
    if (result.positions.length === 0) {
      positionsOutput.innerHTML = '<p class="placeholder">No positions found for this address</p>';
      return;
    }

    let html = `
      <div class="summary">
        <h3>Summary</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <strong>${result.summary.totalTokens}</strong>
            <span>Total Tokens</span>
          </div>
          <div class="summary-item">
            <strong>${result.summary.tokensWithPositions}</strong>
            <span>With Positions</span>
          </div>
          <div class="summary-item">
            <strong>${result.summary.fetchTime}ms</strong>
            <span>Fetch Time</span>
          </div>
        </div>
      </div>
    `;

    result.positions.forEach(position => {
      const isPositive = !position.positionFormatted.startsWith('-');
      const amountClass = isPositive ? 'positive' : 'negative';
      
      html += `
        <div class="position-item">
          <h3>${position.tokenSymbol}</h3>
          <div class="position-amount ${amountClass}">${position.positionFormatted} ${position.tokenSymbol}</div>
          <div class="position-details">
            <div class="position-detail">
              <strong>Token Address:</strong>
              <span>${position.tokenAddress}</span>
            </div>
            ${position.lpTokenAddress ? `
            <div class="position-detail">
              <strong>LP Token Address:</strong>
              <span>${position.lpTokenAddress}</span>
            </div>
            ` : ''}
            <div class="position-detail">
              <strong>Decimals:</strong>
              <span>${position.decimals}</span>
            </div>
            <div class="position-detail">
              <strong>Raw Position:</strong>
              <span>${position.position}</span>
            </div>
          </div>
        </div>
      `;
    });

    positionsOutput.innerHTML = html;
  }

  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  showError(message) {
    this.showMessage(message, 'error');
  }

  showMessage(message, type) {
    const positionsOutput = document.getElementById('positionsOutput');
    const messageDiv = document.createElement('div');
    messageDiv.className = type;
    messageDiv.textContent = message;
    positionsOutput.insertBefore(messageDiv, positionsOutput.firstChild);
    
    setTimeout(() => {
      messageDiv.remove();
    }, 5000);
  }
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new UI();
});
