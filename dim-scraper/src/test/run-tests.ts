// Standalone test runner - no dependencies on test frameworks
import { FourByteScraper } from '../scrapers/fourbyte-scraper';
import { GitHubScraper } from '../scrapers/github-scraper';
import { DefiLlamaScraper } from '../scrapers/defillama-scraper';
import { SignatureComputer } from '../utils/signatures';

class TestRunner {
  private passed = 0;
  private failed = 0;
  private  tests: Array<() => Promise<void>> = [];

  add(name: string, fn: () => Promise<void>) {
    this.tests.push(async () => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`TEST: ${name}`);
      console.log('='.repeat(70));
      try {
        await fn();
        this.passed++;
        console.log(`\n✅ PASSED: ${name}\n`);
      } catch (error) {
        this.failed++;
        console.log(`\n❌ FAILED: ${name}`);
        console.error(`Error: ${error instanceof Error ? error.message : error}\n`);
      }
    });
  }

  async run() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           DIM-SCRAPER TEST SUITE - DATA SOURCE VALIDATION      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    for (const test of this.tests) {
      await test();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST RESULTS                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`  ✅ Passed: ${this.passed}`);
    console.log(`  ❌ Failed: ${this.failed}`);
    console.log(`  ⏱️  Duration: ${duration}s`);
    console.log('');

    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TEST SUITE
// ============================================================================

const runner = new TestRunner();

// Test 1: 4byte.directory - Search signatures
runner.add('4byte.directory - Search for swap signatures', async () => {
  const scraper = new FourByteScraper();
  const results = await scraper.searchSignatures('swapExactTokensForTokens');

  console.log(`Found ${results.length} signatures`);
  assert(results.length > 0, 'Should find at least one signature');

  const first = results[0];
  console.log(`Sample: ${first.hex_signature} -> ${first.text_signature}`);

  assert(first.hex_signature.match(/^0x[a-fA-F0-9]{8}$/) !== null, 'Selector should be valid hex');
  assert(first.text_signature.length > 0, 'Signature should have text');
});

// Test 2: 4byte.directory - Lookup selector
runner.add('4byte.directory - Lookup known selector', async () => {
  const scraper = new FourByteScraper();
  const result = await scraper.lookupSelector('0x38ed1739');

  console.log(`Lookup result: ${result?.text_signature || 'not found'}`);
  assert(result !== null, 'Should find the selector');
  assert(result.hex_signature === '0x38ed1739', 'Selector should match');
  assert(result.text_signature.includes('swapExactTokensForTokens'), 'Should be swap function');
});

// Test 3: 4byte.directory - Get swap functions
runner.add('4byte.directory - Fetch swap functions', async () => {
  const scraper = new FourByteScraper();
  const functions = await scraper.getSwapFunctions();

  console.log(`Collected ${functions.length} swap functions`);
  assert(functions.length > 10, 'Should find at least 10 known swap functions');
  assert(functions.length < 100, 'Should not return too many functions (should be curated list)');

  const byProtocol: any = {};
  functions.forEach(f => {
    byProtocol[f.protocol] = (byProtocol[f.protocol] || 0) + 1;
  });

  console.log('Functions by protocol:');
  Object.entries(byProtocol).forEach(([protocol, count]) => {
    console.log(`  ${protocol}: ${count}`);
  });

  // Should have real protocols, not "unknown"
  assert(!byProtocol['unknown'] || byProtocol['unknown'] === 0, 'Should not have unknown protocols');
  assert(byProtocol['uniswap_v2'] > 0, 'Should have Uniswap V2 functions');
  assert(byProtocol['uniswap_v3'] > 0, 'Should have Uniswap V3 functions');
});

// Test 4: GitHub - Uniswap V2
runner.add('GitHub - Fetch Uniswap V2 contracts', async () => {
  const scraper = new GitHubScraper();
  const contracts = await scraper.fetchUniswapV2Deployments();

  console.log(`Fetched ${contracts.length} Uniswap V2 contracts`);
  assert(contracts.length > 0, 'Should find Uniswap V2 contracts');

  contracts.forEach(c => {
    console.log(`  ${c.contract_address} (${c.protocol} ${c.version})`);
    assert(c.protocol === 'uniswap', 'Protocol should be uniswap');
    assert(c.version === 'v2', 'Version should be v2');
    assert(c.contract_address.match(/^0x[a-fA-F0-9]{40}$/) !== null, 'Address should be valid');
  });
});

// Test 5: GitHub - Uniswap V3
runner.add('GitHub - Fetch Uniswap V3 contracts', async () => {
  const scraper = new GitHubScraper();
  const contracts = await scraper.fetchUniswapV3Deployments();

  console.log(`Fetched ${contracts.length} Uniswap V3 contracts`);
  assert(contracts.length > 0, 'Should find Uniswap V3 contracts');
  assert(contracts.every(c => c.protocol === 'uniswap'), 'All should be Uniswap');
  assert(contracts.every(c => c.version === 'v3'), 'All should be V3');
});

