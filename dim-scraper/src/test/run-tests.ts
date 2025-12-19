// Standalone test runner - no dependencies on test frameworks
import { FourByteScraper } from '../scrapers/fourbyte-scraper';
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


// Test 7: Signature computation
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

// Test 8: Integration - Data source availability
runner.add('Integration - Verify 4byte data source is available', async () => {
  let fourbyteAvailable = false;

  // Test 4byte
  try {
    const fourbyte = new FourByteScraper();
    const sigs = await fourbyte.searchSignatures('transfer');
    fourbyteAvailable = sigs.length > 0;
    console.log(`4byte.directory: ${fourbyteAvailable ? '✓ Available' : '✗ Unavailable'} (${sigs.length} results)`);
  } catch (error) {
    console.log(`4byte.directory: ✗ Error - ${error}`);
  }

  console.log('\nSummary:');
  console.log(`  4byte.directory: ${fourbyteAvailable ? '✓' : '✗'}`);

  assert(fourbyteAvailable, '4byte.directory should be available');
});

// Run all tests
runner.run().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
