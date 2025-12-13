-- PostgreSQL Initialization Script for Ethereum Transaction Listener
-- This script creates the raw transaction table with all necessary indexes

-- Create the raw transactions table
CREATE TABLE ethereum_transactions_raw (
    -- Identity
    hash                    TEXT PRIMARY KEY,

    -- Block context (NULL for mempool txs)
    block_number            BIGINT,
    block_timestamp         TIMESTAMPTZ,
    transaction_index       INTEGER,

    -- Parties
    from_address            TEXT NOT NULL,
    to_address              TEXT,

    -- Value (ETH, in wei)
    value_wei               NUMERIC(38, 0) NOT NULL,

    -- Gas
    gas_limit               NUMERIC(38, 0) NOT NULL,
    gas_price               NUMERIC(38, 0),
    max_fee_per_gas         NUMERIC(38, 0),
    max_priority_fee_per_gas NUMERIC(38, 0),
    effective_gas_price     NUMERIC(38, 0),

    -- Transaction data
    data                    TEXT NOT NULL,
    nonce                   BIGINT NOT NULL,
    tx_type                 SMALLINT,
    chain_id                TEXT NOT NULL,

    -- Receipt info (NULL until mined)
    status                  SMALLINT,

    -- Metadata
    received_at             TIMESTAMPTZ NOT NULL,
    network                 TEXT NOT NULL
);

-- Create indexes for common query patterns
CREATE INDEX idx_block_number ON ethereum_transactions_raw(block_number) WHERE block_number IS NOT NULL;
CREATE INDEX idx_from_address ON ethereum_transactions_raw(from_address);
CREATE INDEX idx_to_address ON ethereum_transactions_raw(to_address) WHERE to_address IS NOT NULL;
CREATE INDEX idx_received_at ON ethereum_transactions_raw(received_at);
CREATE INDEX idx_network ON ethereum_transactions_raw(network);
CREATE INDEX idx_chain_id ON ethereum_transactions_raw(chain_id);

-- Create a composite index for time-based queries by network
CREATE INDEX idx_network_received_at ON ethereum_transactions_raw(network, received_at DESC);

-- Comment on table and columns for documentation
COMMENT ON TABLE ethereum_transactions_raw IS 'Stores raw Ethereum transactions from the listener service';
COMMENT ON COLUMN ethereum_transactions_raw.hash IS 'Transaction hash (unique identifier)';
COMMENT ON COLUMN ethereum_transactions_raw.block_number IS 'Block number (NULL for pending transactions)';
COMMENT ON COLUMN ethereum_transactions_raw.from_address IS 'Sender address';
COMMENT ON COLUMN ethereum_transactions_raw.to_address IS 'Recipient address (NULL for contract creation)';
COMMENT ON COLUMN ethereum_transactions_raw.value_wei IS 'Transaction value in wei';
COMMENT ON COLUMN ethereum_transactions_raw.received_at IS 'Timestamp when transaction was received by listener';
COMMENT ON COLUMN ethereum_transactions_raw.network IS 'Network name (e.g., mainnet, sepolia)';
