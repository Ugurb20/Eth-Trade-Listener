"""
Data mapping functions for Spark Kafka Consumer

Pure functions for transforming data between different schemas.
"""

from pyspark.sql import DataFrame
from pyspark.sql.functions import col


def map_to_postgres_schema(batch_df: DataFrame) -> DataFrame:
    """
    Maps DataFrame columns to PostgreSQL table schema

    This is a pure transformation function that maps the parsed transaction
    DataFrame to match the PostgreSQL table column names.

    Args:
        batch_df: Input DataFrame with transaction data from Kafka

    Returns:
        DataFrame: Mapped DataFrame with PostgreSQL column names
    """
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

    return postgres_df
