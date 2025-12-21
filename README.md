# Ethereum Transaction Listener

Real-time Ethereum transaction monitoring platform with stream processing and DeFi protocol enrichment.

## Architecture Overview

A distributed system that captures pending transactions from Ethereum mempool, streams them through Kafka, persists them in PostgreSQL, and enriches them with DeFi protocol metadata.

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Ethereum Network                             │
│                  (WebSocket RPC Provider)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │ Pending Transactions
                         ▼
        ┌────────────────────────────────────┐
        │  eth-listener (TypeScript)         │
        │  • WebSocket connection            │
        │  • Transaction fetching            │
        │  • Auto-reconnection               │
        │  • Normalization                   │
        └────────┬───────────────────────────┘
                 │ Normalized JSON
                 ▼
        ┌────────────────────────────────────┐
        │  Kafka (Message Broker)            │
        │  Topic: blockchain.txs.raw         │
        │  • GZIP compression                │
        │  • Idempotent producer             │
        └────────┬───────────────────────────┘
                 │
                 ▼
        ┌────────────────────────────────────┐
        │  spark-consumer (PySpark)          │
        │  • Structured Streaming            │
        │  • Schema validation               │
        │  • Batch processing                │
        └────────┬───────────────────────────┘
                 │
                 ▼
        ┌────────────────────────────────────┐
        │  PostgreSQL Database               │
        │  • ethereum_transactions_raw       │
        │  • Indexed for fast queries        │
        └────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              Dimension Table Enrichment (Parallel)               │
└─────────────────────────────────────────────────────────────────┘

        ┌───────────────┐         ┌───────────────┐
        │  The Graph    │         │  4byte.dir    │
        │  API          │         │  API          │
        └───────┬───────┘         └───────┬───────┘
                │                         │
                └────────┬────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │  dim-scraper (TypeScript)          │
        │  • Fetch pool contracts            │
        │  • Fetch function signatures       │
        │  • Deduplicate & upsert            │
        └────────┬───────────────────────────┘
                 │
                 ▼
        ┌────────────────────────────────────┐
        │  PostgreSQL - Dimension Tables     │
        │  • dim_contract                    │
        │  • dim_function                    │
        │  • dim_calldata_slice              │
        └────────────────────────────────────┘
```

## Core Services

### 1. eth-listener (TypeScript)
**Real-time transaction capture from Ethereum mempool**

- Connects via WebSocket to Ethereum RPC
- Listens for pending transactions
- Fetches complete transaction details
- Normalizes data (legacy + EIP-1559 support)
- Publishes to Kafka with GZIP compression
- Auto-reconnection with exponential backoff

**Key Classes:**
- `EthereumWebSocketListener` - WebSocket connection manager
- `TransactionKafkaProducer` - Kafka publishing
- `TransactionNormalizer` - Data normalization

### 2. spark-consumer (PySpark)
**Stream processing and database persistence**

- Consumes from Kafka using Spark Structured Streaming
- Validates schema and casts types
- Batch processing with `foreachBatch`
- Writes to PostgreSQL with upsert logic
- Auto-commits offsets

**Technology:**
- PySpark 3.5.0 (Structured Streaming)
- JDBC (Spark → PostgreSQL)
- psycopg2 (foreachBatch → PostgreSQL)

### 3. dim-scraper (TypeScript)
**DeFi protocol metadata enrichment**

- Scrapes Uniswap pool contracts from The Graph API
- Fetches function signatures from 4byte.directory
- Populates dimension tables for transaction decoding
- Runs once on startup (restart: "no")

**Populated Tables:**
- `dim_contract` - DeFi protocol contracts (routers, pools)
- `dim_function` - Function selectors and types
- `dim_calldata_slice` - Calldata parsing rules

## Data Architecture

### Transaction Flow

```
Ethereum Mempool
    ↓ WebSocket
[eth-listener] → Normalize → Kafka → [spark-consumer] → PostgreSQL
                                                            ↓
                                                   ethereum_transactions_raw
```

### Dimension Tables (Separate Flow)

```
The Graph API + 4byte.directory
              ↓
       [dim-scraper]
              ↓
         PostgreSQL
         ↓      ↓      ↓
   dim_contract dim_function dim_calldata_slice
