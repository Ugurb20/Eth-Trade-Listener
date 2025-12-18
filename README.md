# Ethereum Transaction Listener

Real-time Ethereum transaction monitoring and analytics platform that captures pending transactions from the mempool, streams them through Kafka, and persists them to PostgreSQL for analysis.

## Overview

This system provides end-to-end infrastructure for monitoring Ethereum transactions in real-time:

- **TypeScript Listener** - Captures pending transactions from Ethereum mempool via WebSocket
- **Kafka Streaming** - Distributes transaction events with guaranteed delivery
- **PySpark Consumer** - Processes and validates transactions using Spark Structured Streaming
- **PostgreSQL Storage** - Persists transactions with full indexing for efficient querying

Perfect for MEV analysis, transaction monitoring, wallet tracking, DeFi analytics, and blockchain research.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Ethereum Network                          │
│                  (WebSocket Connection)                      │
└────────────────────┬────────────────────────────────────────┘
                     │ Pending Transactions
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              EthereumWebSocketListener                       │
│  • Connects to Ethereum WebSocket RPC                       │
│  • Listens for pending transactions                         │
│  • Fetches full transaction details                         │
│  • Concurrency control & timeout handling                   │
│  • Auto-reconnection with exponential backoff               │
└────────────────────┬────────────────────────────────────────┘
                     │ Raw Transactions
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Transaction Normalizer                          │
│  • Extracts key fields (hash, from, to, value, gas)         │
│  • Adds metadata (timestamp, network, chainId)              │
│  • Converts to JSON payload                                 │
└────────────────────┬────────────────────────────────────────┘
                     │ Normalized Transactions
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            TransactionKafkaProducer                          │
│  • Publishes to Kafka topic                                 │
│  • Message key: transaction hash                            │
│  • Message value: normalized JSON                           │
│  • GZIP compression enabled                                 │
│  • Idempotent producer                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Kafka Broker                              │
│              Topic: blockchain.txs.raw                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Spark Kafka Consumer (PySpark)                  │
│  • Structured Streaming from Kafka                          │
│  • Schema validation & type casting                         │
│  • Batch processing with foreachBatch                       │
│  • Auto-commit enabled (1s interval)                        │
└────────────────────┬────────────────────────────────────────┘
                     │ Validated Transactions
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database                             │
│  • Table: ethereum_transactions_raw                         │
│  • Upsert logic: ON CONFLICT (hash) DO NOTHING              │
│  • Indexed for efficient queries                            │
│  • Supports both pending & confirmed transactions           │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
eth-listener/                         # Root project directory
├── eth-listener/                     # TypeScript listener service
│   ├── src/
│   │   ├── docs/                     # Type definitions
│   │   │   ├── config.types.ts      # Configuration types
│   │   │   ├── transaction.types.ts # Transaction types
│   │   │   ├── normalized.types.ts  # Normalized payload types
│   │   │   ├── kafka.types.ts       # Kafka configuration types
│   │   │   └── index.ts             # Type exports
│   │   │
│   │   ├── pub/                     # Connection management
│   │   │   ├── EthereumWebSocketListener.ts  # WebSocket listener
│   │   │   ├── TransactionKafkaProducer.ts   # Kafka producer
│   │   │   └── index.ts             # Public exports
│   │   │
│   │   ├── utils/                   # Utilities
│   │   │   ├── normalizer.ts        # Transaction normalizer
│   │   │   └── index.ts             # Utility exports
│   │   │
│   │   ├── test/                    # Tests
│   │   │   ├── listener.test.ts     # Integration tests
│   │   │   └── reconnection.test.ts # Reconnection tests
│   │   │
│   │   └── index.ts                 # Main entry point
│   │
│   ├── dist/                        # Compiled JavaScript (generated)
│   ├── Dockerfile                   # Container for listener service
│   ├── tsconfig.json                # TypeScript configuration
│   └── package.json                 # Dependencies & scripts
│
├── spark-consumer/                  # PySpark consumer service
│   ├── kafka_consumer.py            # Spark streaming consumer
│   ├── Dockerfile                   # Container for Spark consumer
│   ├── requirements.txt             # Python dependencies
│   └── README.md                    # Consumer documentation
│
├── postgres/                        # PostgreSQL initialization
│   ├── init.sql                     # Database schema & indexes
│   └── README.md                    # Database documentation
│
├── dim-scraper/                     # Dimension table scraper
│   ├── src/
│   │   ├── scrapers/                # Web scrapers
│   │   │   ├── fourbyte-scraper.ts  # 4byte.directory function signatures
│   │   │   ├── github-scraper.ts    # Official protocol deployments
│   │   │   └── defillama-scraper.ts # DeFi Llama protocol data
│   │   ├── db/                      # Database operations
│   │   │   └── connection.ts        # PostgreSQL connection manager
│   │   ├── types/                   # TypeScript types
│   │   ├── utils/                   # Utilities
│   │   └── index.ts                 # Main scraper entry point
│   ├── Dockerfile                   # Container for scraper
│   ├── package.json                 # Dependencies
│   └── README.md                    # Scraper documentation
│
├── docker-compose.yml               # Multi-service orchestration
├── model.uml                        # PlantUML architecture diagram
├── .env                             # Environment configuration
├── .gitignore                       # Git ignore rules
└── README.md                        # This file
```

## Key Components

### 1. EthereumWebSocketListener (TypeScript)
- Manages WebSocket connection to Ethereum RPC
- Subscribes to pending transactions from mempool
- Fetches full transaction details with concurrency control
- **Auto-reconnection with exponential backoff** for handling disconnects and network issues
- Connection ID tracking to prevent ghost sessions
- Configurable fetch timeout and max concurrent fetches

### 2. TransactionKafkaProducer (TypeScript)
- Connects to Kafka brokers
- Publishes normalized transactions to configured topic
- **Idempotent producer** for exactly-once semantics
- GZIP compression for efficient network usage
- Handles retries with configurable timeouts
- Supports both single and batch publishing

### 3. Transaction Normalizer (TypeScript)
- Extracts essential fields from raw transactions
- Adds metadata (received timestamp, network info)
- Supports both legacy and EIP-1559 transactions
- Outputs clean JSON structure ready for downstream processing

### 4. Spark Kafka Consumer (PySpark)
- Consumes transactions from Kafka using Spark Structured Streaming
- Schema validation and type casting for data quality
- Batch processing via `foreachBatch` for efficient database writes
- Auto-commit enabled (1s interval) for offset management
- Writes to PostgreSQL with upsert logic

### 5. PostgreSQL Database
- Persistent storage for all captured transactions
- Table: `ethereum_transactions_raw`
- Primary key on transaction hash for deduplication
- Indexes on addresses, block numbers, timestamps, and networks
- Supports both pending (mempool) and confirmed transactions

### 6. Dimension Table Scraper (TypeScript)
- Automated web scraper for populating DeFi protocol reference tables
- **Data Sources:**
  - 4byte.directory - Function signature database
  - GitHub - Official protocol deployment addresses
  - DeFi Llama - Protocol metadata and pool contracts
- **Populates:**
  - `dim_contract` - Known DeFi protocol contracts (Uniswap, SushiSwap, Curve, etc.)
  - `dim_function` - Function signatures and selectors
  - `dim_calldata_slice` - Calldata parsing rules for transaction decoding
  - `dim_swap_rule` - Token extraction rules for swap transactions
- Runs once on startup to populate reference tables
- Can be re-run periodically to catch new protocol deployments

## Setup

### Option 1: Docker (Recommended)

This project uses Docker Compose profiles to run specific services. See [docker-profiles.md](docker-profiles.md) for detailed documentation.

**Quick Start - Full Stack:**

```bash
docker-compose --profile full up
```

**Database + Scraper Only:**

```bash
docker-compose --profile scraper up
```

**Database Only:**

```bash
docker-compose --profile db up -d
```

**Available Profiles:**
- `full` - Complete stack (all services)
- `scraper` - PostgreSQL + dim-scraper only
- `db` - PostgreSQL only
- `kafka` - Kafka infrastructure only

**Full Stack Includes:**
- **Zookeeper** (port 2181) - Kafka coordination
- **Kafka** (port 9092) - Message broker
- **Kafka UI** (port 8080) - Web interface at http://localhost:8080
- **PostgreSQL** (port 5432) - Transaction database
- **dim-scraper** - Dimension table scraper (runs once on startup)
- **eth-listener** - Transaction capture service (TypeScript)
- **spark-consumer** - Transaction processor and persistence (PySpark)

**Important Notes:**
- Init script uses `CREATE TABLE IF NOT EXISTS` - safe for existing volumes
- Database volume is bound to `~/Projects/db` - data persists across restarts
- Scraper runs once and exits (restart policy: "no")

### Option 2: Local Development

1. Install dependencies:
```bash
npm install
```

2. Build TypeScript:
```bash
npm run build
```

3. Start infrastructure (Kafka, PostgreSQL):
```bash
docker-compose up -d zookeeper kafka kafka-ui postgres
```

4. Run the listener:
```bash
cd eth-listener
npm run dev
```

5. Run the Spark consumer (in another terminal):
```bash
cd spark-consumer
pip install -r requirements.txt
python kafka_consumer.py
```

## Configuration

Configure via `.env` file:

```env
# Ethereum WebSocket
ETH_WEBSOCKET_URL=wss://ethereum-rpc.publicnode.com

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=blockchain.txs.raw
KAFKA_MAX_RETRIES=3
KAFKA_RETRY_TIMEOUT=30000

