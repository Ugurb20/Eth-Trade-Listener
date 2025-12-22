"""
Configuration type definitions for Spark Kafka Consumer
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class KafkaConfig:
    """
    Configuration for Kafka connection
    """
    bootstrap_servers: str
    topic: str
    consumer_group_id: str
    starting_offsets: str = "earliest"
    auto_commit_enabled: bool = True
    auto_commit_interval_ms: int = 1000
    fail_on_data_loss: bool = False


@dataclass
class PostgresConfig:
    """
    Configuration for PostgreSQL connection
    """
    host: str
    port: int
    database: str
    user: str
    password: str
    table_name: str = "ethereum_transactions_raw"

    @property
    def jdbc_url(self) -> str:
        """Construct JDBC URL"""
        return f"jdbc:postgresql://{self.host}:{self.port}/{self.database}"

    @property
    def jdbc_properties(self) -> dict:
        """Get JDBC connection properties"""
        return {
            "user": self.user,
            "password": self.password,
            "driver": "org.postgresql.Driver"
        }


@dataclass
class SparkConsumerConfig:
    """
    Main configuration for Spark Kafka Consumer
    """
    app_name: str = "EthereumKafkaConsumer"
    kafka: Optional[KafkaConfig] = None
    postgres: Optional[PostgresConfig] = None
    checkpoint_location: str = "/tmp/spark-checkpoint"
    postgres_checkpoint_location: str = "/tmp/spark-checkpoint-postgres"
    log4j_config_path: str = "/app/log4j.properties"
    spark_log_level: str = "ERROR"


@dataclass
class EnvironmentConfig:
    """
    Environment variable mapping for configuration
    """
    # Kafka environment variables
    KAFKA_BOOTSTRAP_SERVERS: str
    KAFKA_TOPIC: str = "blockchain.txs.raw"
    CONSUMER_GROUP_ID: str = "spark-eth-consumer"

    # PostgreSQL environment variables
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "ethereum_data"
    POSTGRES_USER: str = "eth_user"
    POSTGRES_PASSWORD: str = "eth_password"
    POSTGRES_TABLE: str = "ethereum_transactions_raw"

    # Spark configuration
    SPARK_APP_NAME: str = "EthereumKafkaConsumer"
    SPARK_LOG_LEVEL: str = "ERROR"