```

### Database Schema

**ethereum_transactions_raw** (Main table)
```sql
hash                    TEXT PRIMARY KEY
block_number            BIGINT
from_address            TEXT NOT NULL
to_address              TEXT
value_wei               NUMERIC(38, 0)
gas_limit               NUMERIC(38, 0)
gas_price               NUMERIC(38, 0)
max_fee_per_gas         NUMERIC(38, 0)
max_priority_fee_per_gas NUMERIC(38, 0)
data                    TEXT
nonce                   BIGINT
tx_type                 SMALLINT
chain_id                TEXT
received_at             TIMESTAMPTZ
network                 TEXT
```

**dim_contract** (Protocol metadata)
```sql
contract_address    TEXT
protocol            TEXT  -- uniswap, sushiswap
version             TEXT  -- v2, v3, v3_pool
pairname            TEXT  -- WETH/USDC (pools only)
total_volume_usd    NUMERIC
source              TEXT  -- graph, manual
```

**dim_function** (Function signatures)
```sql
function_selector   CHAR(10)  -- 0x38ed1739
protocol            TEXT
function_type       TEXT      -- swap_exact_in
source              TEXT      -- 4byte, manual
```

## Technology Stack

### Backend
- **TypeScript** - Type-safe services (listener, scraper)
- **PySpark** - Distributed stream processing
- **Node.js** - Runtime for TypeScript services

### Infrastructure
- **Apache Kafka** - Event streaming
- **PostgreSQL 16** - Persistent storage
- **Zookeeper** - Kafka coordination

### Libraries
- **ethers.js** - Ethereum WebSocket provider
- **kafkajs** - Kafka client for Node.js
- **pyspark** - Spark Structured Streaming
- **psycopg2** - PostgreSQL driver for Python

## Quick Start

### Full Stack (Docker)
```bash
docker-compose --profile full up
```

This starts:
- Zookeeper (port 2181)
- Kafka (port 9092)
- Kafka UI (port 8080)
- PostgreSQL (port 5432)
- eth-listener (continuous)
- spark-consumer (continuous)
- dim-scraper (runs once, exits)

### Individual Profiles
```bash
# Database + Scraper only
docker-compose --profile scraper up

# Database only
docker-compose --profile db up

# Kafka infrastructure only
docker-compose --profile kafka up
```

## Configuration

Environment variables (`.env`):

```env
# Ethereum
ETH_WEBSOCKET_URL=wss://ethereum-rpc.publicnode.com

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=blockchain.txs.raw

# Listener
MAX_CONCURRENT_FETCHES=10
FETCH_TIMEOUT=5000
AUTO_RECONNECT=true
MAX_RECONNECT_ATTEMPTS=0  # 0 = unlimited
RECONNECT_DELAY=1000
MAX_RECONNECT_DELAY=60000
RECONNECT_BACKOFF_MULTIPLIER=2

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=ethereum_data
POSTGRES_USER=eth_user
POSTGRES_PASSWORD=eth_password

# Optional: The Graph API
GRAPH_API_KEY=your_api_key  # For Uniswap pool data
```

## Project Structure

```
eth-listener/
├── eth-listener/           # TypeScript transaction listener
│   ├── src/
│   │   ├── pub/           # EthereumWebSocketListener, TransactionKafkaProducer
│   │   ├── utils/         # TransactionNormalizer
│   │   ├── docs/          # Type definitions
│   │   └── index.ts       # Main entry point
│   └── Dockerfile
│
├── spark-consumer/        # PySpark Kafka consumer
│   ├── kafka_consumer.py  # Main streaming logic
│   ├── requirements.txt
│   └── Dockerfile
│
├── dim-scraper/           # Dimension table scraper
│   ├── src/
│   │   ├── scrapers/      # FourByteScraper, UniswapGraphScraper
│   │   ├── db/            # DatabaseManager
│   │   └── index.ts       # Main scraper workflow
│   └── Dockerfile
│
├── postgres/
│   └── init.sql           # Database schema (transactions + dimensions)
│
├── docker-compose.yml     # Multi-service orchestration
└── model.uml              # PlantUML architecture diagram
```

## Monitoring

### Kafka UI
http://localhost:8080
- View topics and messages
- Monitor consumer lag
- Check broker health

### PostgreSQL Queries
```bash
docker exec -it eth-listener-postgres psql -U eth_user -d ethereum_data
```

```sql
-- Transaction counts
SELECT COUNT(*) FROM ethereum_transactions_raw;