# Listener Configuration
MAX_CONCURRENT_FETCHES=10
FETCH_TIMEOUT=5000

# Auto-Reconnection Configuration
AUTO_RECONNECT=true                    # Enable/disable auto-reconnection (default: true)
MAX_RECONNECT_ATTEMPTS=0               # Maximum reconnection attempts, 0 = unlimited (default: 0)
RECONNECT_DELAY=1000                   # Initial delay before reconnection in ms (default: 1000)
MAX_RECONNECT_DELAY=60000             # Maximum delay between reconnection attempts in ms (default: 60000)
RECONNECT_BACKOFF_MULTIPLIER=2        # Exponential backoff multiplier (default: 2)

# Spark Consumer Configuration (auto-configured in docker-compose)
KAFKA_BOOTSTRAP_SERVERS=kafka:29092   # Kafka brokers for Spark consumer
CONSUMER_GROUP_ID=spark-eth-consumer   # Consumer group ID

# PostgreSQL Configuration
POSTGRES_HOST=postgres                 # PostgreSQL host
POSTGRES_PORT=5432                     # PostgreSQL port
POSTGRES_DB=ethereum_data             # Database name
POSTGRES_USER=eth_user                # Database user
POSTGRES_PASSWORD=eth_password        # Database password
```

## Available Scripts

### Development
- `npm run dev` - Run with ts-node (development mode)
- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode for development
- `npm test` - Run tests

### Docker
- `npm run docker:start` - Build and start entire stack
- `npm run docker:up` - Start services in detached mode
- `npm run docker:down` - Stop and remove containers
- `npm run docker:logs` - Follow eth-listener logs
- `npm run docker:restart` - Restart listener service

## Data Flow

### End-to-End Transaction Journey

1. **Capture** (EthereumWebSocketListener - TypeScript)
   - Connects to Ethereum WebSocket RPC
   - Subscribes to `pending` transaction events from mempool
   - Fetches full transaction details with concurrency control
   - Auto-reconnects on disconnect with exponential backoff

2. **Normalize** (TransactionNormalizer - TypeScript)
   - Extracts key fields (hash, from, to, value, gas, etc.)
   - Adds metadata (timestamp, network, chainId)
   - Converts to standardized JSON format

3. **Publish** (TransactionKafkaProducer - TypeScript)
   - Publishes to Kafka topic `blockchain.txs.raw`
   - Uses GZIP compression for efficiency
   - Idempotent producer for exactly-once semantics

4. **Stream** (Spark Kafka Consumer - PySpark)
   - Consumes from Kafka using Structured Streaming
   - Validates schema and casts types
   - Processes in batches via `foreachBatch`

5. **Persist** (PostgreSQL)
   - Writes to `ethereum_transactions_raw` table
   - Upsert logic: `ON CONFLICT (hash) DO NOTHING`
   - Auto-commits Kafka offsets after successful write

6. **Monitor**
   - Kafka UI: http://localhost:8080
   - PostgreSQL: `psql -h localhost -U eth_user -d ethereum_data`

## Normalized Transaction Schema

```json
{
  "hash": "0x...",
  "blockNumber": null,
  "from": "0x...",
  "to": "0x...",
  "value": "1000000000000000000",
  "gasLimit": "21000",
  "gasPrice": "50000000000",
  "data": "0x",
  "nonce": 42,
  "type": 2,
  "chainId": "1",
  "metadata": {
    "receivedAt": "2025-12-12T00:00:00.000Z",
    "network": "mainnet",
    "chainId": "1"
  }
}
```

## Database Schema

The PostgreSQL database stores all captured transactions in the `ethereum_transactions_raw` table:

```sql
-- Primary fields
hash                    TEXT PRIMARY KEY        -- Transaction hash (unique)
block_number            BIGINT                  -- Block number (NULL for pending)
block_timestamp         TIMESTAMPTZ             -- Block timestamp
transaction_index       INTEGER                 -- Position in block

