# DeFi Dimension Table Scraper

Automated web scraper that populates dimension tables for Ethereum DeFi protocol analysis. Fetches contract addresses, function signatures, and calldata parsing rules from verified public sources.

## Overview

This module scrapes data from:
- **4byte.directory** - Ethereum function signature database
- **GitHub** - Official protocol deployment addresses (Uniswap, SushiSwap, etc.)
- **DeFi Llama API** - Protocol metadata and pool contracts

## Data Sources

### 1. Contract Addresses (dim_contract)
- ✓ Uniswap V2 & V3 official deployments
- ✓ SushiSwap router and factory contracts
- ✓ PancakeSwap Ethereum deployment
- ✓ Curve Finance registry and routers
- ✓ Balancer V2 vault
- ✓ 1inch aggregation routers (V4 & V5)
- ✓ DeFi Llama pool contracts

### 2. Function Signatures (dim_function)
Scraped from 4byte.directory:
- Swap functions (swapExactTokensForTokens, exactInputSingle, etc.)
- Liquidity functions (addLiquidity, mint, burn, etc.)
- DEX aggregator functions (multicall, etc.)

### 3. Calldata Parsing Rules (dim_calldata_slice)
Auto-generated for:
- Uniswap V2 swap parameters (amountIn, amountOutMin, path, deadline)
- Uniswap V3 swap parameters (tokenIn, tokenOut, fee, etc.)
- Field byte positions and dynamic/static types

### 4. Swap Rules (dim_swap_rule)
Token extraction rules:
- V2-style: `path[0]` (tokenIn) and `path[last]` (tokenOut)
- V3-style: `params.tokenIn` and `params.tokenOut`

## Installation

```bash
cd dim-scraper
npm install
```

## Usage

### Local Development

```bash
# Build TypeScript
npm run build

# Run scraper (development mode with ts-node)
npm run dev

# Run scraper (production)
npm start
```

### Docker

```bash
# Build image
docker build -t dim-scraper .

# Run with environment variables
docker run --rm \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_DB=ethereum_data \
  -e POSTGRES_USER=eth_user \
  -e POSTGRES_PASSWORD=eth_password \
  dim-scraper
```

### Docker Compose

```bash
# Run as part of the main stack
docker-compose up dim-scraper
```

## Configuration

Environment variables:

```bash
POSTGRES_HOST=localhost      # PostgreSQL host
POSTGRES_PORT=5432           # PostgreSQL port
POSTGRES_DB=ethereum_data    # Database name
POSTGRES_USER=eth_user       # Database user
POSTGRES_PASSWORD=eth_password # Database password
```

## Scraping Workflow

The scraper runs in 4 steps:

1. **Contract Addresses** - Fetches from GitHub and DeFi Llama
2. **Function Signatures** - Searches 4byte.directory for swap/liquidity functions
3. **Calldata Slices** - Generates parsing rules for known function signatures
4. **Swap Rules** - Creates token extraction rules for swap transactions

## Output

After completion, the following tables will be populated:

```sql
SELECT COUNT(*) FROM dim_contract;           -- ~50+ contracts
SELECT COUNT(*) FROM dim_function;           -- ~100+ function signatures
SELECT COUNT(*) FROM dim_calldata_slice;     -- ~200+ parsing rules
SELECT COUNT(*) FROM dim_swap_rule;          -- ~20+ swap rules
```

## Rate Limiting

The scraper includes built-in rate limiting for public APIs:
- 4byte.directory: 500ms delay between requests
- Other APIs: Respectful request patterns

## Extending

To add new protocols:

1. **Add contract addresses** in `src/scrapers/github-scraper.ts`
2. **Add function queries** in `src/scrapers/fourbyte-scraper.ts`
3. **Update main workflow** in `src/index.ts`

## Example Queries

After scraping, you can use the dimension tables:

```sql
-- Find all Uniswap V2 contracts
SELECT * FROM dim_contract WHERE protocol = 'uniswap' AND version = 'v2';

-- Find all swap functions
SELECT * FROM dim_function WHERE function_type LIKE '%swap%';

-- Get calldata parsing rules for a specific function
SELECT * FROM dim_calldata_slice
WHERE function_selector = '0x38ed1739';

-- Get token extraction rules
SELECT * FROM dim_swap_rule
JOIN dim_function USING (function_selector)
WHERE protocol = 'uniswap';
```

## Notes

- The scraper uses upsert logic (ON CONFLICT DO UPDATE) to avoid duplicates
- Run periodically to catch new protocol deployments
- Some APIs may require rate limiting or API keys for heavy usage
- Contract addresses are normalized to lowercase

## License

ISC
