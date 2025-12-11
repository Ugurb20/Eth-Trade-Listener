# Ethereum WebSocket Listener

Real-time Ethereum transaction listener that connects to an Ethereum node via WebSocket.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file from the example:
```bash
cp .env.example .env
```

3. Configure your Ethereum WebSocket URL in `.env`:
```env
ETH_WEBSOCKET_URL=wss://mainnet.infura.io/ws/v3/YOUR_PROJECT_ID
```

### Getting an Ethereum WebSocket URL

You can get a free WebSocket endpoint from:

- **Infura**: https://infura.io/
  - Format: `wss://mainnet.infura.io/ws/v3/YOUR_PROJECT_ID`

- **Alchemy**: https://www.alchemy.com/
  - Format: `wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY`

- **QuickNode**: https://www.quicknode.com/
  - Format: `wss://YOUR_ENDPOINT.quiknode.pro/YOUR_TOKEN/`

## Running the Listener

```bash
npm start
```

The listener will:
- Establish a WebSocket connection to the Ethereum node
- Display connection status and network information
- Keep the connection alive
- Handle disconnections gracefully

## Current Status

✅ **Implemented:**
- WebSocket connection to Ethereum RPC
- Connection status monitoring
- Graceful shutdown handling
- Error handling for connection issues

🔄 **Next Steps:**
- Listen for pending transaction hashes
- Fetch full transaction objects
- Normalize and filter transaction data
- Push to Kafka
