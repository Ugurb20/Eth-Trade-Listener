# PostgreSQL Test Queries

This folder contains SQL queries for testing and analyzing the Ethereum transaction data.

## Query Files

### 1. `test_contract_addresses_in_data.sql`
**Purpose**: Find contract addresses from `dim_contract` table that appear in transaction data fields (excluding empty "0x" data).

**Use Case**:
- Identify transactions that interact with known DeFi contracts
- Validate that contract addresses are being used in transaction calldata
- Discover which protocols are most actively used

**Key Metrics**:
- Transaction count per contract
- Sample transaction hashes
- Protocol and version breakdown

---

### 2. `test_function_selector_coverage.sql`
**Purpose**: Check which function selectors from `dim_function` are actually used in transactions.

**Use Case**:
- Validate function selector definitions
- Identify unused function selectors (may need removal)
- Find most popular function calls

**Key Metrics**:
- Transaction count per function selector
- Protocol and function type distribution
- Sample transactions for each selector

---

### 3. `test_transactions_with_data.sql`
**Purpose**: Analyze distribution of transactions with calldata.

**Use Case**:
- Understand what percentage of transactions include calldata
- Break down by network
- Sample recent transactions with data

**Key Metrics**:
- Empty vs non-empty data counts
- Percentage with calldata by network
- Recent transactions with function selectors

---

### 4. `test_contract_interaction_patterns.sql`
**Purpose**: Analyze both direct and indirect contract interactions.

**Use Case**:
- See which contracts receive direct calls (to_address)
- Find contracts mentioned in calldata (indirect references)
- Identify most popular contracts by interaction count

**Key Metrics**:
- Direct interactions (to_address matches)
- Data field mentions (address in calldata)
- Unique user count per contract

---

### 5. `test_unknown_function_selectors.sql`
**Purpose**: Discover function selectors not yet in `dim_function` table.

**Use Case**:
- Find new functions to add to dimension table
- Identify popular unknown function calls
- Expand protocol coverage

**Key Metrics**:
- Usage count per unknown selector
- Target contracts being called
- Unique callers

---

### 6. `test_data_quality_checks.sql`
**Purpose**: Various data integrity and quality checks.

**Use Case**:
- Validate data format consistency
- Find duplicate or malformed records
- Monitor ingestion rate
- Identify data issues early

**Checks Include**:
- Invalid data format
- Duplicate contract addresses
- Invalid function selectors
- Missing critical fields
- Recent ingestion rate

---

## How to Run

### Using psql CLI:
```bash
psql -h localhost -U postgres -d ethereum -f queries/test_contract_addresses_in_data.sql
```

### Using Docker:
```bash
docker exec -i postgres psql -U postgres -d ethereum -f /docker-entrypoint-initdb.d/queries/test_contract_addresses_in_data.sql
```

### Interactive mode:
```bash
psql -h localhost -U postgres -d ethereum
\i queries/test_contract_addresses_in_data.sql
```

## Query Optimization Tips

1. **Indexes**: The queries leverage existing indexes on `contract_address`, `function_selector`, and `data` fields
2. **Filtering**: Always exclude `data = '0x'` to improve performance on large datasets
3. **Limits**: Use `LIMIT` clauses when exploring data to avoid large result sets
4. **Aggregation**: Sample queries use `ARRAY_AGG` with limits to provide examples without overwhelming results

## Expected Results

If these queries return empty results, it likely means:
1. No transaction data has been ingested yet
2. No contracts or functions have been added to dimension tables
3. The listener service hasn't started capturing transactions

Make sure to populate `dim_contract` and `dim_function` tables before running these tests.
