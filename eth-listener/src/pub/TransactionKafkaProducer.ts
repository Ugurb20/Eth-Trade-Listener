import { Kafka, Producer, CompressionTypes, RecordMetadata } from 'kafkajs';
import { KafkaProducerConfig } from '../docs';
import { NormalizedTransaction } from '../docs';
import { transactionToCompactJSON } from '../utils';

/**
 * Kafka producer for publishing Ethereum transactions
 */
export class TransactionKafkaProducer {
  private kafka: Kafka;
  private producer: Producer;
  private topic: string;
  private isConnected: boolean = false;
  private maxRetries: number;
  private retryTimeout: number;

  constructor(config: KafkaProducerConfig) {
    this.topic = config.topic || process.env.KAFKA_TOPIC || 'blockchain.txs.raw';
    this.maxRetries = config.maxRetries || parseInt(process.env.KAFKA_MAX_RETRIES || '3');
    this.retryTimeout = config.retryTimeout || parseInt(process.env.KAFKA_RETRY_TIMEOUT || '30000');

    this.kafka = new Kafka({
      clientId: config.clientId || 'eth-listener-producer',
      brokers: config.brokers,
      retry: {
        retries: this.maxRetries,
        initialRetryTime: 300,
        maxRetryTime: this.retryTimeout
      }
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 5,
      idempotent: true
    });
  }

  /**
   * Connect to Kafka broker
   */
  async connect(): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] Connecting to Kafka...`);
      await this.producer.connect();
      this.isConnected = true;
      console.log(`[${new Date().toISOString()}] ✓ Successfully connected to Kafka`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${new Date().toISOString()}] ✗ Failed to connect to Kafka:`, errorMessage);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Kafka broker
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      console.log(`[${new Date().toISOString()}] Disconnecting from Kafka...`);
      await this.producer.disconnect();
      this.isConnected = false;
      console.log(`[${new Date().toISOString()}] Disconnected from Kafka`);
    }
  }

  /**
   * Publish a normalized transaction to Kafka
   */
  async publishTransaction(transaction: NormalizedTransaction): Promise<RecordMetadata[]> {
    if (!this.isConnected) {
      throw new Error('Kafka producer is not connected');
    }

    try {
      const message = {
        key: transaction.hash,
        value: transactionToCompactJSON(transaction),
        timestamp: Date.now().toString()
      };

      const result = await this.producer.send({
        topic: this.topic,
        compression: CompressionTypes.GZIP,
        messages: [message]
      });

      console.log(`[${new Date().toISOString()}] Published to Kafka: ${transaction.hash}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${new Date().toISOString()}] Failed to publish transaction ${transaction.hash}:`, errorMessage);
      throw error;
    }
  }

  /**
   * Publish multiple transactions in a batch
   */
  async publishBatch(transactions: NormalizedTransaction[]): Promise<RecordMetadata[]> {
    if (!this.isConnected) {
      throw new Error('Kafka producer is not connected');
    }

    try {
      const messages = transactions.map(tx => ({
        key: tx.hash,
        value: transactionToCompactJSON(tx),
        timestamp: Date.now().toString()
      }));

      const result = await this.producer.send({
        topic: this.topic,
        compression: CompressionTypes.GZIP,
        messages
      });

      console.log(`[${new Date().toISOString()}] Published batch of ${transactions.length} transactions to Kafka`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${new Date().toISOString()}] Failed to publish batch:`, errorMessage);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get the topic name
   */
  getTopic(): string {
    return this.topic;
  }
}
