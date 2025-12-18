// Scraper for 4byte.directory - the largest database of Ethereum function signatures
import axios from 'axios';
import { FunctionInfo, CalldataSlice } from '../types';
import { SignatureComputer } from '../utils/signatures';

export class FourByteScraper {
  private baseUrl = 'https://www.4byte.directory/api/v1';

  /**
   * Search for function signatures by text query
   */
  async searchSignatures(query: string): Promise<any[]> {
    try {
      console.log(`Searching 4byte.directory for: ${query}`);
      const response = await axios.get(`${this.baseUrl}/signatures/`, {
        params: {
          text_signature__icontains: query,
          ordering: '-created_at',
          page_size: 100,
        },
      });

      const results = response.data.results || [];
      console.log(`✓ Found ${results.length} signatures for query: ${query}`);
      return results;
    } catch (error) {
      console.error(`Failed to search 4byte.directory for ${query}:`, error);
      return [];
    }
  }

  /**
   * Lookup a specific function selector
   */
  async lookupSelector(selector: string): Promise<any> {
    try {
      // Remove 0x prefix if present
      const cleanSelector = selector.replace('0x', '');

      const response = await axios.get(`${this.baseUrl}/signatures/`, {
        params: {
          hex_signature: `0x${cleanSelector}`,
        },
      });

      const results = response.data.results || [];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error(`Failed to lookup selector ${selector}:`, error);
      return null;
    }
  }

