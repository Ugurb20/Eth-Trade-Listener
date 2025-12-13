# PySpark Kafka Consumer Dockerfile
FROM python:3.11-slim

# Install Java (required for PySpark)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Set Java environment variable
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the consumer script
COPY kafka_consumer.py .

# Set environment variables (can be overridden in docker-compose)
ENV KAFKA_BOOTSTRAP_SERVERS=kafka:9092
ENV KAFKA_TOPIC=blockchain.txs.raw
ENV CONSUMER_GROUP_ID=spark-eth-consumer

# Run the consumer
CMD ["python", "kafka_consumer.py"]