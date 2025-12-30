// Main entry point for dimension table scraper
import * as fs from 'fs';
import * as path from 'path';
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

      await this.loadCalldataSlices();

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

    // Upsert into database (insert or update based on contract_address)
    console.log(`\n→ Upserting ${uniqueContracts.length} unique contracts into database...`);
    await this.db.upsertContracts(uniqueContracts);
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

    console.log(`\n→ Upserting ${uniqueFunctions.length} unique function signatures into database...`);
    await this.db.upsertFunctions(uniqueFunctions);
  }

  /**
   * Step 3: Load calldata slice rules from JSON file
   */
  private async loadCalldataSlices(): Promise<void> {
    console.log('\n━━━ Step 3: Loading Calldata Slice Rules ━━━\n');

    const jsonPath = path.join(__dirname, '../calldata_slice_rules.json');

    if (!fs.existsSync(jsonPath)) {
      console.log('⚠️  No calldata_slice_rules.json found - skipping');
      return;
    }

    try {
      const fileContent = fs.readFileSync(jsonPath, 'utf-8');
      const rulesData = JSON.parse(fileContent);

      let totalSlices = 0;

      for (const funcRules of rulesData) {
        const slices: CalldataSlice[] = funcRules.slices.map((slice: any) => ({
          function_selector: funcRules.function_selector,
          field_name: slice.field_name,
          start_byte: slice.start_byte,
          length_bytes: slice.length_bytes,
          is_dynamic: slice.is_dynamic,
          token_direction: slice.token_direction,
          source: slice.source,
        }));

        const upserted = await this.db.upsertCalldataSlices(slices);
        totalSlices += upserted;
      }

      console.log(`\n→ Loaded ${totalSlices} calldata slice rules from JSON`);
    } catch (error) {
      console.error('✗ Failed to load calldata slices:', error);
    }
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