-- Parties
from_address            TEXT NOT NULL           -- Sender address
to_address              TEXT                    -- Recipient (NULL for contract creation)

-- Value and Gas
value_wei               NUMERIC(38, 0) NOT NULL -- Transaction value in wei
gas_limit               NUMERIC(38, 0) NOT NULL
gas_price               NUMERIC(38, 0)          -- Legacy transactions
max_fee_per_gas         NUMERIC(38, 0)          -- EIP-1559
max_priority_fee_per_gas NUMERIC(38, 0)         -- EIP-1559
effective_gas_price     NUMERIC(38, 0)          -- Actual gas price paid

-- Transaction data
data                    TEXT NOT NULL           -- Calldata
nonce                   BIGINT NOT NULL
tx_type                 SMALLINT                -- 0=legacy, 2=EIP-1559
chain_id                TEXT NOT NULL
status                  SMALLINT                -- 1=success, 0=failed (NULL for pending)

-- Metadata
received_at             TIMESTAMPTZ NOT NULL    -- When listener received it
network                 TEXT NOT NULL           -- mainnet, sepolia, etc.
```

### Indexes
- `hash` (PRIMARY KEY)
- `block_number`, `from_address`, `to_address`
- `received_at`, `network`, `chain_id`
- Composite: `(network, received_at DESC)`

## Monitoring

### Kafka UI
http://localhost:8080
- View topics and messages
- Monitor consumer groups and lag
- Check broker health

### PostgreSQL Queries
```bash
# Connect to database
docker exec -it eth-listener-postgres psql -U eth_user -d ethereum_data

