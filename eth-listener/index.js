require('dotenv').config();
const { WebSocketProvider } = require('ethers');

class EthereumListener {
  constructor(websocketUrl, config = {}) {
    this.websocketUrl = websocketUrl;
    this.provider = null;
    this.isConnected = false;
    this.isListening = false;
    this.transactionCount = 0;
    this.fetchedCount = 0;
    this.failedFetchCount = 0;
    this.startTime = null;

    // Configuration
    this.maxConcurrentFetches = config.maxConcurrentFetches || parseInt(process.env.MAX_CONCURRENT_FETCHES) || 10;
    this.fetchTimeout = config.fetchTimeout || parseInt(process.env.FETCH_TIMEOUT) || 5000;

    // Track ongoing fetches for concurrency control
    this.ongoingFetches = new Set();
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
      await this.stopListening();
      await this.provider.destroy();
      this.isConnected = false;
      console.log(`[${new Date().toISOString()}] Disconnected`);
    }
  }

  async startListening() {
    if (!this.isConnected) {
      throw new Error('Cannot start listening: not connected to WebSocket');
    }

    if (this.isListening) {
      console.warn(`[${new Date().toISOString()}] Already listening for pending transactions`);
      return;
    }

    try {
      console.log(`[${new Date().toISOString()}] Starting to listen for pending transactions...`);

      // Subscribe to pending transactions
      this.provider.on('pending', (txHash) => {
        this.handlePendingTransaction(txHash);
      });

      this.isListening = true;
      this.startTime = Date.now();
      console.log(`[${new Date().toISOString()}] ✓ Now listening for pending transactions`);

      // Start stats reporter
      this.startStatsReporter();

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ✗ Failed to start listening:`, error.message);
      throw error;
    }
  }

  async stopListening() {
    if (this.isListening) {
      console.log(`[${new Date().toISOString()}] Stopping pending transaction listener...`);

      // Remove all pending transaction listeners
      this.provider.off('pending');

      this.isListening = false;
      this.stopStatsReporter();

      console.log(`[${new Date().toISOString()}] Stopped listening`);
    }
  }

  async handlePendingTransaction(txHash) {
    this.transactionCount++;

    // Check if we're at max concurrent fetches
    if (this.ongoingFetches.size >= this.maxConcurrentFetches) {
      console.log(`[${new Date().toISOString()}] Max concurrent fetches reached (${this.maxConcurrentFetches}), skipping: ${txHash}`);
      return;
    }

    // Fetch transaction details (don't await - handle concurrently)
    this.fetchTransactionDetails(txHash);
  }

  async fetchTransactionDetails(txHash) {
    // Add to ongoing fetches
    this.ongoingFetches.add(txHash);

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Fetch timeout')), this.fetchTimeout);
      });

      // Fetch transaction with timeout
      const transaction = await Promise.race([
        this.provider.getTransaction(txHash),
        timeoutPromise
      ]);

      // Handle case where node doesn't return data
      if (!transaction) {
        console.log(`[${new Date().toISOString()}] No data returned for TX: ${txHash}`);
        this.failedFetchCount++;
        return null;
      }

      this.fetchedCount++;
      console.log(`[${new Date().toISOString()}] Fetched TX #${this.fetchedCount}: ${txHash}`);
      console.log(`  From: ${transaction.from}`);
      console.log(`  To: ${transaction.to || 'Contract Creation'}`);
      console.log(`  Value: ${transaction.value.toString()} wei`);
      console.log(`  Gas Limit: ${transaction.gasLimit.toString()}`);

      return transaction;

    } catch (error) {
      this.failedFetchCount++;

      if (error.message === 'Fetch timeout') {
        console.error(`[${new Date().toISOString()}] Timeout fetching TX: ${txHash}`);
      } else {
        console.error(`[${new Date().toISOString()}] Error fetching TX ${txHash}:`, error.message);
      }

      return null;
    } finally {
      // Remove from ongoing fetches
      this.ongoingFetches.delete(txHash);
    }
  }

  startStatsReporter() {
    // Report statistics every 30 seconds
    this.statsInterval = setInterval(() => {
      this.reportStatistics();
    }, 30000);
  }

  stopStatsReporter() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  reportStatistics() {
    if (!this.startTime) return;

    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const rate = uptime > 0 ? (this.transactionCount / uptime).toFixed(2) : 0;
    const fetchRate = uptime > 0 ? (this.fetchedCount / uptime).toFixed(2) : 0;
    const successRate = this.transactionCount > 0
      ? ((this.fetchedCount / this.transactionCount) * 100).toFixed(1)
      : 0;

    console.log(`[${new Date().toISOString()}] === Statistics ===`);
    console.log(`  Pending TXs received: ${this.transactionCount}`);
    console.log(`  Successfully fetched: ${this.fetchedCount}`);
    console.log(`  Failed fetches: ${this.failedFetchCount}`);
    console.log(`  Ongoing fetches: ${this.ongoingFetches.size}`);
    console.log(`  Success rate: ${successRate}%`);
    console.log(`  Uptime: ${uptime}s`);
    console.log(`  Pending rate: ${rate} tx/s`);
    console.log(`  Fetch rate: ${fetchRate} tx/s`);
    console.log(`  Status: ${this.isListening ? 'Listening' : 'Stopped'}`);
  }

  getConnectionStatus() {
    return this.isConnected;
  }

  getListeningStatus() {
    return this.isListening;
  }

  getStatistics() {
    const uptime = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    const successRate = this.transactionCount > 0
      ? ((this.fetchedCount / this.transactionCount) * 100).toFixed(1)
      : 0;

    return {
      transactionCount: this.transactionCount,
      fetchedCount: this.fetchedCount,
      failedFetchCount: this.failedFetchCount,
      ongoingFetches: this.ongoingFetches.size,
      successRate: parseFloat(successRate),
      uptime,
      pendingRate: uptime > 0 ? parseFloat((this.transactionCount / uptime).toFixed(2)) : 0,
      fetchRate: uptime > 0 ? parseFloat((this.fetchedCount / uptime).toFixed(2)) : 0,
      isListening: this.isListening,
      isConnected: this.isConnected
    };
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
    // Connect to Ethereum WebSocket
    await listener.connect();

    // Start listening for pending transactions
    await listener.startListening();

    // Keep the process running
    console.log(`[${new Date().toISOString()}] Listener is running... Press Ctrl+C to exit`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log(`\n[${new Date().toISOString()}] Received SIGINT, shutting down gracefully...`);
      await listener.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log(`\n[${new Date().toISOString()}] Received SIGTERM, shutting down gracefully...`);
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
