# Vercel Deployment Guide

This project is configured for easy deployment to Vercel with both a web UI and API endpoints.

## Quick Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/native-util-pmm-position-fetcher)

## Manual Deployment

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy the project**:
   ```bash
   vercel
   ```

4. **Follow the prompts**:
   - Set up and deploy? `Y`
   - Which scope? Choose your account
   - Link to existing project? `N`
   - What's your project's name? `pmm-position-fetcher`
   - In which directory is your code located? `./`

## Project Structure

```
├── web/                    # Frontend (Vite app)
│   ├── index.html         # Main HTML file
│   ├── main.js            # Frontend JavaScript
│   ├── style.css          # Styling
│   ├── package.json       # Frontend dependencies
│   └── vite.config.js     # Vite configuration
├── api/                   # Vercel API routes
│   └── pmm-positions.js   # PMM positions API endpoint
├── vercel.json           # Vercel configuration
└── .vercelignore         # Files to ignore in deployment
```

## Features

### Web UI
- **Input Form**: Enter PMM address, select chain, optional target block
- **Debug Mode**: Toggle verbose logging
- **Results Display**: Clean presentation of position data
- **Logs Tab**: Real-time debug output
- **Responsive Design**: Works on desktop and mobile

### API Endpoint
- **POST /api/pmm-positions**: Server-side position fetching
- **CORS Enabled**: Can be called from any domain
- **Error Handling**: Proper HTTP status codes and error messages

## Environment Variables

No environment variables are required for basic functionality. The app uses public RPC endpoints.

## Build Commands

- `npm run web`: Start development server
- `npm run build`: Build for production
- `npm run preview`: Preview production build

## Supported Chains

- **Ethereum** (Chain ID: 1)
- **BSC** (Chain ID: 56)
- **Arbitrum** (Chain ID: 42161)
- **Base** (Chain ID: 8453)

## Usage

### Web UI
1. Open the deployed URL
2. Enter a PMM address
3. Select a chain
4. Optionally set a target block
5. Enable debug mode for verbose output
6. Click "Fetch Positions"

### API
```bash
curl -X POST https://your-app.vercel.app/api/pmm-positions \
  -H "Content-Type: application/json" \
  -d '{
    "pmmAddress": "0x26a5652812905cc994009902c4b4dff950f96775",
    "chainId": 56,
    "targetBlock": null,
    "debug": false
  }'
```

## Troubleshooting

### Common Issues

1. **Build Fails**: Make sure all dependencies are in the correct package.json files
2. **API Timeout**: Increase timeout in vercel.json if needed
3. **CORS Issues**: API endpoints have CORS enabled by default

### Performance

- The app uses multicall for efficient batch requests
- Client-side processing reduces server load
- API endpoint available for server-side processing if needed

## Customization

### Adding New Chains
1. Update `CHAIN_CONFIGS` in both `web/main.js` and `api/pmm-positions.js`
2. Add the chain option to the HTML select element
3. Deploy the changes

### Styling
- Modify `web/style.css` for custom styling
- The design is responsive and modern by default

### API Modifications
- Edit `api/pmm-positions.js` for server-side changes
- Add new endpoints by creating new files in the `api/` directory
