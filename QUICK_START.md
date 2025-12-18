# Quick Start Guide

## Problem Solved

1. ✅ **Init script is now idempotent** - Uses `CREATE TABLE IF NOT EXISTS` for all tables
2. ✅ **Selective service startup** - Use profiles to run only what you need
3. ✅ **Safe for existing volumes** - Won't overwrite your data on restart

## Common Use Cases

### 1. Start Database + Populate Dimension Tables

```bash
docker-compose --profile scraper up
```

**What happens:**
- PostgreSQL starts with your existing volume
- Init script runs safely (IF NOT EXISTS prevents overwrites)
- Scraper populates dim tables
- Scraper exits when done

### 2. Start Only Database

```bash
docker-compose --profile db up -d
```

**What happens:**
- PostgreSQL starts in background
- Your data volume is preserved
- No other services run

**Use for:**
- Manual database access
- Running SQL queries
- Testing migrations

### 3. Re-run Scraper (Database Already Running)

```bash
# Database is already up
docker-compose run --rm dim-scraper
```

**What happens:**
- Connects to existing database
- Re-fetches latest protocol data
- Uses upsert logic (ON CONFLICT DO UPDATE)
- Safe to run multiple times

### 4. Start Full Stack

```bash
docker-compose --profile full up
```

**What happens:**
- All services start (Kafka, DB, Listener, Consumer, Scraper)
- Complete transaction pipeline
- Production-like environment

## Verification

After running the scraper:

```bash
# Connect to database
docker exec -it eth-listener-postgres psql -U eth_user -d ethereum_data

# Check dim tables
SELECT 'dim_contract' as table_name, COUNT(*) as rows FROM dim_contract
UNION ALL
SELECT 'dim_function', COUNT(*) FROM dim_function
UNION ALL
SELECT 'dim_calldata_slice', COUNT(*) FROM dim_calldata_slice
UNION ALL
SELECT 'dim_swap_rule', COUNT(*) FROM dim_swap_rule;

# Sample contracts by protocol
SELECT protocol, version, COUNT(*) as count
FROM dim_contract
GROUP BY protocol, version
ORDER BY protocol, version;
```

Expected output:
```
    table_name     | rows
-------------------+------
 dim_contract      |   50+
 dim_function      |  100+
 dim_calldata_slice|  200+
 dim_swap_rule     |   20+
```

## Database Volume Behavior

**Volume Location:** `~/Projects/db`

**Init Script Behavior:**
- ✅ First run: Creates all tables and indexes
- ✅ Subsequent runs: Skips existing tables (IF NOT EXISTS)
- ✅ Never overwrites data
- ✅ Safe to restart container

**Scraper Behavior:**
- ✅ Uses `ON CONFLICT DO UPDATE` for all inserts
- ✅ Updates existing records with new data
- ✅ Safe to run multiple times
- ✅ Idempotent operations

## Stop Services

```bash
# Stop specific profile
docker-compose --profile scraper down
docker-compose --profile db down

# Stop everything
docker-compose down

# Stop and remove volumes (CAUTION: deletes data)
docker-compose down -v
```

## Troubleshooting

### "Volume already exists" warning

**This is normal!** The init script is idempotent and won't overwrite data.

### Re-populate dimension tables

```bash
# Safe to re-run anytime
docker-compose --profile scraper up
```

### Reset everything (delete all data)

```bash
# Stop all services
docker-compose down

# Remove volume
docker volume rm eth-listener_postgres-data
# Or manually: rm -rf ~/Projects/db/*

# Start fresh
docker-compose --profile scraper up
```

## Further Reading

- [docker-profiles.md](docker-profiles.md) - Detailed profile documentation
- [dim-scraper/USAGE.md](dim-scraper/USAGE.md) - Scraper usage guide
- [README.md](README.md) - Full project documentation
