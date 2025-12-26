"""
Test script for Calldata Parser

Tests the calldata parser using real transaction data from PostgreSQL database.
This script emulates a Spark session and demonstrates the parsing functionality.
"""

import logging
import sys
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, explode, size

# Add parent directory to path for imports
sys.path.insert(0, '/home/ugur/Projects/eth-listener/spark-consumer')

from spark_types.config_types import PostgresConfig
from utils.calldata_parser import CalldataParser

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def create_test_spark_session():
    """
    Create a Spark session for testing with PostgreSQL support
    """
    spark = SparkSession.builder \
        .appName("CalldataParserTest") \
        .config("spark.jars.packages", "org.postgresql:postgresql:42.6.0") \
        .config("spark.driver.memory", "2g") \
        .config("spark.sql.adaptive.enabled", "true") \
        .master("local[*]") \
        .getOrCreate()

    # Reduce log verbosity
    spark.sparkContext.setLogLevel("WARN")

    return spark


def main():
    """
    Main test function
    """
    logger.info("=" * 80)
    logger.info("Testing Calldata Parser with Real Database Data")
    logger.info("=" * 80)

    # Create Spark session
    spark = create_test_spark_session()

    try:
        # Configure PostgreSQL connection
        # Use environment variable or default to postgres (for Docker) or localhost
        import os
        postgres_host = os.getenv("POSTGRES_HOST", "postgres")

        postgres_config = PostgresConfig(
            host=postgres_host,
            port=5432,
            database="ethereum_data",
            user="eth_user",
            password="eth_password",
            table_name="ethereum_transactions_raw"
        )

        jdbc_url = f"jdbc:postgresql://{postgres_config.host}:{postgres_config.port}/{postgres_config.database}"
        jdbc_properties = {
            "user": postgres_config.user,
            "password": postgres_config.password,
            "driver": "org.postgresql.Driver"
        }

        # Read sample transactions from database
        # Filter for transactions with calldata that match known function selectors
        logger.info("\n" + "=" * 80)
        logger.info("Step 1: Reading sample transactions from database")
        logger.info("=" * 80)

        query = """
        (SELECT
            hash,
            from_address as "from",
            to_address as "to",
            data,
            value_wei,
            received_at,
            network
        FROM ethereum_transactions_raw
        WHERE data != '0x'
          AND LENGTH(data) > 10
          AND SUBSTRING(data FROM 1 FOR 10) = '0x7ff36ab5'
        LIMIT 5) as transactions
        """

        transactions_df = spark.read.jdbc(
            url=jdbc_url,
            table=query,
            properties=jdbc_properties
        )

        tx_count = transactions_df.count()
        logger.info(f"Loaded {tx_count} sample transactions")

        if tx_count == 0:
            logger.warning("No transactions found! Make sure the database has data.")
            return

        # Show sample transaction
        logger.info("\nSample transaction (before parsing):")
        transactions_df.select("hash", "from", "to", "data").show(1, truncate=80, vertical=True)

        # Initialize Calldata Parser
        logger.info("\n" + "=" * 80)
        logger.info("Step 2: Loading dimension tables")
        logger.info("=" * 80)

        parser = CalldataParser(spark, postgres_config)
        parser.load_dimension_tables()

        # Show dimension table samples
        logger.info("\nSample from dim_contract:")
        parser.dim_contract.show(5, truncate=False)

        logger.info("\nSample from dim_function:")
        parser.dim_function.show(5, truncate=False)

        logger.info("\nCalldata slices for function 0x7ff36ab5:")
        parser.dim_calldata_slice.filter(
            col("function_selector_lower") == "0x7ff36ab5"
        ).orderBy("start_byte").show(20, truncate=False)

        # Enrich transactions
        logger.info("\n" + "=" * 80)
        logger.info("Step 3: Enriching transactions with contract and function info")
        logger.info("=" * 80)

        enriched_df = parser.enrich_transactions(transactions_df)

        logger.info("\nEnriched transaction details:")
        enriched_df.select(
            "hash",
            "to",
            "contract_protocol",
            "contract_version",
            "function_selector",
            "function_type",
            "function_protocol"
        ).show(truncate=False, vertical=True)

        # Display parsed calldata fields
        logger.info("\n" + "=" * 80)
        logger.info("Step 4: Displaying parsed calldata fields")
        logger.info("=" * 80)

        # Show the parsed fields list
        logger.info("\nParsed calldata fields:")
        enriched_df.select(
            "hash",
            "parsed_fields_list"
        ).show(truncate=False, vertical=True)

        # Explode the parsed fields for better readability
        logger.info("\nDetailed parsed fields:")
        exploded_df = enriched_df.select(
            "hash",
            "function_selector",
            "function_type",
            explode("parsed_fields_list").alias("field")
        ).select(
            "hash",
            "function_selector",
            "function_type",
            col("field.key").alias("field_name"),
            col("field.value").alias("field_value")
        )

        exploded_df.show(50, truncate=False)

        # Summary statistics
        logger.info("\n" + "=" * 80)
        logger.info("Summary Statistics")
        logger.info("=" * 80)

        logger.info(f"\nTotal transactions processed: {tx_count}")

        matched_contracts = enriched_df.filter(col("contract_protocol").isNotNull()).count()
        logger.info(f"Transactions matching known contracts: {matched_contracts}")

        matched_functions = enriched_df.filter(col("function_type").isNotNull()).count()
        logger.info(f"Transactions with known functions: {matched_functions}")

        parsed_tx = enriched_df.filter(size(col("parsed_fields_list")) > 0).count()
        logger.info(f"Transactions with parsed calldata: {parsed_tx}")

        # Show interpretation of one transaction
        logger.info("\n" + "=" * 80)
        logger.info("Example: Interpreting a swapExactETHForTokens transaction")
        logger.info("=" * 80)

        sample_tx = exploded_df.filter(col("function_selector") == "0x7ff36ab5").collect()

        if sample_tx:
            tx_hash = sample_tx[0]["hash"]
            logger.info(f"\nTransaction: {tx_hash}")
            logger.info(f"Function: swapExactETHForTokens (0x7ff36ab5)")
            logger.info("\nParsed parameters:")

            for row in sample_tx:
                field_name = row["field_name"]
                field_value = row["field_value"]

                if field_name == "amountOutMin":
                    amount = int(field_value, 16) if field_value else 0
                    logger.info(f"  - {field_name}: {amount} wei ({amount / 1e18:.6f} tokens)")
                elif field_name == "to":
                    address = f"0x{field_value[-40:]}" if field_value else "N/A"
                    logger.info(f"  - {field_name}: {address}")
                elif field_name == "deadline":
                    deadline = int(field_value, 16) if field_value else 0
                    logger.info(f"  - {field_name}: {deadline}")
                elif field_name == "path_length":
                    path_len = int(field_value, 16) if field_value else 0
                    logger.info(f"  - {field_name}: {path_len} tokens in swap path")
                elif field_name.startswith("path["):
                    address = f"0x{field_value[-40:]}" if field_value else "N/A"
                    logger.info(f"  - {field_name}: {address}")

        logger.info("\n" + "=" * 80)
        logger.info("Test completed successfully!")
        logger.info("=" * 80)

    except Exception as e:
        logger.error(f"Error during test: {e}", exc_info=True)
        raise
    finally:
        spark.stop()
        logger.info("\nSpark session stopped")


if __name__ == "__main__":
    main()