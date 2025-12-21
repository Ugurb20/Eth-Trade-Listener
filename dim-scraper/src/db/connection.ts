// Database connection and operations
import { Pool } from 'pg';
import { DatabaseConfig, ContractInfo, FunctionInfo, CalldataSlice } from '../types';

export class DatabaseManager {
  private pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.pool.connect();
      console.log('✓ Connected to PostgreSQL database');
    } catch (error) {
      console.error('✗ Failed to connect to database:', error);
      throw error;
    }
  }

  async insertContracts(contracts: ContractInfo[]): Promise<number> {
    if (contracts.length === 0) return 0;

    const query = `
      INSERT INTO dim_contract (contract_address, protocol, version, pairname, total_volume_usd, source)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    let inserted = 0;
    for (const contract of contracts) {
      try {
        await this.pool.query(query, [
          contract.contract_address,
          contract.protocol,
          contract.version,
          contract.pairname || null,
          contract.total_volume_usd || null,
          contract.source,
        ]);
        inserted++;
      } catch (error) {
        console.error(`Failed to insert contract ${contract.contract_address}:`, error);
      }
    }

    console.log(`✓ Inserted ${inserted} contracts`);
    return inserted;
  }

  async upsertContracts(contracts: ContractInfo[]): Promise<number> {
    if (contracts.length === 0) return 0;

    let upserted = 0;
    for (const contract of contracts) {
      try {
        // Check if contract exists
        const checkQuery = 'SELECT id FROM dim_contract WHERE contract_address = $1';
        const checkResult = await this.pool.query(checkQuery, [contract.contract_address]);

        if (checkResult.rows.length > 0) {
          // Update existing contract
          const updateQuery = `
            UPDATE dim_contract
            SET protocol = $2, version = $3, pairname = $4, total_volume_usd = $5, source = $6
            WHERE contract_address = $1
          `;
          await this.pool.query(updateQuery, [
            contract.contract_address,
            contract.protocol,
            contract.version,
            contract.pairname || null,
            contract.total_volume_usd || null,
            contract.source,
          ]);
        } else {
          // Insert new contract
          const insertQuery = `
            INSERT INTO dim_contract (contract_address, protocol, version, pairname, total_volume_usd, source)
            VALUES ($1, $2, $3, $4, $5, $6)
          `;
          await this.pool.query(insertQuery, [
            contract.contract_address,
            contract.protocol,
            contract.version,
            contract.pairname || null,
            contract.total_volume_usd || null,
            contract.source,
          ]);
        }
        upserted++;
      } catch (error) {
        console.error(`Failed to upsert contract ${contract.contract_address}:`, error);
      }
    }

    console.log(`✓ Upserted ${upserted} contracts`);
    return upserted;
  }

  async insertFunctions(functions: FunctionInfo[]): Promise<number> {
    if (functions.length === 0) return 0;

    const query = `
      INSERT INTO dim_function (function_selector, protocol, function_type, source)
      VALUES ($1, $2, $3, $4)
    `;

    let inserted = 0;
    for (const func of functions) {
      try {
        await this.pool.query(query, [
          func.function_selector,
          func.protocol,
          func.function_type,
          func.source,
        ]);
        inserted++;
      } catch (error) {
        console.error(`Failed to insert function ${func.function_selector}:`, error);
      }
    }

    console.log(`✓ Inserted ${inserted} functions`);
    return inserted;
  }

  async upsertFunctions(functions: FunctionInfo[]): Promise<number> {
    if (functions.length === 0) return 0;

    let upserted = 0;
    for (const func of functions) {
      try {
        // Check if function exists
        const checkQuery = 'SELECT id FROM dim_function WHERE function_selector = $1';
        const checkResult = await this.pool.query(checkQuery, [func.function_selector]);

        if (checkResult.rows.length > 0) {
          // Update existing function
          const updateQuery = `
            UPDATE dim_function
            SET protocol = $2, function_type = $3, source = $4
            WHERE function_selector = $1
          `;
          await this.pool.query(updateQuery, [
            func.function_selector,
            func.protocol,
            func.function_type,
            func.source,
          ]);
        } else {
          // Insert new function
          const insertQuery = `
            INSERT INTO dim_function (function_selector, protocol, function_type, source)
            VALUES ($1, $2, $3, $4)
          `;
          await this.pool.query(insertQuery, [
            func.function_selector,
            func.protocol,
            func.function_type,
            func.source,
          ]);
        }
        upserted++;
      } catch (error) {
        console.error(`Failed to upsert function ${func.function_selector}:`, error);
      }
    }

    console.log(`✓ Upserted ${upserted} functions`);
    return upserted;
  }

  async insertCalldataSlices(slices: CalldataSlice[]): Promise<number> {
    if (slices.length === 0) return 0;

    const query = `
      INSERT INTO dim_calldata_slice (function_selector, field_name, start_byte, length_bytes, is_dynamic, token_direction, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    let inserted = 0;
    for (const slice of slices) {
      try {
        await this.pool.query(query, [
          slice.function_selector,
          slice.field_name,
          slice.start_byte,
          slice.length_bytes,
          slice.is_dynamic,
          slice.token_direction || null,
          slice.source,
        ]);
        inserted++;
      } catch (error) {
        console.error(`Failed to insert calldata slice for ${slice.function_selector}:`, error);
      }
    }

    console.log(`✓ Inserted ${inserted} calldata slices`);
    return inserted;
  }

  async close(): Promise<void> {
    await this.pool.end();
    console.log('✓ Database connection closed');
  }
}
