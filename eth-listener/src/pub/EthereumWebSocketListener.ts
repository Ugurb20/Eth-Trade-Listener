import { WebSocketProvider, TransactionResponse } from 'ethers';
import { EthereumListenerConfig, TransactionHash, NormalizedTransaction } from '../docs';
import { normalizeTransaction } from '../utils';

/**
 * Callback for handling normalized transactions
 */
export type TransactionCallback = (transaction: NormalizedTransaction) => void | Promise<void>;

/**
 * Ethereum WebSocket Listener for monitoring pending transactions
 */
export class EthereumWebSocketListener {
  private websocketUrl: string;
  private provider: WebSocketProvider | null = null;
  private isConnected: boolean = false;
  private isListening: boolean = false;

  private maxConcurrentFetches: number;
  private fetchTimeout: number;
  private ongoingFetches: Set<TransactionHash> = new Set();

  private networkName: string = '';
  private chainId: string = '';
  private transactionCallback?: TransactionCallback;

  // Reconnection configuration
  private autoReconnect: boolean;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private reconnectBackoffMultiplier: number;

  // Reconnection state
  private reconnectAttempts: number = 0;
  private isReconnecting: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect: boolean = true;
  private wasListeningBeforeDisconnect: boolean = false;
  private connectionId: number = 0; // Track connection instances to prevent ghost sessions

