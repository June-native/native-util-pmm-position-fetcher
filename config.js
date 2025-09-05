// Chain configurations for multichain support
export const CHAIN_CONFIGS = {
  // Ethereum Mainnet
  1: {
    name: 'Ethereum',
    rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    creditVaultAddress: process.env.ETH_CREDIT_VAULT_ADDRESS || '0xe3D41d19564922C9952f692C5Dd0563030f5f2EF',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    }
  },
  
  // BSC (Binance Smart Chain)
  56: {
    name: 'BSC',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc.llamarpc.com',
    creditVaultAddress: process.env.BSC_CREDIT_VAULT_ADDRESS || '0xBA8dB0CAf781cAc69b6acf6C848aC148264Cc05d',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18
    }
  },
  
  // Arbitrum One
  42161: {
    name: 'Arbitrum',
    rpcUrl: process.env.ARB_RPC_URL || 'https://arbitrum.gateway.tenderly.co',
    creditVaultAddress: process.env.ARB_CREDIT_VAULT_ADDRESS || '0xbA1cf8A63227b46575AF823BEB4d83D1025eff09',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    }
  },
  
  // Base
  8453: {
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://base.llamarpc.com',
    creditVaultAddress: process.env.BASE_CREDIT_VAULT_ADDRESS || '0x74a4Cd023e5AfB88369E3f22b02440F2614a1367',
    multicall3Address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    }
  }
};

// Supported chain IDs
export const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_CONFIGS).map(Number);

// Default configuration
export const DEFAULT_CONFIG = {
  // Default RPC URLs (using reliable public RPCs)
  RPC_URLS: {
    ETH: 'https://eth.drpc.org',
    BSC: 'https://bsc.drpc.org',
    ARB: 'https://arbitrum.gateway.tenderly.co',
    BASE: 'https://base.llamarpc.com'
  },
  
  // Default CreditVault addresses
  CREDIT_VAULT_ADDRESSES: {
    ETH: '0xe3D41d19564922C9952f692C5Dd0563030f5f2EF',
    BSC: '0xBA8dB0CAf781cAc69b6acf6C848aC148264Cc05d',
    ARB: '0xbA1cf8A63227b46575AF823BEB4d83D1025eff09',
    BASE: '0x74a4Cd023e5AfB88369E3f22b02440F2614a1367'
  },
  
  // Request timeout in milliseconds
  REQUEST_TIMEOUT: 30000,
  
  // Maximum retries for failed requests
  MAX_RETRIES: 3,
  
  // Block confirmation requirements
  CONFIRMATION_BLOCKS: {
    1: 12,    // Ethereum
    56: 3,    // BSC
    42161: 1, // Arbitrum
    8453: 1   // Base
  }
};

// Helper function to get chain config
export function getChainConfig(chainId) {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${SUPPORTED_CHAIN_IDS.join(', ')}`);
  }
  return config;
}

// Helper function to validate chain ID
export function isValidChainId(chainId) {
  return SUPPORTED_CHAIN_IDS.includes(Number(chainId));
}
