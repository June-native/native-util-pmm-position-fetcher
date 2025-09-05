# Native Util PMM Position Fetcher

A comprehensive utility for fetching PMM (Permanent Market Maker) positions across multiple blockchain networks using ethers.js. Available as both a Node.js CLI tool and a modern web application.

## Features

- **Multichain Support**: Ethereum, BSC, Arbitrum, and Base
- **Position Fetching**: Get PMM positions for any trader address
- **LP Token Resolution**: Automatically resolve underlying tokens from LP tokens
- **Block-specific Queries**: Query positions at specific block heights
- **Comprehensive Results**: Detailed position data with summaries
- **CLI Interface**: Easy-to-use command-line tool
- **Web UI**: Modern, responsive web interface
- **Vercel Ready**: Deploy to Vercel with one click
- **Error Handling**: Robust error handling and logging

## Quick Start

### Web UI (Recommended)

1. **Deploy to Vercel** (One-click deployment):
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/native-util-pmm-position-fetcher)

2. **Or run locally**:
   ```bash
   git clone <repository-url>
   cd native-util-pmm-position-fetcher
   npm install
   npm run web
   ```
   Open http://localhost:3000 in your browser.

### CLI Tool

1. Clone the repository:
```bash
git clone <repository-url>
cd native-util-pmm-position-fetcher
```

2. Install dependencies:
```bash
npm install
```

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- RPC access to supported blockchain networks

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory with your configuration:

```env
# Ethereum RPC URLs
ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
BSC_RPC_URL=https://bsc-dataseed.binance.org/
ARB_RPC_URL=https://arb1.arbitrum.io/rpc
BASE_RPC_URL=https://mainnet.base.org

# CreditVault Contract Addresses (replace with actual addresses)
ETH_CREDIT_VAULT_ADDRESS=0x...
BSC_CREDIT_VAULT_ADDRESS=0x...
ARB_CREDIT_VAULT_ADDRESS=0x...
BASE_CREDIT_VAULT_ADDRESS=0x...
```

## Usage

### Web UI

1. **Open the application** in your browser
2. **Enter PMM Address**: Input the PMM trader address you want to query
3. **Select Chain**: Choose from Ethereum, BSC, Arbitrum, or Base
4. **Set Target Block** (optional): Leave empty for latest block, or enter a specific block number
5. **Enable Debug Mode** (optional): Toggle for verbose logging output
6. **Click "Fetch Positions"**: The app will query and display results
7. **View Results**: 
   - **Positions Tab**: Clean display of position data with formatted amounts
   - **Logs Tab**: Real-time debug output and processing logs

### CLI Tool

The easiest way to use the tool is through the CLI:

```bash
# Basic usage
npm run cli <pmmAddress> <chainId>

# Examples
npm run cli 0x1234567890123456789012345678901234567890 1
npm run cli 0x1234567890123456789012345678901234567890 56
npm run cli 0x1234567890123456789012345678901234567890 42161 18500000
```

### Programmatic Usage

```javascript
import { PMMPositionFetcher } from './pmmPositionFetcher.js';

const fetcher = new PMMPositionFetcher();

// Fetch positions for a PMM address
const result = await fetcher.listPmmPositions(
  '0x1234567890123456789012345678901234567890', // PMM address
  1, // Chain ID (1 = Ethereum)
  18500000 // Target block (optional, defaults to latest)
);

console.log(JSON.stringify(result, null, 2));
```

### Supported Chains

| Chain ID | Name      | RPC URL Example                    |
|----------|-----------|-----------------------------------|
| 1        | Ethereum  | https://mainnet.infura.io/v3/...  |
| 56       | BSC       | https://bsc-dataseed.binance.org/ |
| 42161    | Arbitrum  | https://arb1.arbitrum.io/rpc      |
| 8453     | Base      | https://mainnet.base.org          |

## API Reference

### `listPmmPositions(pmmAddress, chainId, targetBlock)`

Fetches PMM positions for a given address on a specific chain.

**Parameters:**
- `pmmAddress` (string): The PMM trader address
- `chainId` (number): The blockchain chain ID
- `targetBlock` (number, optional): Target block number (defaults to latest)

**Returns:**
```javascript
{
  chainId: 1,
  chainName: "Ethereum",
  pmmAddress: "0x...",
  targetBlock: 18500000,
  positions: [
    {
      tokenAddress: "0x...",
      lpTokenAddress: "0x...",
      position: "1000000000000000000",
      positionFormatted: "1.0",
      isLPToken: true
    }
  ],
  summary: {
    totalTokens: 10,
    tokensWithPositions: 3,
    totalValue: "5000000000000000000",
    totalValueFormatted: "5.0",
    fetchTime: 1500
  }
}
```

## How It Works

1. **Fetch LP Tokens**: Queries the CreditVault contract to get all registered LP tokens
2. **Resolve Underlying Tokens**: For each LP token, calls `underlying()` to get the real token address
3. **Query Positions**: For each token, calls `positions(trader, token)` to get the position amount
4. **Return Results**: Compiles all position data into a comprehensive JSON response

## Error Handling

The tool includes comprehensive error handling:
- Network connection validation
- Contract address verification
- Graceful handling of failed token resolutions
- Detailed error messages and logging

## Development

```bash
# Run in development mode with auto-restart
npm run dev

# Run the main example
npm start
```

## License

MIT
