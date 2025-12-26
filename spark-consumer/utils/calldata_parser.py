"""
Calldata Parser for Ethereum Transactions

Parses transaction calldata using dimension table rules (dim_function, dim_calldata_slice).
Supports dynamic transaction parsing for known DeFi protocols.
"""

import logging
from typing import Dict, List, Optional
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, lower, substring, length, when, lit,
    struct, array, collect_list, expr, hex as spark_hex,
    udf
)
from pyspark.sql.types import StringType, MapType, StructType, StructField, ArrayType

logger = logging.getLogger(__name__)


class CalldataParser:
    """
    Parses transaction calldata using dimension tables for known protocols
    """

    def __init__(self, spark: SparkSession, postgres_config):
        """
        Initialize Calldata Parser

        Args:
            spark: Active Spark session
            postgres_config: PostgreSQL configuration for reading dimension tables
        """
        self.spark = spark
        self.postgres_config = postgres_config
        self.jdbc_url = f"jdbc:postgresql://{postgres_config.host}:{postgres_config.port}/{postgres_config.database}"

        # Cache dimension tables
        self.dim_contract = None
        self.dim_function = None
        self.dim_calldata_slice = None

    def load_dimension_tables(self):
        """
        Load dimension tables from PostgreSQL into Spark DataFrames
        """
        logger.info("Loading dimension tables from PostgreSQL...")

        jdbc_properties = {
            "user": self.postgres_config.user,
            "password": self.postgres_config.password,
            "driver": "org.postgresql.Driver"
        }

        # Load dim_contract
        self.dim_contract = self.spark.read.jdbc(
            url=self.jdbc_url,
            table="dim_contract",
            properties=jdbc_properties
        ).select(
            lower(col("contract_address")).alias("contract_address_lower"),
            col("protocol"),
            col("version"),
            col("pairname")
        ).cache()

        # Load dim_function
        self.dim_function = self.spark.read.jdbc(
            url=self.jdbc_url,
            table="dim_function",
            properties=jdbc_properties
        ).select(
            lower(col("function_selector")).alias("function_selector_lower"),
            col("protocol"),
            col("function_type")
        ).cache()

        # Load dim_calldata_slice
        self.dim_calldata_slice = self.spark.read.jdbc(
            url=self.jdbc_url,
            table="dim_calldata_slice",
            properties=jdbc_properties
        ).select(
            lower(col("function_selector")).alias("function_selector_lower"),
            col("field_name"),
            col("start_byte"),
            col("length_bytes"),
            col("is_dynamic"),
            col("token_direction")
        ).cache()

        contract_count = self.dim_contract.count()
        function_count = self.dim_function.count()
        slice_count = self.dim_calldata_slice.count()

        logger.info(f"Loaded {contract_count} contracts, {function_count} functions, {slice_count} calldata slices")

    def enrich_with_contract_info(self, df: DataFrame) -> DataFrame:
        """
        Enriches transactions with contract information from dim_contract

        Matches on to_address (most common case for contract interactions)

        Args:
            df: DataFrame with transaction data

        Returns:
            DataFrame with additional contract information columns
        """
        if self.dim_contract is None:
            self.load_dimension_tables()

        # Join on to_address to get contract information
        enriched_df = df.alias("tx").join(
            self.dim_contract.alias("contract"),
            lower(col("tx.to")) == col("contract.contract_address_lower"),
            "left"
        ).select(
            col("tx.*"),
            col("contract.protocol").alias("contract_protocol"),
            col("contract.version").alias("contract_version"),
            col("contract.pairname").alias("contract_pairname")
        )

        return enriched_df

    def enrich_with_function_info(self, df: DataFrame) -> DataFrame:
        """
        Enriches transactions with function information from dim_function

        Extracts function selector (first 10 chars of data) and matches with dim_function

        Args:
            df: DataFrame with transaction data

        Returns:
            DataFrame with additional function information columns
        """
        if self.dim_function is None:
            self.load_dimension_tables()

        # Extract function selector from calldata
        df_with_selector = df.withColumn(
            "function_selector",
            when(
                (col("data").isNotNull()) & (length(col("data")) >= 10),
                lower(substring(col("data"), 1, 10))
            ).otherwise(lit(None))
        )

        # Join with dim_function to get function metadata
        enriched_df = df_with_selector.alias("tx").join(
            self.dim_function.alias("func"),
            col("tx.function_selector") == col("func.function_selector_lower"),
            "left"
        ).select(
            col("tx.*"),
            col("func.protocol").alias("function_protocol"),
            col("func.function_type").alias("function_type")
        )

        return enriched_df

    def parse_calldata_field(self, data: str, start_byte: int, length_bytes: int) -> Optional[str]:
        """
        Parse a single field from calldata

        Args:
            data: Full calldata hex string (with 0x prefix)
            start_byte: Starting byte position
            length_bytes: Number of bytes to extract

        Returns:
            Extracted hex value or None if invalid
        """
        if not data or data == "0x" or len(data) < 2:
            return None

        # Convert byte position to character position (each byte = 2 hex chars)
        # +1 for the '0x' prefix
        start_char = start_byte * 2 + 2
        end_char = start_char + (length_bytes * 2)

        if len(data) < end_char:
            return None

        # Extract and return with 0x prefix
        extracted = data[start_char:end_char]
        return f"0x{extracted}"

    def parse_calldata_fields(self, df: DataFrame) -> DataFrame:
        """
        Parses calldata fields based on dim_calldata_slice rules using broadcast UDF

        Creates an array column 'parsed_fields_list' with parsed field entries

        Args:
            df: DataFrame with transaction data and function_selector column

        Returns:
            DataFrame with parsed_fields_list array column
        """
        if self.dim_calldata_slice is None:
            self.load_dimension_tables()

        # Ensure function_selector exists
        if "function_selector" not in df.columns:
            df = df.withColumn(
                "function_selector",
                when(
                    (col("data").isNotNull()) & (length(col("data")) >= 10),
                    lower(substring(col("data"), 1, 10))
                ).otherwise(lit(None))
            )

        # Collect slice rules into a dictionary for broadcasting
        slice_rules = self.dim_calldata_slice.select(
            "function_selector_lower", "field_name", "start_byte", "length_bytes"
        ).collect()

        # Build a lookup dictionary: function_selector -> list of (field_name, start_byte, length_bytes)
        slice_rules_dict = {}
        for row in slice_rules:
            selector = row.function_selector_lower
            if selector not in slice_rules_dict:
                slice_rules_dict[selector] = []
            slice_rules_dict[selector].append({
                'field_name': row.field_name,
                'start_byte': row.start_byte,
                'length_bytes': row.length_bytes
            })

        # Broadcast the slice rules
        broadcast_rules = self.spark.sparkContext.broadcast(slice_rules_dict)

        # Helper function to clean up parsed values
        def clean_value(field_name, raw_hex):
            """
            Clean up parsed values based on field type

            - Addresses: extract last 20 bytes (40 hex chars)
            - Amounts: remove leading zeros
            - Numbers: convert to decimal string
            """
            field_lower = field_name.lower()

            # Address fields: to, from, recipient, token, path[n]
            if any(x in field_lower for x in ['to', 'from', 'recipient', 'token', 'address', 'path[']):
                # Extract last 20 bytes (40 hex chars) for addresses
                if len(raw_hex) >= 40:
                    return f"0x{raw_hex[-40:]}"
                return f"0x{raw_hex}"

            # Numeric fields: deadline, length, index, offset, count
            elif any(x in field_lower for x in ['deadline', 'length', 'offset', 'index', 'count']):
                # Convert to decimal integer
                try:
                    return str(int(raw_hex, 16))
                except:
                    return f"0x{raw_hex}"

            # Amount fields: remove ALL leading zeros
            elif any(x in field_lower for x in ['amount', 'value', 'price', 'fee', 'min', 'max']):
                # Strip all leading zeros from the hex string
                cleaned = raw_hex.lstrip('0') or '0'
                return f"0x{cleaned}"

            # Default: return as-is
            else:
                return f"0x{raw_hex}"

        # Create UDF to parse all fields for a transaction
        def parse_all_fields(data, function_selector):
            """Parse all fields for a single transaction"""
            if not data or not function_selector or data == "0x":
                return []

            rules = broadcast_rules.value.get(function_selector, [])
            if not rules:
                return []

            parsed_fields = []
            for rule in rules:
                field_name = rule['field_name']
                start_byte = rule['start_byte']
                length_bytes = rule['length_bytes']

                # Extract field
                start_char = start_byte * 2 + 2
                end_char = start_char + (length_bytes * 2)

                if len(data) >= end_char:
                    extracted = data[start_char:end_char]
                    # Clean up the value based on field type
                    field_value = clean_value(field_name, extracted)
                    parsed_fields.append({'key': field_name, 'value': field_value})

            return parsed_fields

        # Define return type for UDF
        from pyspark.sql.types import ArrayType, StructType, StructField
        parsed_fields_schema = ArrayType(
            StructType([
                StructField("key", StringType(), True),
                StructField("value", StringType(), True)
            ])
        )

        parse_udf = udf(parse_all_fields, parsed_fields_schema)

        # Apply UDF to parse fields
        result_df = df.withColumn(
            "parsed_fields_list",
            parse_udf(col("data"), col("function_selector"))
        )

        return result_df

    def enrich_transactions(self, df: DataFrame) -> DataFrame:
        """
        Complete enrichment pipeline: adds contract info, function info, and parsed calldata

        Args:
            df: DataFrame with raw transaction data

        Returns:
            DataFrame enriched with:
            - contract_protocol, contract_version, contract_pairname
            - function_selector, function_protocol, function_type
            - parsed_calldata (map of field names to values)
        """
        logger.info("Starting transaction enrichment...")

        # Step 1: Enrich with contract information
        df = self.enrich_with_contract_info(df)

        # Step 2: Enrich with function information
        df = self.enrich_with_function_info(df)

        # Step 3: Parse calldata fields
        df = self.parse_calldata_fields(df)

        logger.info("Transaction enrichment completed")

        return df