# Docker Compose Profiles - Quick Reference

This project uses Docker Compose profiles to run only specific services.

## Available Profiles

### 1. `scraper` - Database + Dimension Scraper Only

Run only PostgreSQL and the dimension table scraper:

```bash
docker-compose --profile scraper up
```

**Services Started:**
- ✓ PostgreSQL (port 5432)
- ✓ dim-scraper (runs once and exits)

**Use Cases:**
- Populate dimension tables with DeFi protocol data
- Re-run scraper to update protocol addresses
- Test database schema without running full stack

---

### 2. `db` - Database Only

Run only PostgreSQL:

```bash
docker-compose --profile db up -d
```

**Services Started:**
- ✓ PostgreSQL (port 5432)

**Use Cases:**
- Manual database access
- Running migrations
- Testing SQL queries
- Local development without other services

---

### 3. `kafka` - Kafka Stack Only

Run Kafka infrastructure (Zookeeper, Kafka, Kafka UI):

```bash
docker-compose --profile kafka up
```

**Services Started:**
- ✓ Zookeeper (port 2181)
- ✓ Kafka (port 9092)
- ✓ Kafka UI (port 8080)

**Use Cases:**
- Test Kafka producer/consumer
- Monitor Kafka topics
- Debug message flow

---

### 4. `full` - All Services (Default)

Run the complete stack:

```bash
docker-compose --profile full up
```

Or simply:

```bash
docker-compose up
# Note: Without --profile, you need to specify which profile to use
# Use --profile full for the complete stack
```

**Services Started:**
- ✓ Zookeeper (port 2181)
- ✓ Kafka (port 9092)
- ✓ Kafka UI (port 8080)
- ✓ PostgreSQL (port 5432)
- ✓ dim-scraper (runs once)
- ✓ eth-listener (TypeScript service)
- ✓ spark-consumer (PySpark service)

**Use Cases:**
- Production-like environment
- End-to-end testing
- Full transaction pipeline

---

## Common Commands

### Start Database + Scraper

```bash
# Start in foreground (see logs)
docker-compose --profile scraper up

# Start in background
docker-compose --profile scraper up -d

# View logs
docker-compose --profile scraper logs -f dim-scraper
```

### Start Database Only

```bash
# Start database
docker-compose --profile db up -d

# Connect to database
docker exec -it eth-listener-postgres psql -U eth_user -d ethereum_data

# Stop database
docker-compose --profile db down
```

### Re-run Scraper (Database Already Running)

```bash
# If database is already running
docker-compose run --rm dim-scraper
```

### Start Full Stack

```bash
# Start everything
docker-compose --profile full up

# Or use the npm shortcut
npm run docker:start
```

### Stop Services

```bash
# Stop specific profile
docker-compose --profile scraper down

# Stop everything
docker-compose down

# Stop and remove volumes (CAUTION: deletes data)
docker-compose down -v
```

---

## Profile Matrix

| Service | `scraper` | `db` | `kafka` | `full` |
|---------|-----------|------|---------|--------|
| postgres | ✓ | ✓ | ✗ | ✓ |
| dim-scraper | ✓ | ✗ | ✗ | ✓ |
| zookeeper | ✗ | ✗ | ✓ | ✓ |
| kafka | ✗ | ✗ | ✓ | ✓ |
| kafka-ui | ✗ | ✗ | ✓ | ✓ |
| eth-listener | ✗ | ✗ | ✗ | ✓ |
| spark-consumer | ✗ | ✗ | ✗ | ✓ |

---

## Examples

### Example 1: First Time Setup

```bash
# 1. Start database and scraper to populate dim tables
docker-compose --profile scraper up

# Wait for scraper to complete, then verify
docker exec -it eth-listener-postgres psql -U eth_user -d ethereum_data -c \
  "SELECT COUNT(*) FROM dim_contract;"

# 2. Start full stack
docker-compose --profile full up
```

### Example 2: Update Dimension Tables

```bash
# Database is already running with data
docker-compose --profile db up -d

# Run scraper to update (safe - uses upsert)
docker-compose run --rm dim-scraper

# Verify updates
docker exec -it eth-listener-postgres psql -U eth_user -d ethereum_data -c \
  "SELECT protocol, COUNT(*) FROM dim_contract GROUP BY protocol;"
```

### Example 3: Development Workflow

```bash
# Terminal 1: Database only
docker-compose --profile db up

# Terminal 2: Your application
cd eth-listener
npm run dev

# Terminal 3: Run scraper when needed
docker-compose run --rm dim-scraper
```

---

## Notes

- **Profiles must be specified** with `--profile` flag (Docker Compose v2)
- **Persistent volumes** - Database data persists at `~/Projects/db`
- **Init script** - Uses `IF NOT EXISTS` to safely handle existing volumes
- **Scraper restart policy** - Set to `"no"` so it exits after completion
- **Health checks** - Services wait for dependencies to be healthy before starting