# Example queries
SELECT COUNT(*) FROM ethereum_transactions_raw;
SELECT * FROM ethereum_transactions_raw ORDER BY received_at DESC LIMIT 10;
SELECT from_address, COUNT(*) as tx_count FROM ethereum_transactions_raw
  GROUP BY from_address ORDER BY tx_count DESC LIMIT 10;
```

### Service Logs
```bash
# All services
docker-compose logs -f

# Specific services
docker-compose logs -f eth-listener
docker-compose logs -f spark-consumer
docker-compose logs -f postgres
```

## Implementation Status

✅ **Completed:**
- WebSocket connection to Ethereum RPC with auto-reconnection
- Pending transaction listening from mempool
- Transaction fetching with concurrency control and timeout handling
- Transaction normalization (legacy + EIP-1559)
- Kafka producer with idempotent producer and GZIP compression
- PySpark consumer with Structured Streaming
- PostgreSQL persistence with upsert logic
- Docker containerization for all services
- Comprehensive type definitions (TypeScript)
- Integration tests and reconnection tests
- Ghost session prevention with connection ID tracking

## Technology Stack

### Backend Services
- **TypeScript** - Type-safe listener service
- **Node.js** - Runtime for listener service
- **PySpark** - Distributed stream processing
- **Python** - Spark consumer implementation

### Data Infrastructure
- **Apache Kafka** - Message broker for event streaming
- **PostgreSQL** - Persistent transaction storage
- **Zookeeper** - Kafka cluster coordination

### Libraries
- **ethers.js** - Ethereum WebSocket provider
- **kafkajs** - Kafka client for Node.js
- **pyspark** - Spark SQL and Structured Streaming
- **psycopg2** - PostgreSQL driver for Python

### DevOps
- **Docker** - Containerization
- **docker-compose** - Multi-container orchestration

## Testing

Run integration tests:
```bash
cd eth-listener
npm test                    # Run all tests
npm run test:reconnection   # Test reconnection logic
```

Tests verify:
- WebSocket connection and disconnection
- Transaction listening and fetching
- Transaction normalization
- Auto-reconnection with exponential backoff
- Connection ID tracking (ghost session prevention)
- Graceful shutdown

## Dimension Tables for Transaction Decoding

The system includes dimension tables for advanced transaction decoding and analysis. These are automatically populated by the `dim-scraper` service.

### Available Dimension Tables

```sql
-- Contracts from major DeFi protocols
CREATE TABLE dim_contract (
  contract_address BYTEA PRIMARY KEY,
  protocol         TEXT NOT NULL,      -- uniswap, sushi, aave
  version          TEXT NOT NULL        -- v2, v3
);