-- Recent transactions
SELECT hash, from_address, to_address, value_wei, received_at
FROM ethereum_transactions_raw
ORDER BY received_at DESC
LIMIT 10;

-- Top senders
SELECT from_address, COUNT(*) as tx_count
FROM ethereum_transactions_raw
GROUP BY from_address
ORDER BY tx_count DESC
LIMIT 10;

-- DeFi protocol coverage
SELECT protocol, version, COUNT(*) as contract_count
FROM dim_contract
GROUP BY protocol, version
ORDER BY contract_count DESC;
```

### Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f eth-listener
docker-compose logs -f spark-consumer
docker-compose logs -f dim-scraper
```

## Advanced Usage

### Transaction Enrichment

Join transactions with dimension tables to identify DeFi interactions:

```sql
-- Find all Uniswap transactions
SELECT
    t.hash,
    t.from_address,
    t.to_address,
    c.protocol,
    c.version,
    c.pairname,
    t.value_wei,
    t.received_at
FROM ethereum_transactions_raw t
JOIN dim_contract c ON t.to_address = c.contract_address
WHERE c.protocol = 'uniswap'
ORDER BY t.received_at DESC
LIMIT 100;

-- Decode function calls
SELECT
    t.hash,
    f.function_selector,
    f.function_type,
    f.protocol,
    SUBSTRING(t.data, 1, 10) as method_id
FROM ethereum_transactions_raw t
JOIN dim_function f ON SUBSTRING(t.data, 1, 10) = f.function_selector
WHERE f.function_type LIKE '%swap%'
LIMIT 10;
```

## Development

### Local Development (eth-listener)
```bash
cd eth-listener
npm install
npm run dev
```

### Local Development (spark-consumer)
```bash
cd spark-consumer
pip install -r requirements.txt
python kafka_consumer.py
```

### Local Development (dim-scraper)
```bash
cd dim-scraper
npm install
npm run dev
```

## Architecture Decisions

### Why Kafka?
- Decouples transaction capture from processing
- Handles backpressure (if Spark is slow)
- Allows multiple consumers
- Message replay capability

### Why PySpark?
- Structured Streaming integrates cleanly with Kafka
- Built-in batch processing (`foreachBatch`)
- Type casting and schema validation
- Scales horizontally for higher throughput

### Why Dimension Tables?
- Enrich raw transactions with DeFi protocol context
- Pre-computed contract metadata (no runtime lookups)
- Enables efficient JOIN queries
- Foundation for calldata decoding

### Why Separate Scraper?
- One-time population, doesn't need continuous runtime
- Different data sources (Graph API, 4byte)
- Can be re-run manually for updates
- Keeps listener service focused on real-time streaming

## Performance Characteristics

### Throughput
- Listener: ~1,000 tx/sec (limited by RPC, not code)
- Kafka: 100,000+ messages/sec
- Spark: Batch size configurable (current: all pending)
- PostgreSQL: ~10,000 writes/sec (with upsert)

### Latency
- Mempool → Kafka: <100ms
- Kafka → PostgreSQL: ~1-2 seconds (batch interval)
- End-to-end: ~2 seconds from mempool to database

### Resource Usage
- eth-listener: ~100MB RAM
- spark-consumer: ~2GB RAM (JVM + PySpark)
- dim-scraper: ~50MB RAM (runs briefly)
- PostgreSQL: ~500MB RAM (base)

## Future Enhancements

1. **Calldata Decoder** - Use `dim_calldata_slice` to extract swap parameters
2. **Materialized Views** - Pre-aggregate DeFi swap volumes
3. **Real-time Alerts** - Large transfers, MEV detection
4. **Historical Backfill** - Fetch confirmed blocks, not just mempool
5. **Multi-chain Support** - Polygon, Arbitrum, Optimism

## Documentation

- [model.uml](model.uml) - Full UML architecture diagram (PlantUML)
- [eth-listener/README.md](eth-listener/README.md) - Listener service details
- [spark-consumer/README.md](spark-consumer/README.md) - Spark consumer details
- [dim-scraper/README.md](dim-scraper/README.md) - Scraper service details
- [postgres/README.md](postgres/README.md) - Database schema details

## License

ISC