// Test 6: GitHub - All deployments
runner.add('GitHub - Fetch all protocol deployments', async () => {
  const scraper = new GitHubScraper();
  const contracts = await scraper.fetchAllDeployments();

  console.log(`Total contracts fetched: ${contracts.length}`);
  assert(contracts.length > 10, 'Should find more than 10 contracts');

  const protocols = new Set(contracts.map(c => c.protocol));
  console.log(`Protocols found: ${Array.from(protocols).join(', ')}`);

  const expectedProtocols = ['uniswap', 'sushiswap', 'curve', 'balancer', '1inch'];
  expectedProtocols.forEach(protocol => {
    assert(protocols.has(protocol), `Should include ${protocol}`);
  });

  // Check for duplicates
  const addresses = new Set(contracts.map(c => c.contract_address));
  assert(addresses.size === contracts.length, 'Should have no duplicate addresses');
});

// Test 7: DeFi Llama - Protocols
runner.add('DeFi Llama - Fetch protocols', async () => {
  const scraper = new DefiLlamaScraper();
  const protocols = await scraper.fetchProtocols();

  console.log(`Fetched ${protocols.length} protocols`);
  assert(protocols.length > 100, 'Should find many protocols');

  if (protocols.length > 0) {
    console.log(`Sample protocol: ${protocols[0].name}`);
  }
});

// Test 8: DeFi Llama - Ethereum DEXs
runner.add('DeFi Llama - Fetch Ethereum DEXs', async () => {
  const scraper = new DefiLlamaScraper();
  const dexes = await scraper.fetchEthereumDEXs();

  console.log(`Found ${dexes.length} DEXs on Ethereum`);
  assert(dexes.length > 10, 'Should find many DEXs');

  dexes.forEach((dex: any) => {
    assert(dex.category === 'Dexs', 'Category should be Dexs');
    assert(dex.chains.includes('Ethereum'), 'Should include Ethereum');
  });

  console.log('Top 5 DEXs by TVL:');
  dexes.slice(0, 5).forEach((dex: any, index: number) => {
    console.log(`  ${index + 1}. ${dex.name} - $${(dex.tvl / 1e6).toFixed(2)}M`);
  });
});

// Test 9: DeFi Llama - Chain TVLs
runner.add('DeFi Llama - Fetch chain TVLs', async () => {
  const scraper = new DefiLlamaScraper();
  const chains = await scraper.fetchChainTVLs();

  console.log(`Fetched TVL for ${chains.length} chains`);
  assert(chains.length > 10, 'Should find many chains');

  const ethereum = chains.find((c: any) => c.name === 'Ethereum');
  assert(ethereum !== undefined, 'Should find Ethereum');
  console.log(`Ethereum TVL: $${(ethereum.tvl / 1e9).toFixed(2)}B`);
});

// Test 10: Signature computation
runner.add('Signature Computation - Verify against 4byte', async () => {
  const fourbyte = new FourByteScraper();

  const testCases = [
    {
      signature: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      expectedSelector: '0x38ed1739',
    },
    {
      signature: 'transfer(address,uint256)',
      expectedSelector: '0xa9059cbb',
    },
  ];

  for (const testCase of testCases) {
    const computed = SignatureComputer.computeSelector(testCase.signature);
    console.log(`${testCase.signature}`);
    console.log(`  Computed: ${computed}`);
    console.log(`  Expected: ${testCase.expectedSelector}`);

    assert(
      computed.toLowerCase() === testCase.expectedSelector.toLowerCase(),
      'Computed selector should match expected'
    );

    // Verify with 4byte
    const result = await fourbyte.lookupSelector(testCase.expectedSelector);
    if (result) {
      console.log(`  4byte verified: ✓`);
    }

    await sleep(500);
  }
});

// Test 11: Integration - Data source availability
runner.add('Integration - Verify all data sources are available', async () => {
  const results: any = {
    github: false,
    fourbyte: false,
    defillama: false,
  };

  // Test GitHub
  try {
    const github = new GitHubScraper();
    const contracts = await github.fetchUniswapV2Deployments();
    results.github = contracts.length > 0;
    console.log(`GitHub: ${results.github ? '✓ Available' : '✗ Unavailable'} (${contracts.length} contracts)`);
  } catch (error) {
    console.log(`GitHub: ✗ Error - ${error}`);
  }

  // Test 4byte
  try {
    const fourbyte = new FourByteScraper();
    const sigs = await fourbyte.searchSignatures('transfer');
    results.fourbyte = sigs.length > 0;
    console.log(`4byte.directory: ${results.fourbyte ? '✓ Available' : '✗ Unavailable'} (${sigs.length} results)`);
  } catch (error) {
    console.log(`4byte.directory: ✗ Error - ${error}`);
  }

  // Test DeFi Llama
  try {
    const defillama = new DefiLlamaScraper();
    const protocols = await defillama.fetchProtocols();
    results.defillama = protocols.length > 0;
    console.log(`DeFi Llama: ${results.defillama ? '✓ Available' : '✗ Unavailable'} (${protocols.length} protocols)`);
  } catch (error) {
    console.log(`DeFi Llama: ✗ Error - ${error}`);
  }

  console.log('\nSummary:');
  console.log(`  GitHub: ${results.github ? '✓' : '✗'}`);
  console.log(`  4byte.directory: ${results.fourbyte ? '✓' : '✗'}`);
  console.log(`  DeFi Llama: ${results.defillama ? '✓' : '✗'}`);

  // At least 2 out of 3 should work
  const available = Object.values(results).filter(Boolean).length;
  assert(available >= 2, `At least 2 data sources should be available (got ${available})`);
});

// Run all tests
runner.run().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