CREATE TABLE dim_function (
  function_selector CHAR(10) PRIMARY KEY, -- 0x38ed1739
  protocol          TEXT NOT NULL,
  function_type     TEXT NOT NULL         -- swap_exact_in, swap_exact_out
);

CREATE TABLE dim_calldata_slice (
  function_selector CHAR(10),
  field_name        TEXT,         -- amount_in, path, deadline
  start_byte        INTEGER,
  length_bytes      INTEGER,
  is_dynamic        BOOLEAN,
  PRIMARY KEY (function_selector, field_name)
);

CREATE TABLE dim_swap_rule (
  function_selector CHAR(10) PRIMARY KEY,
  token_in_source   TEXT,   -- path[0]
  token_out_source  TEXT    -- path[last]
);
```

### Populating Dimension Tables

The `dim-scraper` service automatically populates these tables from verified sources:

```bash
# Run scraper manually (if not using docker-compose)
cd dim-scraper
npm install
npm run dev

# Or run via Docker
docker-compose up dim-scraper
```

**Data Sources:**
- **4byte.directory** - Comprehensive function signature database
- **GitHub** - Official protocol deployment addresses (Uniswap, SushiSwap, Curve, Balancer, 1inch)
- **DeFi Llama** - Protocol metadata and pool contracts

**Sample Queries:**

```sql
-- Find all Uniswap contracts
SELECT * FROM dim_contract WHERE protocol = 'uniswap';

-- Get all swap function signatures
SELECT * FROM dim_function WHERE function_type LIKE '%swap%';

-- View calldata parsing rules for swapExactTokensForTokens
SELECT * FROM dim_calldata_slice
WHERE function_selector = (
  SELECT function_selector FROM dim_function
  WHERE function_type = 'swap_exact_in' LIMIT 1
);

-- Join transactions with contract metadata
SELECT t.hash, t.to_address, c.protocol, c.version
FROM ethereum_transactions_raw t
LEFT JOIN dim_contract c ON t.to_address = c.contract_address
WHERE c.protocol IS NOT NULL
LIMIT 10;
```

## Future Enhancements

### Planned Features

1. **Advanced Transaction Decoding** (Ready for Implementation)
   - Dimension tables are already created and populated
   - Next: Build calldata decoder using `dim_calldata_slice` rules
   - Next: Extract token pairs from swaps using `dim_swap_rule`
   - Next: Create materialized views for decoded swap transactions

2. **Enhanced Monitoring**
   - Grafana dashboards for metrics visualization
   - Prometheus metrics export
   - Alert system for anomalies

3. **Performance Optimizations**
   - Advanced rate limiting
   - Dead letter queue for failed messages
   - Batch size optimization for Spark consumer

4. **Data Enrichment**
   - ENS name resolution for addresses
   - Contract verification and ABI storage
   - Token price data integration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC