"""
PySpark Kafka Consumer for Ethereum Transactions

This module consumes normalized Ethereum transaction messages from Kafka,
processes them, stores them in PostgreSQL, and logs them to the console.
Messages are automatically committed and deleted after consumption.
"""

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json, expr, current_timestamp, to_timestamp
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, LongType, DecimalType
)
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


# Define schema for normalized transaction
def get_transaction_schema():
    """
    Returns the schema for normalized Ethereum transactions
    matching the NormalizedTransaction interface from TypeScript
    """
    metadata_schema = StructType([
        StructField("receivedAt", StringType(), True),
        StructField("network", StringType(), True),
        StructField("chainId", StringType(), True)
    ])

    return StructType([
        StructField("hash", StringType(), False),
        StructField("blockNumber", LongType(), True),
        StructField("from", StringType(), False),
        StructField("to", StringType(), True),
        StructField("value", StringType(), False),
        StructField("gasLimit", StringType(), False),
        StructField("gasPrice", StringType(), True),
        StructField("maxFeePerGas", StringType(), True),
        StructField("maxPriorityFeePerGas", StringType(), True),
        StructField("data", StringType(), False),
        StructField("nonce", IntegerType(), False),
        StructField("type", IntegerType(), True),
        StructField("chainId", StringType(), False),
        StructField("metadata", metadata_schema, False)
    ])


def create_spark_session(app_name="EthereumKafkaConsumer"):
    """
    Creates and configures a Spark session for Kafka streaming with PostgreSQL support

    Args:
        app_name: Name of the Spark application

    Returns:
        SparkSession: Configured Spark session
    """
    logger.info(f"Creating Spark session: {app_name}")

    # Set log4j configuration file path
    log4j_conf = "/app/log4j.properties"

    spark = SparkSession.builder \
        .appName(app_name) \
        .config("spark.jars.packages",
                "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0,"
                "org.postgresql:postgresql:42.7.1") \
        .config("spark.sql.streaming.checkpointLocation", "/tmp/spark-checkpoint") \
        .config("spark.driver.extraJavaOptions", f"-Dlog4j.configuration=file:{log4j_conf}") \
        .config("spark.executor.extraJavaOptions", f"-Dlog4j.configuration=file:{log4j_conf}") \
        .getOrCreate()

    # Set log level to reduce noise
    spark.sparkContext.setLogLevel("ERROR")

    # Suppress specific Kafka warnings programmatically
    log4j = spark._jvm.org.apache.log4j
    log4j.LogManager.getLogger("org.apache.spark.sql.kafka010.KafkaDataConsumer").setLevel(log4j.Level.ERROR)
    log4j.LogManager.getLogger("org.apache.kafka").setLevel(log4j.Level.ERROR)

    logger.info("Spark session created successfully")
    return spark


def get_postgres_properties():
    """
    Returns PostgreSQL connection properties from environment variables

    Returns:
        dict: PostgreSQL connection properties
    """
    return {
        "user": os.getenv("POSTGRES_USER", "eth_user"),
        "password": os.getenv("POSTGRES_PASSWORD", "eth_password"),
        "driver": "org.postgresql.Driver"
    }


def get_postgres_url():
    """
    Constructs PostgreSQL JDBC URL from environment variables

    Returns:
        str: JDBC connection URL
    """
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "ethereum_data")

    return f"jdbc:postgresql://{host}:{port}/{db}"


def write_to_postgres(batch_df, batch_id):
    """
    Writes a batch of transactions to PostgreSQL using JDBC.
    Uses INSERT ... ON CONFLICT to handle duplicates gracefully.

    Args:
        batch_df: DataFrame containing transaction batch
        batch_id: Batch ID from Spark streaming
    """
    if batch_df.isEmpty():
        logger.info(f"Batch {batch_id}: No records to write")
        return

    record_count = batch_df.count()
    logger.info(f"Batch {batch_id}: Writing {record_count} transactions to PostgreSQL...")

    try:
        # Map DataFrame columns to PostgreSQL table columns
        postgres_df = batch_df.select(
            col("hash"),
            col("blockNumber").alias("block_number"),
            col("block_timestamp"),
            col("transaction_index"),
            col("from").alias("from_address"),
            col("to").alias("to_address"),
            col("value_wei"),
            col("gas_limit"),
            col("gas_price"),
            col("max_fee_per_gas"),
            col("max_priority_fee_per_gas"),
            col("effective_gas_price"),
            col("data"),
            col("nonce"),
            col("tx_type"),
            col("chainId").alias("chain_id"),
            col("status"),
            col("received_at"),
            col("network")
        )

        # Use foreachPartition to handle upserts with ON CONFLICT
        def upsert_partition(partition):
            import psycopg2
            from psycopg2.extras import execute_values

            host = os.getenv("POSTGRES_HOST", "localhost")
            port = os.getenv("POSTGRES_PORT", "5432")
            db = os.getenv("POSTGRES_DB", "ethereum_data")
            user = os.getenv("POSTGRES_USER", "eth_user")
            password = os.getenv("POSTGRES_PASSWORD", "eth_password")

            # Convert partition to list to count and process
            rows = list(partition)
            if not rows:
                return

            conn = psycopg2.connect(
                host=host,
                port=port,
                dbname=db,
                user=user,
                password=password
            )

            try:
                cursor = conn.cursor()

                # Prepare INSERT ... ON CONFLICT DO NOTHING query
                insert_query = """
                    INSERT INTO ethereum_transactions_raw (
                        hash, block_number, block_timestamp, transaction_index,
                        from_address, to_address, value_wei, gas_limit, gas_price,
                        max_fee_per_gas, max_priority_fee_per_gas, effective_gas_price,
                        data, nonce, tx_type, chain_id, status, received_at, network
                    ) VALUES %s
                    ON CONFLICT (hash) DO NOTHING
                """

                execute_values(cursor, insert_query, rows)
                conn.commit()
                cursor.close()

            finally:
                conn.close()

        # Apply upsert to each partition
        postgres_df.rdd.foreachPartition(upsert_partition)

        logger.info(f"Batch {batch_id}: Successfully processed {record_count} transactions (duplicates ignored)")

    except Exception as e:
        logger.error(f"Batch {batch_id}: Error writing to PostgreSQL: {e}")
        raise


