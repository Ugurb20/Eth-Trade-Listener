// Scraper for Uniswap subgraph - fetches most liquid pool contracts
import axios from 'axios';
import { ContractInfo } from '../types';

export class UniswapGraphScraper {
  private apiKey: string;
  private v3SubgraphUrl: string;
  private v4SubgraphUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // The Graph hosted service URLs with API key
    this.v3SubgraphUrl = `https://gateway-arbitrum.network.thegraph.com/api/${apiKey}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`;
    this.v4SubgraphUrl = `https://gateway-arbitrum.network.thegraph.com/api/${apiKey}/subgraphs/id/YOUR_V4_SUBGRAPH_ID`;
  }

  /**
   * Fetch most liquid Uniswap V3 pools
   */
  async fetchV3MostLiquidPools(limit: number = 100): Promise<ContractInfo[]> {
    const contracts: ContractInfo[] = [];

    try {
      console.log(`Fetching top ${limit} most liquid Uniswap V3 pools...`);

      const query = `
        {
          pools(
            first: ${limit},
            orderBy: liquidity,
            orderDirection: desc,
            where: {
              liquidity_gt: "0"
            }
          ) {
            id
            token0 {
              id
              symbol
              name
            }
            token1 {
              id
              symbol
              name
            }
            liquidity
            volumeUSD
            feeTier
            sqrtPrice
            totalValueLockedUSD
          }
        }
      `;

      const response = await axios.post(this.v3SubgraphUrl, {
        query
      });

      if (response.data.errors) {
        console.error('GraphQL errors:', response.data.errors);
        return contracts;
      }

      const pools = response.data.data?.pools || [];

      console.log(`✓ Found ${pools.length} liquid Uniswap V3 pools\n`);

      pools.forEach((pool: any, index: number) => {
        // Handle missing or invalid token symbols
        const token0Symbol = pool.token0?.symbol || pool.token0?.id?.slice(0, 8) || 'UNKNOWN';
        const token1Symbol = pool.token1?.symbol || pool.token1?.id?.slice(0, 8) || 'UNKNOWN';
        const pairname = `${token0Symbol}/${token1Symbol}`;

        const tvl = parseFloat(pool.totalValueLockedUSD || '0');
        const volume = parseFloat(pool.volumeUSD || '0');

        contracts.push({
          contract_address: pool.id,
          protocol: 'uniswap',
          version: 'v3_pool',
          pairname: pairname,
          total_volume_usd: volume,
          source: 'graph'
        });

        console.log(
          `  ${index + 1}. ${pairname} ` +
          `(Fee: ${pool.feeTier / 10000}%) - ` +
          `TVL: $${(tvl / 1e6).toFixed(2)}M, ` +
          `Volume: $${(volume / 1e6).toFixed(2)}M`
        );
        console.log(`     Pool: ${pool.id}`);
      });

      console.log('');
    } catch (error) {
      console.error('Failed to fetch Uniswap V3 pools:', error);
    }

    return contracts;
  }

  /**
   * Fetch Uniswap V3 factory and router contracts
   */
  async fetchV3CoreContracts(): Promise<ContractInfo[]> {
    const contracts: ContractInfo[] = [];

    try {
      console.log('Fetching Uniswap V3 core contracts...');

      const query = `
        {
          factories(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc) {
            id
            poolCount
            totalVolumeUSD
            totalValueLockedUSD
          }
        }
      `;

      const response = await axios.post(this.v3SubgraphUrl, {
        query
      });

      if (response.data.errors) {
        console.error('GraphQL errors:', response.data.errors);
        return contracts;
      }

      const factories = response.data.data?.factories || [];

      console.log(`✓ Found ${factories.length} Uniswap V3 factories\n`);

      factories.forEach((factory: any, index: number) => {
        contracts.push({
          contract_address: factory.id,
          protocol: 'uniswap',
          version: 'v3_factory',
          source: 'graph'
        });

        const tvl = parseFloat(factory.totalValueLockedUSD || '0');
        console.log(`  ${index + 1}. Uniswap V3 Factory: ${factory.id}`);
        console.log(`     Pool Count: ${factory.poolCount}, TVL: $${(tvl / 1e9).toFixed(2)}B`);
      });

      console.log('');
    } catch (error) {
      console.error('Failed to fetch Uniswap V3 core contracts:', error);
    }

    return contracts;
  }

  /**
   * Fetch top pools by volume (up to 500)
   */
  async fetchTopPoolsByVolume(limit: number = 500): Promise<ContractInfo[]> {
    const contracts: ContractInfo[] = [];

    try {
      console.log(`Fetching top ${limit} pools by volume...`);

      const query = `
        {
          pools(
            first: ${limit},
            orderBy: volumeUSD,
            orderDirection: desc
          ) {
            id
            token0 {
              id
              symbol
              name
            }
            token1 {
              id
              symbol
              name
            }
            volumeUSD
            totalValueLockedUSD
            feeTier
            txCount
          }
        }
      `;

      const response = await axios.post(this.v3SubgraphUrl, {
        query
      });

      if (response.data.errors) {
        console.error('GraphQL errors:', response.data.errors);
        return contracts;
      }

      const pools = response.data.data?.pools || [];

      console.log(`✓ Found ${pools.length} pools by volume\n`);

      pools.forEach((pool: any, index: number) => {
        // Handle missing or invalid token symbols
        const token0Symbol = pool.token0?.symbol || pool.token0?.id?.slice(0, 8) || 'UNKNOWN';
        const token1Symbol = pool.token1?.symbol || pool.token1?.id?.slice(0, 8) || 'UNKNOWN';
        const pairname = `${token0Symbol}/${token1Symbol}`;

        const tvl = parseFloat(pool.totalValueLockedUSD || '0');
        const volume = parseFloat(pool.volumeUSD || '0');

        contracts.push({
          contract_address: pool.id,
          protocol: 'uniswap',
          version: 'v3_pool',
          pairname: pairname,
          total_volume_usd: volume,
          source: 'graph'
        });

        console.log(
          `  ${index + 1}. ${pairname} ` +
          `(Fee: ${pool.feeTier / 10000}%) - ` +
          `Volume: $${(volume / 1e6).toFixed(2)}M, ` +
          `TVL: $${(tvl / 1e6).toFixed(2)}M, ` +
          `Txs: ${pool.txCount}`
        );
        console.log(`     Pool: ${pool.id}`);
      });

      console.log('');
    } catch (error) {
      console.error('Failed to fetch pools by volume:', error);
    }

    return contracts;
  }

  /**
   * Fetch most liquid Uniswap V4 pools (if v4 subgraph is available)
   */
  async fetchV4MostLiquidPools(limit: number = 100): Promise<ContractInfo[]> {
    const contracts: ContractInfo[] = [];

    try {
      console.log(`Fetching top ${limit} most liquid Uniswap V4 pools...`);

      const query = `
        {
          pools(
            first: ${limit},
            orderBy: liquidity,
            orderDirection: desc
          ) {
            id
            token0 {
              id
              symbol
            }
            token1 {
              id
              symbol
            }
            liquidity
            sqrtPrice
            feeTier
          }
        }
      `;

      // Note: V4 subgraph URL needs to be updated when available
      console.log('  ℹ️  Uniswap V4 subgraph integration pending\n');

    } catch (error) {
      console.error('Failed to fetch Uniswap V4 pools:', error);
    }

    return contracts;
  }

  /**
   * Fetch pools by minimum TVL threshold
   */
  async fetchPoolsByTVL(minTvlUSD: number, limit: number = 100): Promise<ContractInfo[]> {
    const contracts: ContractInfo[] = [];

    try {
      console.log(`Fetching Uniswap V3 pools with TVL >= $${(minTvlUSD / 1e6).toFixed(2)}M...`);

      const query = `
        {
          pools(
            first: ${limit},
            orderBy: totalValueLockedUSD,
            orderDirection: desc,
            where: {
              totalValueLockedUSD_gte: "${minTvlUSD}"
            }
          ) {
            id
            token0 {
              symbol
            }
            token1 {
              symbol
            }
            totalValueLockedUSD
            volumeUSD
            feeTier
          }
        }
      `;

      const response = await axios.post(this.v3SubgraphUrl, {
        query
      });

      if (response.data.errors) {
        console.error('GraphQL errors:', response.data.errors);
        return contracts;
      }

      const pools = response.data.data?.pools || [];

      console.log(`✓ Found ${pools.length} pools meeting TVL criteria\n`);

      pools.forEach((pool: any) => {
        contracts.push({
          contract_address: pool.id,
          protocol: 'uniswap',
          version: 'v3_pool',
          source: 'graph'
        });
      });

    } catch (error) {
      console.error('Failed to fetch pools by TVL:', error);
    }

    return contracts;
  }

  /**
   * Fetch all relevant Uniswap contracts
   */
  async fetchAllContracts(poolLimit: number = 100): Promise<ContractInfo[]> {
    console.log('\n=== Fetching Uniswap Contracts via The Graph ===\n');

    const allContracts: ContractInfo[] = [];

    // Fetch core contracts (factory, routers)
    const coreContracts = await this.fetchV3CoreContracts();
    allContracts.push(...coreContracts);

    // Fetch most liquid pools
    const liquidPools = await this.fetchV3MostLiquidPools(poolLimit);
    allContracts.push(...liquidPools);

    // Fetch top pools by volume (500 pools)
    const volumePools = await this.fetchTopPoolsByVolume(500);
    allContracts.push(...volumePools);

    console.log(`\n✓ Total Uniswap contracts fetched: ${allContracts.length}\n`);

    return allContracts;
  }
}