  constructor(websocketUrl: string, config: EthereumListenerConfig = {}) {
    this.websocketUrl = websocketUrl;
    this.maxConcurrentFetches = config.maxConcurrentFetches || parseInt(process.env.MAX_CONCURRENT_FETCHES || '10');
    this.fetchTimeout = config.fetchTimeout || parseInt(process.env.FETCH_TIMEOUT || '5000');

    // Reconnection configuration
    this.autoReconnect = config.autoReconnect !== undefined ? config.autoReconnect : (process.env.AUTO_RECONNECT !== 'false');
    this.maxReconnectAttempts = config.maxReconnectAttempts || parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '0');
    this.reconnectDelay = config.reconnectDelay || parseInt(process.env.RECONNECT_DELAY || '1000');
    this.maxReconnectDelay = config.maxReconnectDelay || parseInt(process.env.MAX_RECONNECT_DELAY || '60000');
    this.reconnectBackoffMultiplier = config.reconnectBackoffMultiplier || parseFloat(process.env.RECONNECT_BACKOFF_MULTIPLIER || '2');
  }

  /**
   * Connect to the Ethereum WebSocket
   */
  async connect(): Promise<boolean> {
    try {
      // Cleanup any existing provider to prevent ghost sessions
      if (this.provider) {
        console.log(`[${new Date().toISOString()}] Cleaning up existing provider before new connection...`);
        await this.cleanupProvider();
      }

      console.log(`[${new Date().toISOString()}] Connecting to Ethereum WebSocket...`);
      console.log(`[${new Date().toISOString()}] URL: ${this.websocketUrl}`);

      // Increment connection ID to track this specific connection
      this.connectionId++;
      const currentConnectionId = this.connectionId;

      this.provider = new WebSocketProvider(this.websocketUrl);
      await this.provider.ready;

      // Check if this connection is still the current one (not superseded by another reconnect)
      if (currentConnectionId !== this.connectionId) {
        console.log(`[${new Date().toISOString()}] Connection superseded by newer attempt, cleaning up...`);
        await this.provider.destroy();
        throw new Error('Connection superseded');
      }

      this.isConnected = true;
      // Enable reconnection for future disconnects
      this.shouldReconnect = true;

      console.log(`[${new Date().toISOString()}] ✓ Successfully connected to Ethereum WebSocket (Connection ID: ${this.connectionId})`);

      const network = await this.provider.getNetwork();
      this.networkName = network.name;
      this.chainId = network.chainId.toString();

      console.log(`[${new Date().toISOString()}] Connected to network:`, {
        name: this.networkName,
        chainId: this.chainId
      });

      this.setupErrorHandlers(currentConnectionId);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${new Date().toISOString()}] ✗ Failed to connect to WebSocket:`, errorMessage);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Set up WebSocket error handlers
   */
  private setupErrorHandlers(connectionId: number): void {
    if (!this.provider) return;

    const ws = this.provider.websocket as any;

    ws.on('error', (error: Error) => {
      // Only handle errors for the current connection
      if (connectionId !== this.connectionId) {
        console.log(`[${new Date().toISOString()}] Ignoring error from old connection (ID: ${connectionId})`);
        return;
      }

      console.error(`[${new Date().toISOString()}] WebSocket error (Connection ID: ${connectionId}):`, error.message);
      this.isConnected = false;

      // Trigger reconnection on error
      if (this.shouldReconnect && this.autoReconnect && !this.isReconnecting) {
        this.scheduleReconnect();
      }
    });

    ws.on('close', (code: number, reason: string) => {
      // Only handle close events for the current connection
      if (connectionId !== this.connectionId) {
        console.log(`[${new Date().toISOString()}] Ignoring close event from old connection (ID: ${connectionId})`);
        return;
      }

      console.warn(`[${new Date().toISOString()}] WebSocket closed (Connection ID: ${connectionId}). Code: ${code}, Reason: ${reason || 'No reason provided'}`);
      this.isConnected = false;

      // Save listening state before disconnect
      if (this.isListening) {
        this.wasListeningBeforeDisconnect = true;
        this.isListening = false;
      }

      // Trigger reconnection on close if it wasn't intentional
      if (this.shouldReconnect && this.autoReconnect && !this.isReconnecting) {
        this.scheduleReconnect();
      }
    });

    ws.on('open', () => {
      // Only handle open events for the current connection
      if (connectionId !== this.connectionId) {
        console.log(`[${new Date().toISOString()}] Ignoring open event from old connection (ID: ${connectionId})`);
        return;
      }

      console.log(`[${new Date().toISOString()}] WebSocket connection opened (Connection ID: ${connectionId})`);
      this.isConnected = true;
    });
  }

  /**
   * Disconnect from the Ethereum WebSocket
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      console.log(`[${new Date().toISOString()}] Disconnecting from Ethereum WebSocket...`);

      // Disable auto-reconnection for intentional disconnect
      this.shouldReconnect = false;
      this.clearReconnectTimer();

      await this.stopListening();
      await this.cleanupProvider();
      this.isConnected = false;
      console.log(`[${new Date().toISOString()}] Disconnected`);
    }
  }

  /**
   * Cleanup the current provider and remove all listeners
   */
  private async cleanupProvider(): Promise<void> {
    if (!this.provider) return;

    // Stop listening first to clean up subscriptions
    if (this.isListening) {
      try {
        this.provider.off('pending');
        this.isListening = false;
      } catch (error) {
        // Ignore errors when stopping listener
        this.isListening = false;
      }
    }

    const providerToClean = this.provider;
    this.provider = null; // Clear reference immediately

    try {
      const ws = providerToClean.websocket as any;

      // Remove all event listeners to prevent ghost session handlers
      if (ws && ws.removeAllListeners) {
        try {
          ws.removeAllListeners('error');
          ws.removeAllListeners('close');
          ws.removeAllListeners('open');
        } catch (listenerError) {
          // Ignore listener removal errors
        }
      }

      // Destroy the provider - wrap in try-catch for synchronous errors
      // The destroy() call can throw synchronously if the WebSocket was closed during connection
      try {
        await providerToClean.destroy();
      } catch (destroyError) {
        // Silently ignore destroy errors
      }
    } catch (error) {
      // Ignore all cleanup errors
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (!errorMsg.includes('WebSocket was closed')) {
        console.log(`[${new Date().toISOString()}] Error during provider cleanup (non-fatal):`, errorMsg);
      }
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.isReconnecting || this.reconnectTimer) {
      return;
    }

    // Check if we've exceeded max reconnection attempts
    if (this.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[${new Date().toISOString()}] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }

    this.isReconnecting = true;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(this.reconnectBackoffMultiplier, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`[${new Date().toISOString()}] Scheduling reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  /**
   * Attempt to reconnect to the WebSocket
   */
  private async reconnect(): Promise<void> {
    this.reconnectTimer = null;
    this.reconnectAttempts++;

    console.log(`[${new Date().toISOString()}] Reconnection attempt ${this.reconnectAttempts}...`);

    try {
      // Attempt to reconnect (connect() method handles cleanup automatically)
      await this.connect();

      // Reset reconnection state on success
      this.reconnectAttempts = 0;
      this.isReconnecting = false;

      console.log(`[${new Date().toISOString()}] ✓ Reconnection successful`);

      // Restart listening if we were listening before disconnect
      if (this.wasListeningBeforeDisconnect) {
        console.log(`[${new Date().toISOString()}] Restarting transaction listener...`);
        await this.startListening();
        this.wasListeningBeforeDisconnect = false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${new Date().toISOString()}] ✗ Reconnection attempt ${this.reconnectAttempts} failed:`, errorMessage);

      this.isReconnecting = false;

      // Schedule next reconnection attempt (only if not superseded)
      if (this.shouldReconnect && this.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Clear any pending reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
  }

  /**
   * Start listening for pending transactions
   */
  async startListening(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Cannot start listening: not connected to WebSocket');
    }

    if (this.isListening) {
      console.warn(`[${new Date().toISOString()}] Already listening for pending transactions`);
      return;
    }

    try {
      console.log(`[${new Date().toISOString()}] Starting to listen for pending transactions...`);

      this.provider!.on('pending', (txHash: string) => {
        this.handlePendingTransaction(txHash);
      });

      this.isListening = true;
      console.log(`[${new Date().toISOString()}] ✓ Now listening for pending transactions`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${new Date().toISOString()}] ✗ Failed to start listening:`, errorMessage);
      throw error;
    }
  }

  /**
   * Stop listening for pending transactions
   */
  async stopListening(): Promise<void> {
    if (this.isListening) {
      console.log(`[${new Date().toISOString()}] Stopping pending transaction listener...`);
      try {
        this.provider?.off('pending');
      } catch (error) {
        // Ignore errors when stopping listener (provider might be destroyed)
      }
      this.isListening = false;
      console.log(`[${new Date().toISOString()}] Stopped listening`);
    }
  }

  /**
   * Handle a pending transaction
   */
  private handlePendingTransaction(txHash: TransactionHash): void {
    if (this.ongoingFetches.size >= this.maxConcurrentFetches) {
      console.log(`[${new Date().toISOString()}] Max concurrent fetches reached (${this.maxConcurrentFetches}), skipping: ${txHash}`);
      return;
    }

    this.fetchTransactionDetails(txHash);
  }

  /**
   * Fetch transaction details with timeout and concurrency control
   */
  private async fetchTransactionDetails(txHash: TransactionHash): Promise<TransactionResponse | null> {
    this.ongoingFetches.add(txHash);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Fetch timeout')), this.fetchTimeout);
      });

      const transaction = await Promise.race([
        this.provider!.getTransaction(txHash),
        timeoutPromise
      ]);

      if (!transaction) {
        console.log(`[${new Date().toISOString()}] No data returned for TX: ${txHash}`);
        return null;
      }

      console.log(`[${new Date().toISOString()}] Fetched TX: ${txHash}`);
      console.log(`  From: ${transaction.from}`);
      console.log(`  To: ${transaction.to || 'Contract Creation'}`);
      console.log(`  Value: ${transaction.value.toString()} wei`);
      console.log(`  Gas Limit: ${transaction.gasLimit.toString()}`);

      // Normalize transaction
      const normalized = normalizeTransaction(transaction, this.networkName, this.chainId);

      // Call callback if provided
      if (this.transactionCallback) {
        await this.transactionCallback(normalized);
      }

      return transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage === 'Fetch timeout') {
        console.error(`[${new Date().toISOString()}] Timeout fetching TX: ${txHash}`);
      } else {
        console.error(`[${new Date().toISOString()}] Error fetching TX ${txHash}:`, errorMessage);
      }

      return null;
    } finally {
      this.ongoingFetches.delete(txHash);
    }
  }

  /**
   * Set callback for normalized transactions
   */
  setTransactionCallback(callback: TransactionCallback): void {
    this.transactionCallback = callback;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get listening status
   */
  getListeningStatus(): boolean {
    return this.isListening;
  }

  /**
   * Get current connection ID (for testing)
   */
  getConnectionId(): number {
    return this.connectionId;
  }

  /**
   * Get reconnection state (for testing)
   */
  getReconnectionState(): {
    isReconnecting: boolean;
    reconnectAttempts: number;
    shouldReconnect: boolean;
  } {
    return {
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      shouldReconnect: this.shouldReconnect
    };
  }
}
