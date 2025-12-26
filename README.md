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
**Stream processing, calldata parsing, and database persistence**

- Consumes from Kafka using Spark Structured Streaming
- Validates schema and casts types
- **Dynamic transaction parsing using dimension tables**
  - Matches transactions to known contracts (dim_contract)
  - Extracts function selectors and metadata (dim_function)
  - Parses calldata fields using slice rules (dim_calldata_slice)
- Batch processing with `foreachBatch`
- Writes to PostgreSQL with upsert logic (raw + decoded tables)
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
                                           │                 ↓
                                           │    ethereum_transactions_raw (all txs)
                                           │                 ↓
                                           ├── Parse with dimension tables
                                           │   (dim_contract + dim_function + dim_calldata_slice)
                                           │                 ↓
                                           └→ ethereum_transactions_decoded (parsed txs)
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

**dim_calldata_slice** (Calldata parsing rules - JSON configurable)
```sql
id                  UUID PRIMARY KEY
function_selector   CHAR(10)      -- 0x7ff36ab5
field_name          TEXT          -- amountOutMin, path[0], deadline
start_byte          INT           -- Byte offset in calldata
length_bytes        INT           -- Field length (usually 32)
is_dynamic          BOOLEAN       -- Part of dynamic array?
token_direction     TEXT          -- in/out/NULL
source              TEXT          -- manual, generated
```

**Configuration:** `postgres/queries/calldata_slice_rules.json`
- Define parsing rules for new functions in JSON
- Automatically loaded by dim-scraper on startup
- Supports smart value cleaning (addresses, amounts, numbers)
- See `postgres/queries/README_CALLDATA_SLICES.md` for documentation

**ethereum_transactions_decoded** (Parsed transactions with enriched metadata)
```sql
hash                    TEXT PRIMARY KEY
contract_address        TEXT          -- Contract that was called
contract_protocol       TEXT          -- uniswap, sushi, curve
contract_version        TEXT          -- v2, v3, v2_router_02
contract_pairname       TEXT          -- WETH/USDC (for pools)
function_selector       CHAR(10)      -- 0x7ff36ab5
function_type           TEXT          -- swap_exact_eth_in
function_protocol       TEXT          -- uniswap_v2
parsed_fields           JSONB         -- {"to": "0x...", "amountOutMin": "0x...", "path": [...]}
decoded_at              TIMESTAMPTZ   -- When parsed
```

### Smart Value Cleaning

The CalldataParser automatically cleans values based on field names:

- **Addresses** (to, from, path[n]): Extracts last 20 bytes → `0x72f70a19b06428e32653e9244ec3e425e0f7877c`
- **Numbers** (deadline, length, offset): Converts to decimal → `1766788183`
- **Amounts** (amountOutMin, value): Removes leading zeros → `0xde0b6b3a7640000`

## Adding New DeFi Functions

### JSON Configuration Approach

1. **Edit** `postgres/queries/calldata_slice_rules.json`:
```json
{
  "function_selector": "0x38ed1739",
  "function_name": "swapExactTokensForTokens",
  "description": "Swap exact tokens for other tokens",
  "slices": [
    {
      "field_name": "amountIn",
      "start_byte": 4,
      "length_bytes": 32,
      "is_dynamic": false,
      "token_direction": "in",
      "source": "manual",
      "description": "Exact amount of input tokens"
    }
  ]
}
```

2. **Load** rules into database:
```bash
cd dim-scraper
npm run load-slices
```

3. **Restart** spark-consumer to use new rules

**Field Naming Determines Parsing:**
- `to`, `from`, `path[0]` → Cleaned to 20-byte addresses
- `deadline`, `length`, `offset` → Converted to decimal integers
- `amountOutMin`, `value`, `price` → Leading zeros removed

**Full Documentation:** `postgres/queries/README_CALLDATA_SLICES.md`

## Technology Stack

### Backend
- **TypeScript** - Type-safe services (listener, scraper)
- **PySpark** - Distributed stream processing
- **Node.js** - Runtime for TypeScript services