def consume_kafka_messages(
    kafka_bootstrap_servers="localhost:9092",
    kafka_topic="blockchain.txs.raw",
    consumer_group_id="spark-eth-consumer"
):
    """
    Consumes Kafka messages, parses transactions, writes to PostgreSQL, and logs to console.
    Messages are automatically committed and deleted after consumption.

    Args:
        kafka_bootstrap_servers: Kafka broker addresses
        kafka_topic: Kafka topic to consume from
        consumer_group_id: Consumer group ID for offset management
    """
    logger.info("Starting Kafka consumer...")
    logger.info(f"Bootstrap servers: {kafka_bootstrap_servers}")
    logger.info(f"Topic: {kafka_topic}")
    logger.info(f"Consumer Group: {consumer_group_id}")
    logger.info(f"PostgreSQL URL: {get_postgres_url()}")

    # Create Spark session
    spark = create_spark_session()

    try:
        # Read from Kafka
        logger.info("Connecting to Kafka...")
        kafka_df = spark \
            .readStream \
            .format("kafka") \
            .option("kafka.bootstrap.servers", kafka_bootstrap_servers) \
            .option("subscribe", kafka_topic) \
            .option("startingOffsets", "earliest") \
            .option("kafka.group.id", consumer_group_id) \
            .option("failOnDataLoss", "false") \
            .option("enable.auto.commit", "true") \
            .option("auto.commit.interval.ms", "1000") \
            .load()

        logger.info("Successfully connected to Kafka stream")

        # Get transaction schema
        transaction_schema = get_transaction_schema()

        # Parse Kafka messages
        # Kafka message structure: key, value, topic, partition, offset, timestamp
        parsed_df = kafka_df \
            .selectExpr("CAST(key AS STRING)", "CAST(value AS STRING)") \
            .select(
                col("key").alias("tx_hash"),
                from_json(col("value"), transaction_schema).alias("transaction")
            ) \
            .select(
                col("transaction.hash").alias("hash"),
                col("transaction.blockNumber").alias("blockNumber"),
                col("transaction.from").alias("from"),
                col("transaction.to").alias("to"),
                col("transaction.value").cast(DecimalType(38, 0)).alias("value_wei"),
                col("transaction.gasLimit").cast(DecimalType(38, 0)).alias("gas_limit"),
                col("transaction.gasPrice").cast(DecimalType(38, 0)).alias("gas_price"),
                col("transaction.maxFeePerGas").cast(DecimalType(38, 0)).alias("max_fee_per_gas"),
                col("transaction.maxPriorityFeePerGas").cast(DecimalType(38, 0)).alias("max_priority_fee_per_gas"),
                expr("NULL").cast(DecimalType(38, 0)).alias("effective_gas_price"),
                col("transaction.data").alias("data"),
                col("transaction.nonce").cast(LongType()).alias("nonce"),
                col("transaction.type").cast("SMALLINT").alias("tx_type"),
                col("transaction.chainId").alias("chainId"),
                expr("NULL").cast("SMALLINT").alias("status"),
                to_timestamp(col("transaction.metadata.receivedAt")).alias("received_at"),
                col("transaction.metadata.network").alias("network"),
                expr("NULL").cast("TIMESTAMP").alias("block_timestamp"),
                expr("NULL").cast("INTEGER").alias("transaction_index")
            )

        logger.info("Starting streaming query...")

        # Write to PostgreSQL using foreachBatch for efficient batch processing
        query = parsed_df \
            .writeStream \
            .outputMode("append") \
            .foreachBatch(write_to_postgres) \
            .option("checkpointLocation", "/tmp/spark-checkpoint-postgres") \
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
        logger.info("Stopping Spark session...")
        spark.stop()
        logger.info("Spark session stopped. Goodbye!")


if __name__ == "__main__":
    import os

    # Read configuration from environment variables
    kafka_brokers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    kafka_topic = os.getenv("KAFKA_TOPIC", "blockchain.txs.raw")
    consumer_group = os.getenv("CONSUMER_GROUP_ID", "spark-eth-consumer")

    # Start consuming
    consume_kafka_messages(
        kafka_bootstrap_servers=kafka_brokers,
        kafka_topic=kafka_topic,
        consumer_group_id=consumer_group
    )