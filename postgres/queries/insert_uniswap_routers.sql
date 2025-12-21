-- Insert Uniswap V2 and V3 Router and Peripheral Contracts
-- These are the actual contracts that users interact with for swaps and liquidity operations
-- Source: https://docs.uniswap.org/contracts/v3/reference/deployments

-- Uniswap V3 Contracts (Mainnet)
INSERT INTO dim_contract (contract_address, protocol, version, source) VALUES
-- V3 Core
('0x1f98431c8ad98523631ae4a59f267346ea31f984', 'uniswap', 'v3_factory', 'manual'),

-- V3 Periphery & Routers
('0x1f98415757620b543a52e61c46b32eb19261f984', 'uniswap', 'v3_multicall', 'manual'),
('0x5ba1e12693dc8f9c48aad8770482f4739beed696', 'uniswap', 'v3_multicall2', 'manual'),
('0xb753548f6e010e7e680ba186f9ca1bdab2e90cf2', 'uniswap', 'v3_proxy_admin', 'manual'),
('0xbfd8137f7d1516d3ea5ca83523914859ec47f573', 'uniswap', 'v3_tick_lens', 'manual'),
('0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6', 'uniswap', 'v3_quoter', 'manual'),
('0xe592427a0aece92de3edee1f18e0157c05861564', 'uniswap', 'v3_swap_router', 'manual'),
('0x42b24a95702b9986e82d421cc3568932790a48ec', 'uniswap', 'v3_nft_descriptor', 'manual'),
('0x91ae842a5ffd8d12023116943e72a606179294f3', 'uniswap', 'v3_nft_position_descriptor', 'manual'),
('0xee6a57ec80ea46401049e92587e52f5ec1c24785', 'uniswap', 'v3_transparent_upgradeable_proxy', 'manual'),
('0xc36442b4a4522e871399cd717abdd847ab11fe88', 'uniswap', 'v3_nonfungible_position_manager', 'manual'),
('0xa5644e29708357803b5a882d272c41cc0df92b34', 'uniswap', 'v3_migrator', 'manual'),
('0x61ffe014ba17989e743c5f6cb21bf9697530b21e', 'uniswap', 'v3_quoter_v2', 'manual'),
('0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', 'uniswap', 'v3_swap_router_02', 'manual'),
('0x000000000022d473030f116ddee9f6b43ac78ba3', 'uniswap', 'permit2', 'manual'),
('0x66a9893cc07d91d95644aedd05d03f95e1dba8af', 'uniswap', 'universal_router', 'manual'),
('0xe34139463ba50bd61336e0c446bd8c0867c6fe65', 'uniswap', 'v3_staker', 'manual'),

-- Uniswap V2 Contracts (Mainnet)
('0x7a250d5630b4cf539739df2c5dacb4c659f2488d', 'uniswap', 'v2_router_02', 'manual'),
('0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f', 'uniswap', 'v2_factory', 'manual');

-- Verify the inserts
SELECT
    contract_address,
    protocol,
    version,
    source,
    created_at
FROM dim_contract
WHERE source = 'manual'
ORDER BY version, contract_address;
