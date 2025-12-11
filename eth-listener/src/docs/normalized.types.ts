/**
 * Normalized transaction payload ready for Kafka
 */
export interface NormalizedTransaction {
  /**
   * Transaction hash
   */
  hash: string;

  /**
   * Block number (null if pending)
   */
  blockNumber: number | null;

  /**
   * Sender address
   */
  from: string;

  /**
   * Recipient address (null for contract creation)
   */
  to: string | null;

  /**
   * Transaction value in wei
   */
  value: string;

  /**
   * Gas limit
   */
  gasLimit: string;

  /**
   * Gas price (for legacy transactions)
   */
  gasPrice?: string;

  /**
   * Max fee per gas (for EIP-1559 transactions)
   */
  maxFeePerGas?: string;

  /**
   * Max priority fee per gas (for EIP-1559 transactions)
   */
  maxPriorityFeePerGas?: string;

  /**
   * Transaction data/input
   */
  data: string;

  /**
   * Transaction nonce
   */
  nonce: number;

  /**
   * Transaction type (0 = legacy, 2 = EIP-1559)
   */
  type: number | null;

  /**
   * Chain ID
   */
  chainId: string;

  /**
   * Metadata
   */
  metadata: TransactionMetadata;
}

/**
 * Metadata about the transaction capture
 */
export interface TransactionMetadata {
  /**
   * Timestamp when transaction was received (ISO 8601)
   */
  receivedAt: string;

  /**
   * Network name
   */
  network: string;

  /**
   * Chain ID
   */
  chainId: string;
}
