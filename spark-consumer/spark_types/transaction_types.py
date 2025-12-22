"""
Transaction type definitions for Spark Kafka Consumer

These types match the NormalizedTransaction interface from the TypeScript listener.
"""

from dataclasses import dataclass
from typing import Optional
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, LongType, DecimalType
)


@dataclass
class TransactionMetadata:
    """
    Metadata about the transaction capture
    """
    received_at: str  # ISO 8601 timestamp
    network: str
    chain_id: str


@dataclass
class NormalizedTransaction:
    """
    Normalized transaction payload from Kafka

    Matches the TypeScript NormalizedTransaction interface
    """
    hash: str
    block_number: Optional[int]
    from_address: str
    to_address: Optional[str]
    value: str  # Wei as string
    gas_limit: str
    gas_price: Optional[str]
    max_fee_per_gas: Optional[str]
    max_priority_fee_per_gas: Optional[str]
    data: str
    nonce: int
    tx_type: Optional[int]
    chain_id: str
    metadata: TransactionMetadata


def get_transaction_schema() -> StructType:
    """
    Returns the PySpark schema for normalized Ethereum transactions.

    This schema matches the NormalizedTransaction interface from TypeScript.

    Returns:
        StructType: Spark SQL schema for transaction parsing
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