  /**
   * Get all swap-related function signatures from common DEXs
   * Uses specific known signatures to avoid false positives
   */
  async getSwapFunctions(): Promise<FunctionInfo[]> {
    const functions: FunctionInfo[] = [];

    // Known swap function signatures with their exact forms
    const knownSignatures = [
      // Uniswap V2 / SushiSwap
      { sig: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_exact_in' },
      { sig: 'swapTokensForExactTokens(uint256,uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_exact_out' },
      { sig: 'swapExactETHForTokens(uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_exact_eth_in' },
      { sig: 'swapTokensForExactETH(uint256,uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_tokens_for_exact_eth' },
      { sig: 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_exact_tokens_for_eth' },
      { sig: 'swapETHForExactTokens(uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_eth_for_exact_tokens' },

      // Uniswap V2 with supporting fee on transfer tokens
      { sig: 'swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_exact_in_fee_on_transfer' },
      { sig: 'swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_exact_eth_in_fee_on_transfer' },
      { sig: 'swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)', protocol: 'uniswap_v2', type: 'swap_exact_tokens_for_eth_fee_on_transfer' },

      // Uniswap V3
      { sig: 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))', protocol: 'uniswap_v3', type: 'exact_input_single' },
      { sig: 'exactInput((bytes,address,uint256,uint256,uint256))', protocol: 'uniswap_v3', type: 'exact_input' },
      { sig: 'exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))', protocol: 'uniswap_v3', type: 'exact_output_single' },
      { sig: 'exactOutput((bytes,address,uint256,uint256,uint256))', protocol: 'uniswap_v3', type: 'exact_output' },

      // Curve
      { sig: 'exchange(int128,int128,uint256,uint256)', protocol: 'curve', type: 'exchange' },
      { sig: 'exchange(uint256,uint256,uint256,uint256)', protocol: 'curve', type: 'exchange' },
      { sig: 'exchange_underlying(int128,int128,uint256,uint256)', protocol: 'curve', type: 'exchange_underlying' },
      { sig: 'exchange_underlying(uint256,uint256,uint256,uint256)', protocol: 'curve', type: 'exchange_underlying' },

      // Balancer V2
      { sig: 'swap((bytes32,uint8,address,address,uint256,bytes),(address,bool,address,bool),uint256,uint256)', protocol: 'balancer_v2', type: 'swap' },
      { sig: 'batchSwap(uint8,(bytes32,uint256,uint256,uint256,bytes)[],address[],(address,bool,address,bool),int256[],uint256)', protocol: 'balancer_v2', type: 'batch_swap' },
    ];

    console.log('Fetching known swap function signatures from 4byte.directory...');

    for (const known of knownSignatures) {
      try {
        // Look up by searching for the function name
        const funcName = known.sig.split('(')[0];
        const results = await this.searchSignatures(funcName);

        // Find exact match
        const match = results.find((r: any) => r.text_signature === known.sig);

        if (match) {
          functions.push({
            function_selector: match.hex_signature,
            protocol: known.protocol,
            function_type: known.type,
            source: '4byte',
          });
          console.log(`  ✓ ${match.hex_signature} -> ${known.sig.substring(0, 50)}... (${known.protocol})`);
        } else {
          // If not found via API, compute the selector locally
          const selector = SignatureComputer.computeSelector(known.sig);
          functions.push({
            function_selector: selector,
            protocol: known.protocol,
            function_type: known.type,
            source: '4byte',
          });
          console.log(`  ✓ ${selector} -> ${known.sig.substring(0, 50)}... (${known.protocol}) [computed]`);
        }

        // Rate limiting
        await this.sleep(500);
      } catch (error) {
        console.warn(`  ⚠️  Failed to fetch ${known.sig}: ${error}`);
      }
    }

    console.log(`\n✓ Total swap functions collected: ${functions.length}`);
    return functions;
  }

  /**
   * Get liquidity-related function signatures
   * Uses specific known signatures to avoid false positives
   */
  async getLiquidityFunctions(): Promise<FunctionInfo[]> {
    const functions: FunctionInfo[] = [];

    // Known liquidity function signatures
    const knownSignatures = [
      // Uniswap V2 / SushiSwap
      { sig: 'addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)', protocol: 'uniswap_v2', type: 'add_liquidity' },
      { sig: 'addLiquidityETH(address,uint256,uint256,uint256,address,uint256)', protocol: 'uniswap_v2', type: 'add_liquidity_eth' },
      { sig: 'removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)', protocol: 'uniswap_v2', type: 'remove_liquidity' },
      { sig: 'removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)', protocol: 'uniswap_v2', type: 'remove_liquidity_eth' },
      { sig: 'removeLiquidityWithPermit(address,address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)', protocol: 'uniswap_v2', type: 'remove_liquidity_with_permit' },
      { sig: 'removeLiquidityETHWithPermit(address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)', protocol: 'uniswap_v2', type: 'remove_liquidity_eth_with_permit' },

      // Uniswap V3
      { sig: 'mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))', protocol: 'uniswap_v3', type: 'mint' },
      { sig: 'increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))', protocol: 'uniswap_v3', type: 'increase_liquidity' },
      { sig: 'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))', protocol: 'uniswap_v3', type: 'decrease_liquidity' },
      { sig: 'collect((uint256,address,uint128,uint128))', protocol: 'uniswap_v3', type: 'collect' },
      { sig: 'burn(uint256)', protocol: 'uniswap_v3', type: 'burn' },
    ];

    console.log('Fetching known liquidity function signatures from 4byte.directory...');

    for (const known of knownSignatures) {
      try {
        const funcName = known.sig.split('(')[0];
        const results = await this.searchSignatures(funcName);

        const match = results.find((r: any) => r.text_signature === known.sig);

        if (match) {
          functions.push({
            function_selector: match.hex_signature,
            protocol: known.protocol,
            function_type: known.type,
            source: '4byte',
          });
          console.log(`  ✓ ${match.hex_signature} -> ${known.sig.substring(0, 50)}... (${known.protocol})`);
        } else {
          const selector = SignatureComputer.computeSelector(known.sig);
          functions.push({
            function_selector: selector,
            protocol: known.protocol,
            function_type: known.type,
            source: '4byte',
          });
          console.log(`  ✓ ${selector} -> ${known.sig.substring(0, 50)}... (${known.protocol}) [computed]`);
        }

        await this.sleep(500);
      } catch (error) {
        console.warn(`  ⚠️  Failed to fetch ${known.sig}: ${error}`);
      }
    }

    console.log(`\n✓ Total liquidity functions collected: ${functions.length}`);
    return functions;
  }

  /**
   * Generate calldata slices for Uniswap V2 style swap functions
   * Based on the function signature structure
   */
  generateV2SwapSlices(selector: string, signature: string): CalldataSlice[] {
    const slices: CalldataSlice[] = [];

    // Parse signature to determine parameter structure
    // swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
    if (signature.includes('swapExactTokensForTokens') ||
        signature.includes('swapTokensForExactTokens') ||
        signature.includes('swapExactTokensForETH') ||
        signature.includes('swapTokensForExactETH')) {

      slices.push(
        { function_selector: selector, field_name: 'amount', start_byte: 4, length_bytes: 32, is_dynamic: false, source: 'generated' },
        { function_selector: selector, field_name: 'amount_limit', start_byte: 36, length_bytes: 32, is_dynamic: false, source: 'generated' },
        { function_selector: selector, field_name: 'path', start_byte: 68, length_bytes: 32, is_dynamic: true, source: 'generated' },
        { function_selector: selector, field_name: 'to', start_byte: 100, length_bytes: 32, is_dynamic: false, source: 'generated' },
        { function_selector: selector, field_name: 'deadline', start_byte: 132, length_bytes: 32, is_dynamic: false, source: 'generated' }
      );
    } else if (signature.includes('swapExactETHForTokens') ||
               signature.includes('swapETHForExactTokens')) {

      slices.push(
        { function_selector: selector, field_name: 'amount_limit', start_byte: 4, length_bytes: 32, is_dynamic: false, source: 'generated' },
        { function_selector: selector, field_name: 'path', start_byte: 36, length_bytes: 32, is_dynamic: true, source: 'generated' },
        { function_selector: selector, field_name: 'to', start_byte: 68, length_bytes: 32, is_dynamic: false, source: 'generated' },
        { function_selector: selector, field_name: 'deadline', start_byte: 100, length_bytes: 32, is_dynamic: false, source: 'generated' }
      );
    }

    return slices;
  }

  /**
   * Sleep helper for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
