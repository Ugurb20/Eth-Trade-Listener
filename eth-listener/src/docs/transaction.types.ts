import { TransactionResponse } from 'ethers';

/**
 * Ethereum transaction hash
 */
export type TransactionHash = string;

/**
 * Extended transaction information returned from WebSocket
 */
export interface TransactionInfo extends TransactionResponse {
  // Additional fields can be added here if needed
}

/**
 * Transaction fetch result
 */
export interface TransactionFetchResult {
  success: boolean;
  txHash: TransactionHash;
  transaction?: TransactionInfo;
  error?: string;
}
