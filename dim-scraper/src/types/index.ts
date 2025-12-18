// Type definitions for dimension table scrapers

export interface ContractInfo {
  contract_address: string;
  protocol: string;
  version: string;
  source: string;  // github, defillama, manual
}

export interface FunctionInfo {
  function_selector: string;
  protocol: string;
  function_type: string;
  source: string;  // 4byte, manual
}

export interface CalldataSlice {
  function_selector: string;
  field_name: string;
  start_byte: number;
  length_bytes: number;
  is_dynamic: boolean;
  token_direction?: string | null;  // 'token_in' or 'token_out' for swap tokens, null for non-swap fields
  source: string;  // generated, manual
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}
