-- Test Query: Check if from_address or to_address from transactions with data match dim_contract
-- Only checks transactions that have calldata (data != '0x')
-- Helps identify which known contracts are being interacted with
-- NOTE: Uses LOWER() to handle case-insensitive address matching

-- Summary view: Count of matches by address type
SELECT
    'from_address matches' AS match_type,
    COUNT(DISTINCT etr.from_address) AS unique_addresses,
    COUNT(*) AS total_transactions
FROM
    ethereum_transactions_raw etr
INNER JOIN
    dim_contract dc
    ON LOWER(etr.from_address) = LOWER(dc.contract_address)
WHERE
    etr.data != '0x'
    AND LENGTH(etr.data) > 2

UNION ALL

SELECT
    'to_address matches' AS match_type,
    COUNT(DISTINCT etr.to_address) AS unique_addresses,
    COUNT(*) AS total_transactions
FROM
    ethereum_transactions_raw etr
INNER JOIN
    dim_contract dc
    ON LOWER(etr.to_address) = LOWER(dc.contract_address)
WHERE
    etr.data != '0x'
    AND LENGTH(etr.data) > 2;

-- Detailed view: Show which contracts are matched
SELECT
    'FROM' AS address_type,
    dc.contract_address,
    dc.protocol,
    dc.version,
    dc.pairname,
    COUNT(*) AS transaction_count,
    COUNT(DISTINCT etr.to_address) AS unique_targets,
    (ARRAY_AGG(etr.hash ORDER BY etr.received_at DESC))[1:5] AS sample_tx_hashes
FROM
    ethereum_transactions_raw etr
INNER JOIN
    dim_contract dc
    ON LOWER(etr.from_address) = LOWER(dc.contract_address)
WHERE
    etr.data != '0x'
    AND LENGTH(etr.data) > 2
GROUP BY
    dc.contract_address,
    dc.protocol,
    dc.version,
    dc.pairname

UNION ALL

SELECT
    'TO' AS address_type,
    dc.contract_address,
    dc.protocol,
    dc.version,
    dc.pairname,
    COUNT(*) AS transaction_count,
    COUNT(DISTINCT etr.from_address) AS unique_callers,
    (ARRAY_AGG(etr.hash ORDER BY etr.received_at DESC))[1:5] AS sample_tx_hashes
FROM
    ethereum_transactions_raw etr
INNER JOIN
    dim_contract dc
    ON LOWER(etr.to_address) = LOWER(dc.contract_address)
WHERE
    etr.data != '0x'
    AND LENGTH(etr.data) > 2
GROUP BY
    dc.contract_address,
    dc.protocol,
    dc.version,
    dc.pairname

ORDER BY
    address_type,
    transaction_count DESC;

-- Combined view: Show all matches (FROM or TO) with function signature details
SELECT
    CASE
        WHEN LOWER(etr.from_address) = LOWER(dc.contract_address) THEN 'FROM'
        WHEN LOWER(etr.to_address) = LOWER(dc.contract_address) THEN 'TO'
        ELSE 'BOTH'
    END AS address_type,
    dc.contract_address,
    dc.protocol,
    dc.version,
    dc.pairname,
    etr.hash AS transaction_hash,
    etr.from_address,
    etr.to_address,
    SUBSTRING(etr.data FROM 1 FOR 10) AS function_selector,
    df.function_type,
    df.protocol AS function_protocol,
    etr.received_at,
    etr.data
FROM
    ethereum_transactions_raw etr
INNER JOIN
    dim_contract dc
    ON LOWER(etr.from_address) = LOWER(dc.contract_address)
    OR LOWER(etr.to_address) = LOWER(dc.contract_address)
LEFT JOIN
    dim_function df
    ON LOWER(SUBSTRING(etr.data FROM 1 FOR 10)) = LOWER(df.function_selector)
WHERE
    etr.data != '0x'
    AND LENGTH(etr.data) > 2
ORDER BY
    etr.received_at DESC
LIMIT 100;
