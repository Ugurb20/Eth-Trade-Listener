# Docker Compose Profiles

## Available Profiles

### `scraper` - Database + Scraper
```bash
docker-compose --profile scraper up
```
**Runs:** PostgreSQL, dim-scraper

---

### `db` - Database Only
```bash
docker-compose --profile db up -d
```
**Runs:** PostgreSQL

---

### `kafka` - Kafka Stack
```bash
docker-compose --profile kafka up
```
**Runs:** Zookeeper, Kafka, Kafka UI

---

### `no-scraper` - Everything Except Scraper
```bash
docker-compose --profile no-scraper up
```
**Runs:** Zookeeper, Kafka, Kafka UI, PostgreSQL, eth-listener, spark-consumer

---

### `full` - Everything
```bash
docker-compose --profile full up
```
**Runs:** Zookeeper, Kafka, Kafka UI, PostgreSQL, dim-scraper, eth-listener, spark-consumer

---

## Profile Matrix

| Service | `scraper` | `db` | `kafka` | `no-scraper` | `full` |
|---------|-----------|------|---------|--------------|--------|
| postgres | ✓ | ✓ | ✗ | ✓ | ✓ |
| dim-scraper | ✓ | ✗ | ✗ | ✗ | ✓ |
| zookeeper | ✗ | ✗ | ✓ | ✓ | ✓ |
| kafka | ✗ | ✗ | ✓ | ✓ | ✓ |
| kafka-ui | ✗ | ✗ | ✓ | ✓ | ✓ |
| eth-listener | ✗ | ✗ | ✗ | ✓ | ✓ |
| spark-consumer | ✗ | ✗ | ✗ | ✓ | ✓ |

---

## Common Commands

```bash
# Run scraper once
docker-compose run --rm dim-scraper

# Stop all services
docker-compose down

# Stop and remove volumes (deletes data)
docker-compose down -v
```
