// Utility for computing function signatures
import { keccak256, toUtf8Bytes } from 'ethers';

export class SignatureComputer {
  /**
   * Compute the 4-byte function selector from a function signature
   * @param signature - Function signature (e.g., "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)")
   * @returns Function selector (e.g., "0x38ed1739")
   */
  static computeSelector(signature: string): string {
    const hash = keccak256(toUtf8Bytes(signature));
    return '0x' + hash.slice(2, 10);
  }

  /**
   * Verify a known selector matches the expected signature
   */
  static verify(signature: string, expectedSelector: string): boolean {
    const computed = this.computeSelector(signature);
    return computed.toLowerCase() === expectedSelector.toLowerCase();
  }
}
