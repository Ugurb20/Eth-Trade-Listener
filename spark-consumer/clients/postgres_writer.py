"""
PostgreSQL Writer Client for Spark Kafka Consumer

Handles batch writing of transactions to PostgreSQL with upsert logic.
"""

import logging
from pyspark.sql import DataFrame
from spark_types.config_types import PostgresConfig
from utils.mappers import map_to_postgres_schema

logger = logging.getLogger(__name__)


class PostgresWriter:
    """
    PostgreSQL client for writing transaction batches with upsert logic
    """

    def __init__(self, postgres_config: PostgresConfig):
        """
        Initialize PostgreSQL Writer

        Args:
            postgres_config: PostgreSQL configuration
        """
        self.config = postgres_config

    def _upsert_partition(self, partition):
        """
        Upserts a partition of records to PostgreSQL using psycopg2

        Uses INSERT ... ON CONFLICT DO NOTHING to handle duplicates.

        Args:
            partition: Iterator of rows to insert
        """
        import psycopg2
        from psycopg2.extras import execute_values

        # Convert partition to list to count and process
        rows = list(partition)
        if not rows:
            return

        conn = psycopg2.connect(
            host=self.config.host,
            port=self.config.port,
            dbname=self.config.database,
            user=self.config.user,
            password=self.config.password
        )

        try:
            cursor = conn.cursor()

            # Prepare INSERT ... ON CONFLICT DO NOTHING query
            insert_query = f"""
                INSERT INTO {self.config.table_name} (
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

    def write_batch(self, batch_df: DataFrame, batch_id: int) -> None:
        """
        Writes a batch of transactions to PostgreSQL.
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
            postgres_df = map_to_postgres_schema(batch_df)

            # Apply upsert to each partition using psycopg2
            postgres_df.rdd.foreachPartition(self._upsert_partition)

            logger.info(
                f"Batch {batch_id}: Successfully processed {record_count} transactions "
                f"(duplicates ignored)"
            )

        except Exception as e:
            logger.error(f"Batch {batch_id}: Error writing to PostgreSQL: {e}")
            raise
