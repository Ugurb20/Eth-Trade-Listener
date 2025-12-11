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
}

/**
 * Environment variables required for the application
 */
export interface EnvironmentConfig {
  ETH_WEBSOCKET_URL: string;
  MAX_CONCURRENT_FETCHES?: string;
  FETCH_TIMEOUT?: string;
}