### Infrastructure
- **Apache Kafka** - Event streaming
- **PostgreSQL 16** - Persistent storage with JSONB support
- **Zookeeper** - Kafka coordination

### Libraries
- **ethers.js** - Ethereum WebSocket provider
- **kafkajs** - Kafka client for Node.js
- **pyspark** - Spark Structured Streaming
- **psycopg2** - PostgreSQL driver for Python (batch writes)

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

-- Decoded transactions count
SELECT COUNT(*) FROM ethereum_transactions_decoded;

-- Recent decoded transactions
SELECT hash, contract_protocol, function_type, parsed_fields::text
FROM ethereum_transactions_decoded
ORDER BY decoded_at DESC
LIMIT 10;

-- Decoded transactions by protocol
SELECT contract_protocol, COUNT(*) as tx_count
FROM ethereum_transactions_decoded
GROUP BY contract_protocol
ORDER BY tx_count DESC;
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

-- Decode function calls (old method - manual join)
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

-- NEW: Query decoded transactions (automatic parsing)
-- Find all Uniswap swap transactions with parsed calldata
SELECT
    hash,
    contract_protocol,
    contract_version,
    function_type,
    parsed_fields->>'path[0]' as token_in,
    parsed_fields->>'path[1]' as token_out,
    parsed_fields->>'amountOutMin' as min_amount_out,
    decoded_at
FROM ethereum_transactions_decoded
WHERE contract_protocol = 'uniswap'
  AND function_type = 'swap_exact_eth_in'
ORDER BY decoded_at DESC
LIMIT 20;

-- Find swaps for a specific token (WETH)
SELECT hash, contract_protocol, function_type, parsed_fields
FROM ethereum_transactions_decoded
WHERE parsed_fields @> '{"path[0]": "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"}';

-- Count transactions by function type
SELECT function_type, COUNT(*) as tx_count
FROM ethereum_transactions_decoded
GROUP BY function_type
ORDER BY tx_count DESC;
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

## Recent Features

### ✅ Dynamic Transaction Parsing (Implemented)
The Spark consumer now automatically parses transaction calldata using dimension tables:
- **Contract Matching**: Matches `to_address` against `dim_contract` to identify protocol and version
- **Function Decoding**: Extracts function selector and matches against `dim_function`
- **Calldata Parsing**: Uses `dim_calldata_slice` rules to extract parameters (amounts, token paths, deadlines, etc.)
- **Decoded Storage**: Stores parsed transactions in `ethereum_transactions_decoded` with JSONB fields
- **Test Suite**: Includes standalone test script to validate parsing logic

**Example**: For a `swapExactETHForTokens` transaction, automatically extracts:
- Contract info: Uniswap V2 Router
- Function type: `swap_exact_eth_in`
- Parsed fields: `amountOutMin`, `to`, `deadline`, `path[0]` (WETH), `path[1]` (output token)

See `spark-consumer/test_calldata_parser.py` for testing.

## Future Enhancements

1. **More Function Support** - Add additional DeFi function signatures (liquidity, staking, lending)
2. **Token Metadata Enrichment** - Join with token info (symbol, decimals, name)
3. **Price Calculation** - Calculate swap prices using path and amounts
4. **Materialized Views** - Pre-aggregate DeFi swap volumes and liquidity changes
5. **Real-time Alerts** - Large transfers, MEV detection, unusual swap patterns
6. **Historical Backfill** - Fetch confirmed blocks, not just mempool
7. **Multi-chain Support** - Polygon, Arbitrum, Optimism, Base

## Documentation

- [model.uml](model.uml) - Full UML architecture diagram (PlantUML)
- [eth-listener/README.md](eth-listener/README.md) - Listener service details
- [spark-consumer/README.md](spark-consumer/README.md) - Spark consumer details
- [dim-scraper/README.md](dim-scraper/README.md) - Scraper service details
- [postgres/README.md](postgres/README.md) - Database schema details

## License

ISC
