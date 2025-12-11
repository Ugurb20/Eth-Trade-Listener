/**
 * Kafka producer configuration
 */
export interface KafkaProducerConfig {
  /**
   * Kafka broker addresses
   * @example ['localhost:9092']
   */
  brokers: string[];

  /**
   * Client ID for the Kafka producer
   * @default 'eth-listener-producer'
   */
  clientId?: string;

  /**
   * Topic to publish transactions to
   * @default 'blockchain.txs.raw'
   */
  topic?: string;

  /**
   * Enable compression
   * @default true
   */
  compression?: boolean;

  /**
   * Maximum retries for failed messages
   * @default 3
   */
  maxRetries?: number;

  /**
   * Retry timeout in milliseconds
   * @default 30000
   */
  retryTimeout?: number;
}

/**
 * Kafka message metadata
 */
export interface KafkaMessageMetadata {
  /**
   * Message key (transaction hash)
   */
  key: string;

  /**
   * Message value (JSON payload)
   */
  value: string;

  /**
   * Timestamp when message was sent
   */
  timestamp: number;
}
