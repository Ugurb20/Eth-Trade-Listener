"""
PostgreSQL Writer Client for Spark Kafka Consumer

Handles batch writing of transactions to PostgreSQL with upsert logic.
Supports both raw transactions and decoded transactions tables.
"""

import logging
import json
from pyspark.sql import DataFrame
from pyspark.sql.functions import col, udf
from pyspark.sql.types import StringType
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

        # Deduplicate rows by hash (keep last occurrence)
        # This prevents potential issues with duplicate hashes in the same partition
        seen_hashes = {}
        for row in rows:
            hash_value = row[0]  # hash is the first column
            seen_hashes[hash_value] = row

        # Use deduplicated rows
        rows = list(seen_hashes.values())

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

    def _convert_parsed_fields_to_json(self, parsed_fields_list):
        """
        Convert parsed_fields_list (array of structs) to JSON object

        Args:
            parsed_fields_list: List of {key: field_name, value: field_value}

        Returns:
            JSON string representation
        """
        if not parsed_fields_list:
            return None

        # Convert list of {key, value} structs to dict
        result = {}
        for item in parsed_fields_list:
            if item and 'key' in item and 'value' in item:
                result[item['key']] = item['value']

        return json.dumps(result) if result else None

    def _upsert_decoded_partition(self, partition):
        """
        Upserts a partition of decoded records to PostgreSQL using psycopg2

        Uses INSERT ... ON CONFLICT DO UPDATE to handle duplicates.

        Args:
            partition: Iterator of rows to insert
        """
        import psycopg2
        from psycopg2.extras import execute_values

        # Convert partition to list
        rows = list(partition)
        if not rows:
            return

        # Deduplicate rows by hash (keep last occurrence)
        # This prevents "ON CONFLICT DO UPDATE command cannot affect row a second time" error
        seen_hashes = {}
        for row in rows:
            hash_value = row[0]  # hash is the first column
            seen_hashes[hash_value] = row

        # Use deduplicated rows
        rows = list(seen_hashes.values())

        conn = psycopg2.connect(
            host=self.config.host,
            port=self.config.port,
            dbname=self.config.database,
            user=self.config.user,
            password=self.config.password
        )

        try:
            cursor = conn.cursor()

            # Prepare INSERT ... ON CONFLICT DO UPDATE query
            insert_query = """
                INSERT INTO ethereum_transactions_decoded (
                    hash, contract_address, contract_protocol, contract_version,
                    contract_pairname, function_selector, function_type,
                    function_protocol, parsed_fields
                ) VALUES %s
                ON CONFLICT (hash) DO UPDATE SET
                    contract_address = EXCLUDED.contract_address,
                    contract_protocol = EXCLUDED.contract_protocol,
                    contract_version = EXCLUDED.contract_version,
                    contract_pairname = EXCLUDED.contract_pairname,
                    function_selector = EXCLUDED.function_selector,
                    function_type = EXCLUDED.function_type,
                    function_protocol = EXCLUDED.function_protocol,
                    parsed_fields = EXCLUDED.parsed_fields,
                    decoded_at = NOW()
            """

            execute_values(cursor, insert_query, rows)
            conn.commit()
            cursor.close()

        finally:
            conn.close()

    def write_batch(self, batch_df: DataFrame, batch_id: int) -> None:
        """
        Writes a batch of transactions to PostgreSQL.
        Writes to both raw and decoded tables if decoded data is present.
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
            # Step 1: Write raw transactions to ethereum_transactions_raw
            postgres_df = map_to_postgres_schema(batch_df)
            postgres_df.rdd.foreachPartition(self._upsert_partition)

            logger.info(
                f"Batch {batch_id}: Successfully processed {record_count} raw transactions "
                f"(duplicates ignored)"
            )

            # Step 2: Write decoded transactions to ethereum_transactions_decoded
            # Only if the batch has decoded data (contract_protocol or function_type columns)
            has_decoded_columns = (
                "contract_protocol" in batch_df.columns or
                "function_type" in batch_df.columns
            )

            if has_decoded_columns:
                # Filter to only decoded transactions (those with enriched metadata)
                decoded_df = batch_df.filter(
                    (col("contract_protocol").isNotNull()) |
                    (col("function_type").isNotNull())
                )

                decoded_count = decoded_df.count()

                if decoded_count > 0:
                    logger.info(f"Batch {batch_id}: Writing {decoded_count} decoded transactions...")

                    # Convert parsed_fields_list to JSONB string
                    convert_to_json_udf = udf(self._convert_parsed_fields_to_json, StringType())

                    # Prepare DataFrame for decoded table
                    prepared_df = decoded_df.select(
                        col("hash"),
                        col("to").alias("contract_address"),
                        col("contract_protocol"),
                        col("contract_version"),
                        col("contract_pairname"),
                        col("function_selector"),
                        col("function_type"),
                        col("function_protocol"),
                        convert_to_json_udf(col("parsed_fields_list")).alias("parsed_fields")
                    )

                    # Write decoded transactions
                    prepared_df.rdd.foreachPartition(self._upsert_decoded_partition)

                    logger.info(
                        f"Batch {batch_id}: Successfully processed {decoded_count} decoded transactions"
                    )
                else:
                    logger.info(f"Batch {batch_id}: No decoded transactions in this batch")

        except Exception as e:
            logger.error(f"Batch {batch_id}: Error writing to PostgreSQL: {e}")
            raise
