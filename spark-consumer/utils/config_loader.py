"""
Configuration loader for Spark Kafka Consumer

Loads configuration from environment variables.
"""

import os
import logging
from spark_types.config_types import (
    SparkConsumerConfig,
    KafkaConfig,
    PostgresConfig,
    EnvironmentConfig
)

logger = logging.getLogger(__name__)


def load_config_from_env() -> SparkConsumerConfig:
    """
    Loads configuration from environment variables

    Returns:
        SparkConsumerConfig: Fully populated configuration object

    Raises:
        ValueError: If required environment variables are missing
    """
    # Kafka configuration
    kafka_bootstrap = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
    if not kafka_bootstrap:
        raise ValueError("KAFKA_BOOTSTRAP_SERVERS environment variable is required")

    kafka_config = KafkaConfig(
        bootstrap_servers=kafka_bootstrap,
        topic=os.getenv("KAFKA_TOPIC", "blockchain.txs.raw"),
        consumer_group_id=os.getenv("CONSUMER_GROUP_ID", "spark-eth-consumer"),
        starting_offsets=os.getenv("KAFKA_STARTING_OFFSETS", "earliest"),
        auto_commit_enabled=os.getenv("KAFKA_AUTO_COMMIT", "true").lower() == "true",
        auto_commit_interval_ms=int(os.getenv("KAFKA_AUTO_COMMIT_INTERVAL_MS", "1000")),
        fail_on_data_loss=os.getenv("KAFKA_FAIL_ON_DATA_LOSS", "false").lower() == "true"
    )

    # PostgreSQL configuration
    postgres_config = PostgresConfig(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        database=os.getenv("POSTGRES_DB", "ethereum_data"),
        user=os.getenv("POSTGRES_USER", "eth_user"),
        password=os.getenv("POSTGRES_PASSWORD", "eth_password"),
        table_name=os.getenv("POSTGRES_TABLE", "ethereum_transactions_raw")
    )

    # Spark configuration
    spark_config = SparkConsumerConfig(
        app_name=os.getenv("SPARK_APP_NAME", "EthereumKafkaConsumer"),
        kafka=kafka_config,
        postgres=postgres_config,
        checkpoint_location=os.getenv("SPARK_CHECKPOINT_LOCATION", "/tmp/spark-checkpoint"),
        postgres_checkpoint_location=os.getenv(
            "SPARK_POSTGRES_CHECKPOINT_LOCATION",
            "/tmp/spark-checkpoint-postgres"
        ),
        log4j_config_path=os.getenv("LOG4J_CONFIG_PATH", "/app/log4j.properties"),
        spark_log_level=os.getenv("SPARK_LOG_LEVEL", "ERROR")
    )

    logger.info("Configuration loaded from environment variables")
    logger.info(f"Kafka: {kafka_config.bootstrap_servers} -> {kafka_config.topic}")
    logger.info(f"PostgreSQL: {postgres_config.jdbc_url}")
    logger.info(f"Consumer Group: {kafka_config.consumer_group_id}")

    return spark_config
