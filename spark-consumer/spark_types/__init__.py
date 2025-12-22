"""
Type definitions for Spark Kafka Consumer

This module exports all type definitions used across the Spark consumer application.
"""

from .config_types import (
    SparkConsumerConfig,
    KafkaConfig,
    PostgresConfig,
    EnvironmentConfig
)
from .transaction_types import (
    TransactionMetadata,
    NormalizedTransaction
)

__all__ = [
    # Configuration types
    'SparkConsumerConfig',
    'KafkaConfig',
    'PostgresConfig',
    'EnvironmentConfig',

    # Transaction types
    'TransactionMetadata',
    'NormalizedTransaction'
]
