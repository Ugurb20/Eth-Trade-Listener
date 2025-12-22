"""
Client modules for Spark Kafka Consumer

This module exports client classes for managing Spark sessions, Kafka connections,
and PostgreSQL writes.
"""

from .spark_session import SparkSessionManager
from .kafka_stream import KafkaStreamReader
from .postgres_writer import PostgresWriter

__all__ = [
    'SparkSessionManager',
    'KafkaStreamReader',
    'PostgresWriter'
]
