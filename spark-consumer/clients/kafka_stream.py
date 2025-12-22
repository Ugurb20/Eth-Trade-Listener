"""
Kafka Stream Reader for Ethereum Transactions

Handles reading and parsing transactions from Kafka using Spark Structured Streaming.
"""

import logging
from pyspark.sql import SparkSession, DataFrame
from pyspark.sql.functions import col, from_json, expr, to_timestamp
from pyspark.sql.types import DecimalType, LongType

from spark_types.config_types import KafkaConfig
from spark_types.transaction_types import get_transaction_schema

logger = logging.getLogger(__name__)


class KafkaStreamReader:
    """
    Reads and parses Ethereum transactions from Kafka stream
    """

    def __init__(self, spark: SparkSession, kafka_config: KafkaConfig):
        """
        Initialize Kafka Stream Reader

        Args:
            spark: Active Spark session
            kafka_config: Kafka configuration
        """
        self.spark = spark
        self.kafka_config = kafka_config
        self.transaction_schema = get_transaction_schema()

    def read_stream(self) -> DataFrame:
        """
        Creates a streaming DataFrame from Kafka topic

        Returns:
            DataFrame: Raw Kafka stream with key, value, metadata
        """
        logger.info("Connecting to Kafka...")
        logger.info(f"Bootstrap servers: {self.kafka_config.bootstrap_servers}")
        logger.info(f"Topic: {self.kafka_config.topic}")
        logger.info(f"Consumer Group: {self.kafka_config.consumer_group_id}")

        kafka_df = self.spark \
            .readStream \
            .format("kafka") \
            .option("kafka.bootstrap.servers", self.kafka_config.bootstrap_servers) \
            .option("subscribe", self.kafka_config.topic) \
            .option("startingOffsets", self.kafka_config.starting_offsets) \
            .option("kafka.group.id", self.kafka_config.consumer_group_id) \
            .option("failOnDataLoss", str(self.kafka_config.fail_on_data_loss).lower()) \
            .option("enable.auto.commit", str(self.kafka_config.auto_commit_enabled).lower()) \
            .option("auto.commit.interval.ms", str(self.kafka_config.auto_commit_interval_ms)) \
            .load()

        logger.info("Successfully connected to Kafka stream")
        return kafka_df

    def parse_transactions(self, kafka_df: DataFrame) -> DataFrame:
        """
        Parses Kafka messages into normalized transaction records

        Args:
            kafka_df: Raw Kafka DataFrame

        Returns:
            DataFrame: Parsed and transformed transaction DataFrame
        """
        # Parse Kafka messages
        # Kafka message structure: key, value, topic, partition, offset, timestamp
        parsed_df = kafka_df \
            .selectExpr("CAST(key AS STRING)", "CAST(value AS STRING)") \
            .select(
                col("key").alias("tx_hash"),
                from_json(col("value"), self.transaction_schema).alias("transaction")
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

        return parsed_df
