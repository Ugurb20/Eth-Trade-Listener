# Spark Kafka Consumer for Ethereum Transactions

PySpark-based Kafka consumer that processes Ethereum transaction messages from the `blockchain.txs.raw` topic and persists them to PostgreSQL. This consumer automatically commits offsets and features a modular architecture similar to the eth-listener.

## Features

- **Real-time streaming**: Consumes Kafka messages using Spark Structured Streaming
- **Auto-commit enabled**: Messages are automatically committed and deleted after consumption
- **Schema validation**: Validates incoming messages against the NormalizedTransaction schema
- **PostgreSQL persistence**: Writes transactions to PostgreSQL with upsert logic
- **Modular architecture**: Clean separation of concerns with types, clients, and utils
- **Fault tolerance**: Checkpoint-based recovery for reliability
- **Docker support**: Containerized deployment with the full stack

## Modular Structure

The spark-consumer follows the same modular architecture as eth-listener:

```
spark-consumer/
├── types/              # Type definitions and schemas
│   ├── __init__.py
│   ├── config_types.py      # Configuration dataclasses
│   └── transaction_types.py # Transaction schemas and types
├── clients/            # Client classes for external services
│   ├── __init__.py
│   ├── spark_session.py     # Spark session management
│   ├── kafka_stream.py      # Kafka stream reader
│   └── postgres_writer.py   # PostgreSQL writer client
├── utils/              # Pure utility functions
│   ├── __init__.py
│   ├── config_loader.py     # Environment config loader
│   └── mappers.py           # Data mapping functions
├── kafka_consumer.py   # Main entry point
└── requirements.txt
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kafka Broker                              │
│              Topic: blockchain.txs.raw                       │
└────────────────────┬────────────────────────────────────────┘
                     │ GZIP compressed messages
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Spark Kafka Consumer                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ SparkSessionManager                                  │   │
│  │  • Creates and configures Spark session             │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ KafkaStreamReader                                    │   │
│  │  • Reads from Kafka using Structured Streaming      │   │
│  │  • Parses JSON messages                             │   │
│  │  • Validates against transaction schema             │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ PostgresWriter                                       │   │
│  │  • Batch writes with upsert logic                   │   │
│  │  • ON CONFLICT DO NOTHING for duplicates            │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │ Processed transactions
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                         │
│  • ethereum_transactions_raw table                          │
│  • Indexed on hash, block_number, addresses                 │
│  • Logs all transaction details                             │
└─────────────────────────────────────────────────────────────┘
```

## Transaction Schema

The consumer expects messages in the following format:

```json
{
  "hash": "0x...",
  "blockNumber": null,
  "from": "0x...",
  "to": "0x...",
  "value": "1000000000000000000",
  "gasLimit": "21000",
  "gasPrice": "50000000000",
  "maxFeePerGas": "60000000000",
  "maxPriorityFeePerGas": "2000000000",
  "data": "0x",
  "nonce": 42,
  "type": 2,
  "chainId": "1",
  "metadata": {
    "receivedAt": "2025-12-13T00:00:00.000Z",
    "network": "mainnet",
    "chainId": "1"
  }
}
```

## Setup

### Option 1: Docker (Recommended)

Run the entire stack including the Spark consumer:

```bash
cd eth-listener
docker-compose up -d
```

This starts:
- **Zookeeper** (port 2181)
- **Kafka** (port 9092)
- **Kafka UI** (port 8080)
- **eth-listener** - Transaction producer
- **spark-consumer** - PySpark Kafka consumer

### Option 2: Local Development

1. **Install dependencies**:
```bash
cd spark-consumer
pip install -r requirements.txt
```

2. **Ensure Kafka is running**:
```bash
cd ../eth-listener
docker-compose up -d zookeeper kafka
```

3. **Run the consumer**:
```bash
python kafka_consumer.py
```

## Configuration

Configure via environment variables:

```bash
# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS=localhost:9092  # Kafka broker address
KAFKA_TOPIC=blockchain.txs.raw          # Topic to consume from
CONSUMER_GROUP_ID=spark-eth-consumer    # Consumer group ID
```

## How It Works

### 1. Connection
The consumer connects to Kafka using Spark Structured Streaming and subscribes to the `blockchain.txs.raw` topic.

### 2. Message Consumption
- Reads messages from the earliest offset (configurable)
- Auto-commit is **enabled** with 1-second interval
- Messages are committed and removed from the topic after processing

### 3. Parsing
Each Kafka message is parsed:
- **Key**: Transaction hash
- **Value**: JSON-encoded NormalizedTransaction

### 4. Schema Validation
Messages are validated against the transaction schema. Invalid messages are logged as errors.

### 5. Output
Transactions are logged to the console showing:
- Transaction hash
- From/To addresses
- Value transferred
- Gas details
- Network metadata

### 6. Offset Management
- **Auto-commit enabled**: Offsets are committed every 1 second
- Consumer group: `spark-eth-consumer`
- Messages are deleted after consumption (Kafka retention policy applies)

## Monitoring

### View Consumer Output

Using Docker:
```bash
docker logs -f spark-eth-consumer
```

### Monitor Kafka UI

Access Kafka UI at http://localhost:8080 to:
- View consumer groups
- Check lag and offsets
- Monitor message throughput

### Consumer Group Details

Check consumer group status:
```bash
docker exec -it eth-listener-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group spark-eth-consumer \
  --describe
```

## Auto-Commit Behavior

This consumer uses **auto-commit mode**:

```python
.option("enable.auto.commit", "true")
.option("auto.commit.interval.ms", "1000")
```

- Offsets are committed every **1 second**
- Messages are marked as consumed and will be deleted based on Kafka's retention policy
- If the consumer crashes, it will resume from the last committed offset

## Example Output

```
-------------------------------------------
Batch: 0
-------------------------------------------
+------------------------------------------------------------------+------------------------------------------------------------------+--------------------+--------------------+-------------------+---------+--------------+...
|tx_hash                                                           |hash                                                              |from                |to                  |value              |gasLimit |gasPrice      |...
+------------------------------------------------------------------+------------------------------------------------------------------+--------------------+--------------------+-------------------+---------+--------------+...
|0x1234...                                                         |0x1234...                                                         |0xabcd...           |0xef01...           |1000000000000000000|21000    |50000000000   |...
+------------------------------------------------------------------+------------------------------------------------------------------+--------------------+--------------------+-------------------+---------+--------------+...
```

## Stopping the Consumer

### Docker:
```bash
docker-compose down
```

### Local:
Press `Ctrl+C` to stop gracefully.

## Troubleshooting

### Consumer not receiving messages

1. **Check if producer is running**:
```bash
docker logs eth-listener-service
```

2. **Verify topic exists**:
```bash
docker exec -it eth-listener-kafka kafka-topics \
  --bootstrap-server localhost:9092 \
  --list
```

3. **Check consumer group lag**:
```bash
docker exec -it eth-listener-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group spark-eth-consumer \
  --describe
```

### Reset consumer offset (start from beginning)

```bash
docker exec -it eth-listener-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group spark-eth-consumer \
  --reset-offsets \
  --to-earliest \
  --topic blockchain.txs.raw \
  --execute
```

## Dependencies

- **PySpark 3.5.0**: Spark SQL and streaming engine
- **Java 17**: Required for Spark
- **Kafka 0.10+ connector**: Built-in Spark Kafka integration

## Future Enhancements

- Add data transformation and aggregation
- Write to databases (PostgreSQL, MongoDB)
- Stream to data lakes (S3, HDFS)
- Add metrics and monitoring (Prometheus)
- Implement custom processing logic