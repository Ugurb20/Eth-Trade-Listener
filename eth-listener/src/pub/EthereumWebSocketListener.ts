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

  constructor(websocketUrl: string, config: EthereumListenerConfig = {}) {
    this.websocketUrl = websocketUrl;
    this.maxConcurrentFetches = config.maxConcurrentFetches || parseInt(process.env.MAX_CONCURRENT_FETCHES || '10');
    this.fetchTimeout = config.fetchTimeout || parseInt(process.env.FETCH_TIMEOUT || '5000');
  }

  /**
   * Connect to the Ethereum WebSocket
   */
  async connect(): Promise<boolean> {
    try {
      console.log(`[${new Date().toISOString()}] Connecting to Ethereum WebSocket...`);
      console.log(`[${new Date().toISOString()}] URL: ${this.websocketUrl}`);

      this.provider = new WebSocketProvider(this.websocketUrl);
      await this.provider.ready;

      this.isConnected = true;
      console.log(`[${new Date().toISOString()}] ✓ Successfully connected to Ethereum WebSocket`);

      const network = await this.provider.getNetwork();
      this.networkName = network.name;
      this.chainId = network.chainId.toString();

      console.log(`[${new Date().toISOString()}] Connected to network:`, {
        name: this.networkName,
        chainId: this.chainId
      });

      this.setupErrorHandlers();
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
  private setupErrorHandlers(): void {
    if (!this.provider) return;

    const ws = this.provider.websocket as any;

    ws.on('error', (error: Error) => {
      console.error(`[${new Date().toISOString()}] WebSocket error:`, error.message);
      this.isConnected = false;
    });

    ws.on('close', (code: number, reason: string) => {
      console.warn(`[${new Date().toISOString()}] WebSocket closed. Code: ${code}, Reason: ${reason}`);
      this.isConnected = false;
    });

    ws.on('open', () => {
      console.log(`[${new Date().toISOString()}] WebSocket connection opened`);
      this.isConnected = true;
    });
  }

  /**
   * Disconnect from the Ethereum WebSocket
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      console.log(`[${new Date().toISOString()}] Disconnecting from Ethereum WebSocket...`);
      await this.stopListening();
      await this.provider.destroy();
      this.isConnected = false;
      console.log(`[${new Date().toISOString()}] Disconnected`);
    }
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
      this.provider?.off('pending');
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
}
