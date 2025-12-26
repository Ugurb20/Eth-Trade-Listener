-- Insert queries for swapExactETHForTokens function
-- Function: swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)
-- MethodID: 0x7ff36ab5

-- 1. Insert function definition into dim_function
INSERT INTO dim_function (function_selector, protocol, function_type, source)
VALUES ('0x7ff36ab5', 'UniswapV2Router', 'swap', 'manual')
ON CONFLICT DO NOTHING;

-- 2. Insert calldata slices into dim_calldata_slice

-- Slice 1: amountOutMin (parameter at index 0)
-- Location: bytes 4-35 (after 4-byte selector)
-- Length: 32 bytes
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'amountOutMin',
    4,
    32,
    false,
    'out',
    'manual'
);

-- Slice 2: path array offset (parameter at index 1)
-- Location: bytes 36-67
-- Length: 32 bytes
-- Note: This is a pointer to where the dynamic array starts
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'path_offset',
    36,
    32,
    false,
    NULL,
    'manual'
);

-- Slice 3: to (recipient address, parameter at index 2)
-- Location: bytes 68-99
-- Length: 32 bytes (address is 20 bytes, left-padded with zeros)
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'to',
    68,
    32,
    false,
    NULL,
    'manual'
);

-- Slice 4: deadline (parameter at index 3)
-- Location: bytes 100-131
-- Length: 32 bytes
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'deadline',
    100,
    32,
    false,
    NULL,
    'manual'
);

-- Slice 5: path array length (at the offset location)
-- Location: bytes 132-163
-- Length: 32 bytes
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'path_length',
    132,
    32,
    true,
    NULL,
    'manual'
);

-- Slice 6: path[0] - first token in swap path (token being swapped FROM - WETH)
-- Location: bytes 164-195
-- Length: 32 bytes
-- Value in example: 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 (WETH)
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'path[0]',
    164,
    32,
    true,
    'in',
    'manual'
);

-- Slice 7: path[1] - second token in swap path
-- Location: bytes 196-227
-- Length: 32 bytes
-- For 2-token swaps: This is the final output token (direction: 'out')
-- For multi-hop swaps: This is an intermediate token (direction: NULL)
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'path[1]',
    196,
    32,
    true,
    NULL,
    'manual'
);

-- Slice 8: path[2] - third token in swap path (for multi-hop swaps)
-- Location: bytes 228-259
-- Length: 32 bytes
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'path[2]',
    228,
    32,
    true,
    NULL,
    'manual'
);

-- Slice 9: path[3] - fourth token in swap path (for multi-hop swaps)
-- Location: bytes 260-291
-- Length: 32 bytes
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'path[3]',
    260,
    32,
    true,
    NULL,
    'manual'
);

-- Slice 10: path[4] - fifth token in swap path (final output token for 5-hop swaps)
-- Location: bytes 292-323
-- Length: 32 bytes
-- This is always the final output token (direction: 'out')
INSERT INTO dim_calldata_slice (
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
)
VALUES (
    '0x7ff36ab5',
    'path[4]',
    292,
    32,
    true,
    'out',
    'manual'
);

-- Note:
-- - path[0] always has direction 'in' (source token)
-- - path[4] always has direction 'out' (final destination token)
-- - path[1], path[2], path[3] are intermediate tokens with NULL direction
-- - Not all paths will use all 5 slots; check path_length to determine actual array size

-- Verification query to see all slices for this function
SELECT
    function_selector,
    field_name,
    start_byte,
    length_bytes,
    is_dynamic,
    token_direction,
    source
FROM dim_calldata_slice
WHERE function_selector = '0x7ff36ab5'
ORDER BY start_byte;
