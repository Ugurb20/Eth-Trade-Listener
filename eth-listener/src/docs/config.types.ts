/**
 * Configuration options for the Ethereum Listener
 */
export interface EthereumListenerConfig {
  /**
   * Maximum number of concurrent transaction fetches
   * @default 10
   */
  maxConcurrentFetches?: number;

  /**
   * Timeout for fetching transaction details in milliseconds
   * @default 5000
   */
  fetchTimeout?: number;

  /**
   * Enable auto-reconnection on WebSocket disconnect
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Maximum number of reconnection attempts (0 = unlimited)
   * @default 0
   */
  maxReconnectAttempts?: number;

  /**
   * Initial delay before first reconnection attempt in milliseconds
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Maximum delay between reconnection attempts in milliseconds
   * @default 60000
   */
  maxReconnectDelay?: number;

  /**
   * Backoff multiplier for exponential backoff
   * @default 2
   */
  reconnectBackoffMultiplier?: number;
}

/**
 * Environment variables required for the application
 */
export interface EnvironmentConfig {
  ETH_WEBSOCKET_URL: string;
  MAX_CONCURRENT_FETCHES?: string;
  FETCH_TIMEOUT?: string;
  AUTO_RECONNECT?: string;
  MAX_RECONNECT_ATTEMPTS?: string;
  RECONNECT_DELAY?: string;
  MAX_RECONNECT_DELAY?: string;
  RECONNECT_BACKOFF_MULTIPLIER?: string;
}
