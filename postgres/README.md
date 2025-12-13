# PostgreSQL Database for Ethereum Transaction Listener

This directory contains the PostgreSQL database setup for storing raw Ethereum transactions.

## Database Schema

### Table: `ethereum_transactions_raw`

Stores all raw Ethereum transactions captured by the listener service.

#### Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `hash` | TEXT | NO | Transaction hash (Primary Key) |
| `block_number` | BIGINT | YES | Block number (NULL for pending transactions) |
| `block_timestamp` | TIMESTAMPTZ | YES | Block timestamp |
| `transaction_index` | INTEGER | YES | Transaction index within block |
| `from_address` | TEXT | NO | Sender address |
| `to_address` | TEXT | YES | Recipient address (NULL for contract creation) |
| `value_wei` | NUMERIC(38,0) | NO | Transaction value in wei |
| `gas_limit` | NUMERIC(38,0) | NO | Gas limit |
| `gas_price` | NUMERIC(38,0) | YES | Gas price (legacy transactions) |
| `max_fee_per_gas` | NUMERIC(38,0) | YES | Max fee per gas (EIP-1559) |
| `max_priority_fee_per_gas` | NUMERIC(38,0) | YES | Max priority fee per gas (EIP-1559) |
| `effective_gas_price` | NUMERIC(38,0) | YES | Actual gas price paid |
| `data` | TEXT | NO | Transaction input data |
| `nonce` | BIGINT | NO | Transaction nonce |
| `tx_type` | SMALLINT | YES | Transaction type (0=legacy, 2=EIP-1559) |
| `chain_id` | TEXT | NO | Chain ID |
| `status` | SMALLINT | YES | Transaction status (1=success, 0=failure) |
| `received_at` | TIMESTAMPTZ | NO | Timestamp when transaction was received |
| `network` | TEXT | NO | Network name (e.g., mainnet, sepolia) |

#### Indexes

- `PRIMARY KEY (hash)` - Unique constraint on transaction hash
- `idx_block_number` - Index on block_number (for non-NULL values)
- `idx_from_address` - Index on from_address
- `idx_to_address` - Index on to_address (for non-NULL values)
- `idx_received_at` - Index on received_at
- `idx_network` - Index on network
- `idx_chain_id` - Index on chain_id
- `idx_network_received_at` - Composite index for time-based queries by network

## Docker Configuration

### Environment Variables

The PostgreSQL container uses the following environment variables:

- `POSTGRES_DB`: ethereum_data
- `POSTGRES_USER`: eth_user
- `POSTGRES_PASSWORD`: eth_password

### Volumes

- `postgres-data`: Persistent volume for PostgreSQL data
- `./postgres/init.sql`: Initialization script mounted as `/docker-entrypoint-initdb.d/init.sql`

### Ports

- `5432:5432` - PostgreSQL port exposed to host

## Connecting to the Database

### From Docker Container

```bash
docker exec -it eth-listener-postgres psql -U eth_user -d ethereum_data
```

### From Host Machine

```bash
psql -h localhost -p 5432 -U eth_user -d ethereum_data
```

Password: `eth_password`

### Connection String

```
postgresql://eth_user:eth_password@localhost:5432/ethereum_data
```

## Common Queries

### Count Total Transactions

```sql
SELECT COUNT(*) FROM ethereum_transactions_raw;
```

### View Recent Transactions

```sql
SELECT hash, from_address, to_address, value_wei, received_at
FROM ethereum_transactions_raw
ORDER BY received_at DESC
LIMIT 10;
```

### Transactions by Network

```sql
SELECT network, COUNT(*) as tx_count
FROM ethereum_transactions_raw
GROUP BY network
ORDER BY tx_count DESC;
```

### High Value Transactions

```sql
SELECT hash, from_address, to_address,
       value_wei / 1e18 as eth_value,
       received_at
FROM ethereum_transactions_raw
WHERE value_wei > 1e18  -- More than 1 ETH
ORDER BY value_wei DESC
LIMIT 10;
```

### Transaction Rate by Hour

```sql
SELECT
    date_trunc('hour', received_at) as hour,
    COUNT(*) as tx_count
FROM ethereum_transactions_raw
GROUP BY hour
ORDER BY hour DESC
LIMIT 24;
```

## Maintenance

### Backup Database

```bash
docker exec eth-listener-postgres pg_dump -U eth_user ethereum_data > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker exec -i eth-listener-postgres psql -U eth_user -d ethereum_data
```

### View Database Size

```sql
SELECT pg_size_pretty(pg_database_size('ethereum_data')) as db_size;
```

### View Table Size

```sql
SELECT pg_size_pretty(pg_total_relation_size('ethereum_transactions_raw')) as table_size;
```

## Performance Optimization

The table includes several indexes optimized for common query patterns:

1. **Address lookups**: Indexes on `from_address` and `to_address`
2. **Time-based queries**: Index on `received_at`
3. **Network filtering**: Composite index on `(network, received_at)`
4. **Block queries**: Index on `block_number`

For large datasets, consider:
- Partitioning by `block_number` or `received_at`
- Adding partial indexes for specific query patterns
- Implementing archival strategy for old transactions
