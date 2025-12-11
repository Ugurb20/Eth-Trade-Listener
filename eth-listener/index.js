require('dotenv').config();
const { WebSocketProvider } = require('ethers');

class EthereumListener {
  constructor(websocketUrl) {
    this.websocketUrl = websocketUrl;
    this.provider = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      console.log(`[${new Date().toISOString()}] Connecting to Ethereum WebSocket...`);
      console.log(`[${new Date().toISOString()}] URL: ${this.websocketUrl}`);

      // Create WebSocket provider
      this.provider = new WebSocketProvider(this.websocketUrl);

      // Wait for the connection to be established
      await this.provider.ready;

      this.isConnected = true;
      console.log(`[${new Date().toISOString()}] ✓ Successfully connected to Ethereum WebSocket`);

      // Get network information to verify connection
      const network = await this.provider.getNetwork();
      console.log(`[${new Date().toISOString()}] Connected to network:`, {
        name: network.name,
        chainId: network.chainId.toString()
      });

      // Set up error handlers
      this.setupErrorHandlers();

      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ✗ Failed to connect to WebSocket:`, error.message);
      this.isConnected = false;
      throw error;
    }
  }

  setupErrorHandlers() {
    // Handle WebSocket errors
    this.provider.websocket.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] WebSocket error:`, error.message);
      this.isConnected = false;
    });

    // Handle WebSocket close
    this.provider.websocket.on('close', (code, reason) => {
      console.warn(`[${new Date().toISOString()}] WebSocket closed. Code: ${code}, Reason: ${reason}`);
      this.isConnected = false;
    });

    // Handle WebSocket open
    this.provider.websocket.on('open', () => {
      console.log(`[${new Date().toISOString()}] WebSocket connection opened`);
      this.isConnected = true;
    });
  }

  async disconnect() {
    if (this.provider) {
      console.log(`[${new Date().toISOString()}] Disconnecting from Ethereum WebSocket...`);
      await this.provider.destroy();
      this.isConnected = false;
      console.log(`[${new Date().toISOString()}] Disconnected`);
    }
  }

  getConnectionStatus() {
    return this.isConnected;
  }
}

// Main execution
async function main() {
  const websocketUrl = process.env.ETH_WEBSOCKET_URL;

  if (!websocketUrl) {
    console.error('Error: ETH_WEBSOCKET_URL environment variable is not set');
    console.error('Please create a .env file based on .env.example');
    process.exit(1);
  }

  const listener = new EthereumListener(websocketUrl);

  try {
    await listener.connect();

    // Keep the process running
    console.log(`[${new Date().toISOString()}] Listener is running... Press Ctrl+C to exit`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n[${new Date().toISOString()}] Received SIGINT, shutting down gracefully...');
      await listener.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n[${new Date().toISOString()}] Received SIGTERM, shutting down gracefully...');
      await listener.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start listener:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { EthereumListener };
