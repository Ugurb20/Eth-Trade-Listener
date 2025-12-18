// Scraper for DeFi Llama API - comprehensive DeFi protocol data
import axios from 'axios';
import { ContractInfo } from '../types';

export class DefiLlamaScraper {
  private baseUrl = 'https://api.llama.fi';

  /**
   * Fetch all DeFi protocols
   */
  async fetchProtocols(): Promise<any[]> {
    try {
      console.log('Fetching protocols from DeFi Llama...');
      const response = await axios.get(`${this.baseUrl}/protocols`);
      const protocols = response.data || [];
      console.log(`✓ Found ${protocols.length} total protocols`);
      return protocols;
    } catch (error) {
      console.error('Failed to fetch protocols from DeFi Llama:', error);
      return [];
    }
  }

  /**
   * Fetch Ethereum DEX protocols
   */
  async fetchEthereumDEXs(): Promise<any[]> {
    try {
      console.log('Filtering Ethereum DEX protocols...');
      const protocols = await this.fetchProtocols();

      const ethereumDEXs = protocols.filter((p: any) =>
        p.category === 'Dexs' &&
        p.chains?.includes('Ethereum') &&
        p.name &&
        p.tvl > 0
      );

      // Sort by TVL descending
      ethereumDEXs.sort((a: any, b: any) => (b.tvl || 0) - (a.tvl || 0));

      console.log(`✓ Found ${ethereumDEXs.length} DEX protocols on Ethereum`);

      // Print top protocols for reference
      ethereumDEXs.slice(0, 10).forEach((dex: any) => {
        console.log(`  - ${dex.name} (TVL: $${(dex.tvl / 1e6).toFixed(2)}M)`);
      });

      return ethereumDEXs;
    } catch (error) {
      console.error('Failed to fetch Ethereum DEXs:', error);
      return [];
    }
  }

  /**
   * Fetch detailed protocol information including contracts
   * Note: DeFi Llama doesn't directly expose contract addresses in their public API
   * This returns protocol metadata that can be cross-referenced
   */
  async fetchProtocolDetails(slug: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/protocol/${slug}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch details for ${slug}:`, error);
      return null;
    }
  }

  /**
   * Get protocol TVL history
   */
  async fetchProtocolTVL(slug: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/tvl/${slug}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch TVL for ${slug}:`, error);
      return null;
    }
  }

  /**
   * Fetch current TVL of all chains
   */
  async fetchChainTVLs(): Promise<any> {
    try {
      console.log('Fetching chain TVLs from DeFi Llama...');
      const response = await axios.get(`${this.baseUrl}/v2/chains`);
      const chains = response.data || [];

      const ethereum = chains.find((c: any) => c.name === 'Ethereum');
      if (ethereum) {
        console.log(`✓ Ethereum TVL: $${(ethereum.tvl / 1e9).toFixed(2)}B`);
      }

      return chains;
    } catch (error) {
      console.error('Failed to fetch chain TVLs:', error);
      return [];
    }
  }

  /**
   * Get list of known DEX protocol names for manual contract lookup
   * This helps identify which protocols to prioritize
   */
  async getTopDEXProtocols(limit: number = 20): Promise<string[]> {
    try {
      const dexes = await this.fetchEthereumDEXs();

      const top = dexes.slice(0, limit);
      const names = top.map((d: any) => d.name);

      console.log(`\n✓ Top ${limit} DEX protocols by TVL:`);
      top.forEach((dex: any, index: number) => {
        console.log(`  ${index + 1}. ${dex.name} - $${(dex.tvl / 1e6).toFixed(2)}M TVL`);
      });

      return names;
    } catch (error) {
      console.error('Failed to get top DEX protocols:', error);
      return [];
    }
  }

  /**
   * Main method to fetch DEX-related contracts from DeFi Llama
   * Note: DeFi Llama API doesn't provide router/factory contract addresses
   * We only use it for protocol discovery and TVL reference
   */
  async fetchDEXContracts(): Promise<ContractInfo[]> {
    console.log('\n=== Fetching DEX Data from DeFi Llama ===\n');
    console.log('⚠️  Note: DeFi Llama API does not provide DEX contract addresses');
    console.log('    Using this source for protocol discovery only\n');

    // Get top protocols for reference
    await this.getTopDEXProtocols(20);

    console.log('\n✓ DeFi Llama is useful for protocol discovery, but not contract addresses');
    console.log('✓ Contract addresses should be sourced from GitHub/official docs instead\n');

    // Return empty array since we can't extract meaningful contract addresses
    return [];
  }
}
