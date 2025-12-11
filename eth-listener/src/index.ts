import 'dotenv/config';
import { EthereumWebSocketListener, TransactionKafkaProducer } from './pub';

/**
 * Main entry point for the Ethereum Listener
 */
async function main(): Promise<void> {
  const websocketUrl = process.env.ETH_WEBSOCKET_URL;
  const kafkaBrokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];

  if (!websocketUrl) {
    console.error('Error: ETH_WEBSOCKET_URL environment variable is not set');
    console.error('Please create a .env file based on .env.example');
    process.exit(1);
  }

  const listener = new EthereumWebSocketListener(websocketUrl);
  const kafkaProducer = new TransactionKafkaProducer({ brokers: kafkaBrokers });

  try {
    // Connect to Kafka
    await kafkaProducer.connect();

    // Set callback to publish transactions to Kafka
    listener.setTransactionCallback(async (transaction) => {
      await kafkaProducer.publishTransaction(transaction);
    });

    // Connect to Ethereum WebSocket and start listening
    await listener.connect();
    await listener.startListening();

    console.log(`[${new Date().toISOString()}] Listener is running... Press Ctrl+C to exit`);

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      console.log(`\n[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);
      await listener.disconnect();
      await kafkaProducer.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to start listener:', errorMessage);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { EthereumWebSocketListener, TransactionKafkaProducer } from './pub';
export * from './docs';
