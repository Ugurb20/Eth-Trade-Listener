-- PostgreSQL Initialization Script for Ethereum Transaction Listener
-- This script creates the raw transaction table with all necessary indexes
-- All CREATE statements use IF NOT EXISTS to be idempotent and safe for existing volumes

-- Create the raw transactions table
CREATE TABLE IF NOT EXISTS ethereum_transactions_raw (
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
CREATE INDEX IF NOT EXISTS idx_block_number ON ethereum_transactions_raw(block_number) WHERE block_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_from_address ON ethereum_transactions_raw(from_address);
CREATE INDEX IF NOT EXISTS idx_to_address ON ethereum_transactions_raw(to_address) WHERE to_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_received_at ON ethereum_transactions_raw(received_at);
CREATE INDEX IF NOT EXISTS idx_network ON ethereum_transactions_raw(network);
CREATE INDEX IF NOT EXISTS idx_chain_id ON ethereum_transactions_raw(chain_id);

-- Create a composite index for time-based queries by network
CREATE INDEX IF NOT EXISTS idx_network_received_at ON ethereum_transactions_raw(network, received_at DESC);

-- Comment on table and columns for documentation
COMMENT ON TABLE ethereum_transactions_raw IS 'Stores raw Ethereum transactions from the listener service';
COMMENT ON COLUMN ethereum_transactions_raw.hash IS 'Transaction hash (unique identifier)';
COMMENT ON COLUMN ethereum_transactions_raw.block_number IS 'Block number (NULL for pending transactions)';
COMMENT ON COLUMN ethereum_transactions_raw.from_address IS 'Sender address';
COMMENT ON COLUMN ethereum_transactions_raw.to_address IS 'Recipient address (NULL for contract creation)';
COMMENT ON COLUMN ethereum_transactions_raw.value_wei IS 'Transaction value in wei';
COMMENT ON COLUMN ethereum_transactions_raw.received_at IS 'Timestamp when transaction was received by listener';
COMMENT ON COLUMN ethereum_transactions_raw.network IS 'Network name (e.g., mainnet, sepolia)';

-- ============================================================================
-- DIMENSION TABLES FOR ADVANCED TRANSACTION DECODING
-- ============================================================================
-- These tables support future enhancement for decoding swap transactions
-- and parsing calldata from known DeFi protocols
-- ============================================================================

-- Dimension table for known contracts
CREATE TABLE IF NOT EXISTS dim_contract (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_address    TEXT NOT NULL,
    protocol            TEXT NOT NULL,      -- uniswap, sushi, aave
    version             TEXT NOT NULL,      -- v2, v3
    source              TEXT NOT NULL,      -- github, defillama, manual
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_contract_address ON dim_contract(contract_address);
CREATE INDEX IF NOT EXISTS idx_dim_contract_protocol ON dim_contract(protocol);
CREATE INDEX IF NOT EXISTS idx_dim_contract_version ON dim_contract(version);
CREATE INDEX IF NOT EXISTS idx_dim_contract_source ON dim_contract(source);

COMMENT ON TABLE dim_contract IS 'Known DeFi protocol contracts for transaction decoding';
COMMENT ON COLUMN dim_contract.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN dim_contract.contract_address IS 'Contract address';
COMMENT ON COLUMN dim_contract.protocol IS 'Protocol name (e.g., uniswap, sushi, aave)';
COMMENT ON COLUMN dim_contract.version IS 'Protocol version (e.g., v2, v3)';
COMMENT ON COLUMN dim_contract.source IS 'Data source (e.g., github, defillama, manual)';
COMMENT ON COLUMN dim_contract.created_at IS 'Timestamp when record was created';

-- Dimension table for function selectors
CREATE TABLE IF NOT EXISTS dim_function (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_selector   CHAR(10) NOT NULL,  -- 0x38ed1739
    protocol            TEXT NOT NULL,
    function_type       TEXT NOT NULL,      -- swap_exact_in, swap_exact_out
    source              TEXT NOT NULL,      -- 4byte, manual
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_function_selector ON dim_function(function_selector);
CREATE INDEX IF NOT EXISTS idx_dim_function_protocol ON dim_function(protocol);
CREATE INDEX IF NOT EXISTS idx_dim_function_type ON dim_function(function_type);
CREATE INDEX IF NOT EXISTS idx_dim_function_source ON dim_function(source);

COMMENT ON TABLE dim_function IS 'Known function selectors for transaction decoding';
COMMENT ON COLUMN dim_function.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN dim_function.function_selector IS 'Function selector (4-byte signature, e.g., 0x38ed1739)';
COMMENT ON COLUMN dim_function.protocol IS 'Protocol name associated with this function';
COMMENT ON COLUMN dim_function.function_type IS 'Function type (e.g., swap_exact_in, swap_exact_out)';
COMMENT ON COLUMN dim_function.source IS 'Data source (e.g., 4byte, manual)';
COMMENT ON COLUMN dim_function.created_at IS 'Timestamp when record was created';

-- Dimension table for calldata slicing rules
-- Enhanced to include token swap information directly in slices
CREATE TABLE IF NOT EXISTS dim_calldata_slice (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_selector   CHAR(10) NOT NULL,
    field_name          TEXT NOT NULL,      -- amount_in, path, deadline, token0, token1
    start_byte          INTEGER NOT NULL,
    length_bytes        INTEGER NOT NULL,
    is_dynamic          BOOLEAN NOT NULL,
    token_direction     TEXT,               -- 'token_in' or 'token_out' for swap tokens, NULL for non-swap fields
    source              TEXT NOT NULL,      -- generated, manual
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_calldata_slice_selector ON dim_calldata_slice(function_selector);
CREATE INDEX IF NOT EXISTS idx_dim_calldata_slice_field ON dim_calldata_slice(function_selector, field_name);
CREATE INDEX IF NOT EXISTS idx_dim_calldata_slice_source ON dim_calldata_slice(source);

COMMENT ON TABLE dim_calldata_slice IS 'Rules for parsing calldata fields by function selector, including token swap information';
COMMENT ON COLUMN dim_calldata_slice.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN dim_calldata_slice.function_selector IS 'Function selector this rule applies to';
COMMENT ON COLUMN dim_calldata_slice.field_name IS 'Name of the field to extract (e.g., amount_in, path, deadline, token0, token1)';
COMMENT ON COLUMN dim_calldata_slice.start_byte IS 'Starting byte position in calldata';
COMMENT ON COLUMN dim_calldata_slice.length_bytes IS 'Length of the field in bytes';
COMMENT ON COLUMN dim_calldata_slice.is_dynamic IS 'Whether this field has dynamic length';
COMMENT ON COLUMN dim_calldata_slice.token_direction IS 'For swap tokens: token_in (token0) or token_out (token1), NULL for non-swap fields';
COMMENT ON COLUMN dim_calldata_slice.source IS 'Data source (e.g., generated, manual)';
COMMENT ON COLUMN dim_calldata_slice.created_at IS 'Timestamp when record was created';
