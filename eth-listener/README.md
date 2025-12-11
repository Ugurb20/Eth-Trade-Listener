# Ethereum Transaction Listener

Real-time Ethereum transaction monitoring system that captures pending transactions from the mempool, normalizes them, and publishes to Kafka.

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
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Kafka Broker                              │
│              Topic: blockchain.txs.raw                       │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
eth-listener/
├── src/
│   ├── docs/              # Type definitions
│   │   ├── config.types.ts         # Configuration types
│   │   ├── transaction.types.ts    # Transaction types
│   │   ├── normalized.types.ts     # Normalized payload types
│   │   ├── kafka.types.ts          # Kafka configuration types
│   │   └── index.ts                # Type exports
│   │
│   ├── pub/               # Connection management
│   │   ├── EthereumWebSocketListener.ts  # WebSocket listener
│   │   ├── TransactionKafkaProducer.ts   # Kafka producer
│   │   └── index.ts                      # Public exports
│   │
│   ├── utils/             # Utilities
│   │   ├── normalizer.ts           # Transaction normalizer
│   │   └── index.ts                # Utility exports
│   │
│   ├── test/              # Tests
│   │   └── listener.test.ts        # Integration tests
│   │
│   └── index.ts           # Main entry point
│
├── dist/                  # Compiled JavaScript (generated)
├── docker-compose.yml     # Docker orchestration
├── Dockerfile            # Container definition
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies & scripts
```

## Key Components

### 1. EthereumWebSocketListener
- Manages WebSocket connection to Ethereum RPC
- Subscribes to pending transactions
- Fetches full transaction details with concurrency control
- Provides callback mechanism for normalized transactions

### 2. TransactionKafkaProducer
- Connects to Kafka brokers
- Publishes normalized transactions to configured topic
- Handles retries and compression
- Supports both single and batch publishing

### 3. Transaction Normalizer
- Extracts essential fields from raw transactions
- Adds metadata (received timestamp, network info)
- Outputs clean JSON structure ready for downstream processing

## Setup

### Option 1: Docker (Recommended)

Run the entire stack (Kafka + Listener):

```bash
npm run docker:start
```

This starts:
- **Zookeeper** (port 2181)
- **Kafka** (port 9092)
- **Kafka UI** (port 8080) - http://localhost:8080
- **eth-listener** - The transaction listener service

### Option 2: Local Development

1. Install dependencies:
```bash
npm install
```

2. Build TypeScript:
```bash
npm run build
```

3. Start Kafka locally (or use Docker for just Kafka):
```bash
docker-compose up -d zookeeper kafka kafka-ui
```

4. Run the listener:
```bash
npm run dev
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

1. **Connection**: Listener connects to Ethereum WebSocket RPC
2. **Subscription**: Subscribes to `pending` transaction events
3. **Fetch**: Retrieves full transaction details (with timeout & concurrency limits)
4. **Normalize**: Extracts key fields and adds metadata
5. **Publish**: Sends to Kafka topic `blockchain.txs.raw`
6. **Monitor**: View messages in Kafka UI at http://localhost:8080

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

## Monitoring

- **Kafka UI**: http://localhost:8080
  - View topics and messages
  - Monitor consumer groups
  - Check broker health

- **Logs**:
```bash
npm run docker:logs
```

## Implementation Status

✅ **Completed:**
- WebSocket connection to Ethereum RPC
- Pending transaction listening
- Transaction fetching with concurrency control
- Transaction normalization
- Kafka producer integration
- Docker containerization
- Comprehensive type definitions
- Integration tests

🔄 **Pending:**
- WebSocket auto-reconnection logic
- Advanced rate limiting
- Dead letter queue for failed messages

## Testing

Run integration tests:
```bash
npm test
```

Tests verify:
- WebSocket connection
- Transaction listening
- Transaction normalization
- Graceful shutdown
