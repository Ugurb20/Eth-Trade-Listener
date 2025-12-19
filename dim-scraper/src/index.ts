// Main entry point for dimension table scraper
import { DatabaseManager } from './db/connection';
import { FourByteScraper } from './scrapers/fourbyte-scraper';
import { UniswapGraphScraper } from './scrapers/uniswap-graph-scraper';
import { ContractInfo, FunctionInfo, CalldataSlice, DatabaseConfig } from './types';

class DimensionTableScraper {
  private db: DatabaseManager;
  private fourByteScraper: FourByteScraper;
  private uniswapGraphScraper: UniswapGraphScraper | null;

  constructor(dbConfig: DatabaseConfig, graphApiKey?: string) {
    this.db = new DatabaseManager(dbConfig);
    this.fourByteScraper = new FourByteScraper();
    this.uniswapGraphScraper = graphApiKey ? new UniswapGraphScraper(graphApiKey) : null;
  }

  /**
   * Main scraping workflow
   */
  async run(): Promise<void> {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║    Ethereum DeFi Dimension Table Scraper                   ║');
    console.log('║    Populating contract and function signature tables       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      // Connect to database
      await this.db.connect();

      await this.scrapeContracts();

      await this.scrapeFunctions();

      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║    ✓ Scraping Complete!                                    ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');

    } catch (error) {
      console.error('\n✗ Scraping failed:', error);
      throw error;
    } finally {
      await this.db.close();
    }
  }

  /**
   * Step 1: Scrape contract addresses from Uniswap subgraph
   */
  private async scrapeContracts(): Promise<void> {
    console.log('\n━━━ Step 1: Scraping Contract Addresses ━━━\n');

    const allContracts: ContractInfo[] = [];

    // Fetch from Uniswap Graph API (if API key provided)
    if (this.uniswapGraphScraper) {
      console.log('Fetching from Uniswap subgraph...');
      const uniswapContracts = await this.uniswapGraphScraper.fetchAllContracts(100);
      allContracts.push(...uniswapContracts);
    } else {
      console.log('⚠️  Skipping Uniswap subgraph (no API key provided)');
    }

    // Deduplicate by contract address
    const uniqueContracts = this.deduplicateContracts(allContracts);

    // Insert into database
    console.log(`\n→ Inserting ${uniqueContracts.length} unique contracts into database...`);
    await this.db.insertContracts(uniqueContracts);
  }

  /**
   * Step 2: Scrape function signatures from 4byte.directory
   */
  private async scrapeFunctions(): Promise<void> {
    console.log('\n━━━ Step 2: Scraping Function Signatures ━━━\n');

    const allFunctions: FunctionInfo[] = [];

    console.log('[1/2] Fetching swap function signatures from 4byte.directory...');
    const swapFunctions = await this.fourByteScraper.getSwapFunctions();
    allFunctions.push(...swapFunctions);

    console.log('\n[2/2] Fetching liquidity function signatures from 4byte.directory...');
    const liquidityFunctions = await this.fourByteScraper.getLiquidityFunctions();
    allFunctions.push(...liquidityFunctions);

    const uniqueFunctions = this.deduplicateFunctions(allFunctions);

    console.log(`\n→ Inserting ${uniqueFunctions.length} unique function signatures into database...`);
    await this.db.insertFunctions(uniqueFunctions);
  }




  /**
   * Deduplicate contracts by address (keep first occurrence)
   */
  private deduplicateContracts(contracts: ContractInfo[]): ContractInfo[] {
    const seen = new Set<string>();
    const unique: ContractInfo[] = [];

    for (const contract of contracts) {
      const key = contract.contract_address.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          ...contract,
          contract_address: contract.contract_address.toLowerCase(),
        });
      }
    }

    return unique;
  }

  /**
   * Deduplicate functions by selector (keep first occurrence)
   */
  private deduplicateFunctions(functions: FunctionInfo[]): FunctionInfo[] {
    const seen = new Set<string>();
    const unique: FunctionInfo[] = [];

    for (const func of functions) {
      const key = func.function_selector.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          ...func,
          function_selector: func.function_selector.toLowerCase(),
        });
      }
    }

    return unique;
  }
}

// Main execution
async function main() {
  const dbConfig: DatabaseConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'ethereum_data',
    user: process.env.POSTGRES_USER || 'eth_user',
    password: process.env.POSTGRES_PASSWORD || 'eth_password',
  };

  const graphApiKey = process.env.GRAPH_API_KEY;

  if (graphApiKey) {
    console.log('✓ Graph API key found - will fetch from Uniswap subgraph');
  } else {
    console.log('⚠️  No Graph API key found - skipping Uniswap subgraph');
  }

  const scraper = new DimensionTableScraper(dbConfig, graphApiKey);

  try {
    await scraper.run();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { DimensionTableScraper };
