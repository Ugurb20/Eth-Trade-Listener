import { TransactionResponse } from 'ethers';
import { NormalizedTransaction, TransactionMetadata } from '../docs';

/**
 * Normalize a transaction response into a standardized JSON payload
 */
export function normalizeTransaction(
  transaction: TransactionResponse,
  networkName: string,
  chainId: string
): NormalizedTransaction {
  const metadata: TransactionMetadata = {
    receivedAt: new Date().toISOString(),
    network: networkName,
    chainId
  };

  return {
    hash: transaction.hash,
    blockNumber: transaction.blockNumber,
    from: transaction.from,
    to: transaction.to,
    value: transaction.value.toString(),
    gasLimit: transaction.gasLimit.toString(),
    gasPrice: transaction.gasPrice?.toString(),
    maxFeePerGas: transaction.maxFeePerGas?.toString(),
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas?.toString(),
    data: transaction.data,
    nonce: transaction.nonce,
    type: transaction.type,
    chainId: transaction.chainId.toString(),
    metadata
  };
}

/**
 * Convert normalized transaction to JSON string
 */
export function transactionToJSON(normalized: NormalizedTransaction): string {
  return JSON.stringify(normalized, null, 2);
}

/**
 * Convert normalized transaction to compact JSON (for Kafka)
 */
export function transactionToCompactJSON(normalized: NormalizedTransaction): string {
  return JSON.stringify(normalized);
}
