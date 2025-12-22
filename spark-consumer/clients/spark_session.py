"""
Spark Session Manager for Kafka Consumer

Handles creation and configuration of Spark sessions for streaming applications.
"""

import logging
from pyspark.sql import SparkSession
from typing import Optional

from spark_types.config_types import SparkConsumerConfig

logger = logging.getLogger(__name__)


class SparkSessionManager:
    """
    Manages Spark session lifecycle and configuration
    """

    def __init__(self, config: SparkConsumerConfig):
        """
        Initialize Spark Session Manager

        Args:
            config: Spark consumer configuration
        """
        self.config = config
        self.spark: Optional[SparkSession] = None

    def create_session(self) -> SparkSession:
        """
        Creates and configures a Spark session for Kafka streaming with PostgreSQL support

        Returns:
            SparkSession: Configured Spark session
        """
        logger.info(f"Creating Spark session: {self.config.app_name}")

        self.spark = SparkSession.builder \
            .appName(self.config.app_name) \
            .config("spark.jars.packages",
                    "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0,"
                    "org.postgresql:postgresql:42.7.1") \
            .config("spark.sql.streaming.checkpointLocation", self.config.checkpoint_location) \
            .config("spark.driver.extraJavaOptions",
                    f"-Dlog4j.configuration=file:{self.config.log4j_config_path}") \
            .config("spark.executor.extraJavaOptions",
                    f"-Dlog4j.configuration=file:{self.config.log4j_config_path}") \
            .getOrCreate()

        # Set log level to reduce noise
        self.spark.sparkContext.setLogLevel(self.config.spark_log_level)

        # Suppress specific Kafka warnings programmatically
        self._suppress_kafka_logs()

        logger.info("Spark session created successfully")
        return self.spark

    def _suppress_kafka_logs(self) -> None:
        """
        Suppress noisy Kafka and Spark logs
        """
        if not self.spark:
            return

        try:
            log4j = self.spark._jvm.org.apache.log4j
            log4j.LogManager.getLogger(
                "org.apache.spark.sql.kafka010.KafkaDataConsumer"
            ).setLevel(log4j.Level.ERROR)
            log4j.LogManager.getLogger("org.apache.kafka").setLevel(log4j.Level.ERROR)
        except Exception as e:
            logger.warning(f"Could not suppress Kafka logs: {e}")

    def get_session(self) -> Optional[SparkSession]:
        """
        Get the current Spark session

        Returns:
            SparkSession or None if not created
        """
        return self.spark

    def stop(self) -> None:
        """
        Stop the Spark session gracefully
        """
        if self.spark:
            logger.info("Stopping Spark session...")
            self.spark.stop()
            logger.info("Spark session stopped")
            self.spark = None
