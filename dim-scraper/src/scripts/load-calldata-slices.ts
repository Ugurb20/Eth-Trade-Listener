// Script to load calldata slice rules from JSON file
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseManager } from '../db/connection';
import { CalldataSlice, DatabaseConfig } from '../types';

interface CalldataSliceRule {
  field_name: string;
  start_byte: number;
  length_bytes: number;
  is_dynamic: boolean;
  token_direction: string | null;
  source: string;
  description?: string;
}

interface FunctionCalldataRules {
  function_selector: string;
  function_name: string;
  description: string;
  slices: CalldataSliceRule[];
}

async function loadCalldataSlices() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║    Calldata Slice Rules Loader                             ║');
  console.log('║    Loading rules from JSON and upserting to database       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Load database configuration from environment
  const dbConfig: DatabaseConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'ethereum_data',
    user: process.env.POSTGRES_USER || 'eth_user',
    password: process.env.POSTGRES_PASSWORD || 'eth_password',
  };

  // Path to JSON file
  const jsonPath = path.join(__dirname, '../../../postgres/queries/calldata_slice_rules.json');

  console.log(`📄 Reading rules from: ${jsonPath}`);

  // Read JSON file
  let rulesData: FunctionCalldataRules[];
  try {
    const fileContent = fs.readFileSync(jsonPath, 'utf-8');
    rulesData = JSON.parse(fileContent);
    console.log(`✓ Loaded ${rulesData.length} function rule sets\n`);
  } catch (error) {
    console.error('✗ Failed to read JSON file:', error);
    process.exit(1);
  }

  // Connect to database
  const db = new DatabaseManager(dbConfig);
  await db.connect();

  try {
    let totalSlices = 0;

    // Process each function's calldata rules
    for (const funcRules of rulesData) {
      console.log(`\n📌 Processing: ${funcRules.function_name} (${funcRules.function_selector})`);
      console.log(`   Description: ${funcRules.description}`);
      console.log(`   Slices: ${funcRules.slices.length}`);

      // Convert rules to CalldataSlice format
      const slices: CalldataSlice[] = funcRules.slices.map(slice => ({
        function_selector: funcRules.function_selector,
        field_name: slice.field_name,
        start_byte: slice.start_byte,
        length_bytes: slice.length_bytes,
        is_dynamic: slice.is_dynamic,
        token_direction: slice.token_direction,
        source: slice.source,
      }));

      // Upsert slices to database
      const upserted = await db.upsertCalldataSlices(slices);
      totalSlices += upserted;

      // Show details
      console.log(`   Fields parsed:`);
      funcRules.slices.forEach(slice => {
        const direction = slice.token_direction ? `[${slice.token_direction}]` : '';
        console.log(`     • ${slice.field_name} ${direction} - byte ${slice.start_byte} (${slice.length_bytes} bytes)`);
      });
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log(`║    ✓ Successfully loaded ${totalSlices} calldata slices!${' '.repeat(Math.max(0, 20 - totalSlices.toString().length))}║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n✗ Failed to load calldata slices:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run the script
loadCalldataSlices().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
