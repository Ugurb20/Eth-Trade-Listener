"""
PySpark Kafka Consumer for Ethereum Transactions

This module consumes normalized Ethereum transaction messages from Kafka,
processes them, stores them in PostgreSQL, and logs them to the console.
Messages are automatically committed and deleted after consumption.

Modular structure:
- types/: Type definitions and schemas
- clients/: Spark, Kafka, and PostgreSQL clients
- utils/: Pure utility functions for mapping and configuration
"""

import logging

from clients import SparkSessionManager, KafkaStreamReader, PostgresWriter
from utils import load_config_from_env

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def main():
    """
    Main entry point for Spark Kafka consumer
    """
    logger.info("Starting Ethereum Kafka Consumer...")

    # Load configuration from environment variables
    config = load_config_from_env()

    # Initialize Spark Session Manager
    spark_manager = SparkSessionManager(config)
    spark = spark_manager.create_session()

    try:
        # Initialize Kafka Stream Reader with calldata parsing support
        kafka_reader = KafkaStreamReader(spark, config.kafka, config.postgres)

        # Read and parse Kafka stream with calldata parsing enabled
        kafka_df = kafka_reader.read_stream()
        parsed_df = kafka_reader.parse_transactions(kafka_df, enable_calldata_parsing=True)

        # Initialize PostgreSQL Writer
        postgres_writer = PostgresWriter(config.postgres)

        logger.info("Starting streaming query...")

        # Write to PostgreSQL using foreachBatch for efficient batch processing
        query = parsed_df \
            .writeStream \
            .outputMode("append") \
            .foreachBatch(postgres_writer.write_batch) \
            .option("checkpointLocation", config.postgres_checkpoint_location) \
            .start()

        logger.info("Streaming query started. Consuming messages and writing to PostgreSQL...")
        logger.info("Press Ctrl+C to stop")

        # Wait for termination
        query.awaitTermination()

    except KeyboardInterrupt:
        logger.info("\nReceived shutdown signal. Stopping gracefully...")
    except Exception as e:
        logger.error(f"Error during Kafka consumption: {e}")
        raise
    finally:
        spark_manager.stop()
        logger.info("Goodbye!")


if __name__ == "__main__":
    main()
