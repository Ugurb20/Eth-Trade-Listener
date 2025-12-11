import 'dotenv/config';
import { EthereumWebSocketListener } from '../pub';

/**
 * Simple test suite for EthereumWebSocketListener
 */
class ListenerTest {
  private testsPassed = 0;
  private testsFailed = 0;
  private listener: EthereumWebSocketListener | null = null;

  /**
   * Run all tests
   */
  async runAll(): Promise<void> {
    console.log('=== Ethereum Listener Test Suite ===\n');

    await this.testConstructor();
    await this.testConnection();
    await this.testListening();
    await this.testDisconnection();

    console.log('\n=== Test Results ===');
    console.log(`✓ Passed: ${this.testsPassed}`);
    console.log(`✗ Failed: ${this.testsFailed}`);
    console.log(`Total: ${this.testsPassed + this.testsFailed}`);

    process.exit(this.testsFailed > 0 ? 1 : 0);
  }

  /**
   * Test: Constructor initializes properly
   */
  async testConstructor(): Promise<void> {
    const testName = 'Constructor initialization';
    try {
      const websocketUrl = process.env.ETH_WEBSOCKET_URL;

      if (!websocketUrl) {
        throw new Error('ETH_WEBSOCKET_URL not set in environment');
      }

      this.listener = new EthereumWebSocketListener(websocketUrl, {
        maxConcurrentFetches: 5,
        fetchTimeout: 3000
      });

      if (!this.listener) {
        throw new Error('Listener not created');
      }

      this.pass(testName);
    } catch (error) {
      this.fail(testName, error);
    }
  }

  /**
   * Test: Connection to WebSocket
   */
  async testConnection(): Promise<void> {
    const testName = 'WebSocket connection';
    try {
      if (!this.listener) {
        throw new Error('Listener not initialized');
      }

      const connected = await this.listener.connect();

      if (!connected) {
        throw new Error('Connection failed');
      }

      if (!this.listener.getConnectionStatus()) {
        throw new Error('Connection status is false after connecting');
      }

      this.pass(testName);
    } catch (error) {
      this.fail(testName, error);
    }
  }

  /**
   * Test: Start and stop listening
   */
  async testListening(): Promise<void> {
    const testName = 'Start/stop listening';
    try {
      if (!this.listener) {
        throw new Error('Listener not initialized');
      }

      let normalizedCount = 0;

      // Set callback to verify normalization
      this.listener.setTransactionCallback((normalized) => {
        normalizedCount++;
        console.log(`  → Normalized TX #${normalizedCount}:`);
        console.log(`     Hash: ${normalized.hash}`);
        console.log(`     From: ${normalized.from}`);
        console.log(`     To: ${normalized.to || 'Contract Creation'}`);
        console.log(`     Value: ${normalized.value} wei`);
        console.log(`     Network: ${normalized.metadata.network} (Chain ID: ${normalized.metadata.chainId})`);
        console.log(`     Received at: ${normalized.metadata.receivedAt}`);
      });

      // Start listening
      await this.listener.startListening();

      if (!this.listener.getListeningStatus()) {
        throw new Error('Listening status is false after starting');
      }

      // Wait a bit to receive some transactions
      console.log('  → Listening for 10 seconds to capture transactions...');
      await this.sleep(10000);

      // Stop listening
      await this.listener.stopListening();

      if (this.listener.getListeningStatus()) {
        throw new Error('Listening status is true after stopping');
      }

      console.log(`  → Total normalized transactions: ${normalizedCount}`);

      this.pass(testName);
    } catch (error) {
      this.fail(testName, error);
    }
  }

  /**
   * Test: Disconnection
   */
  async testDisconnection(): Promise<void> {
    const testName = 'WebSocket disconnection';
    try {
      if (!this.listener) {
        throw new Error('Listener not initialized');
      }

      await this.listener.disconnect();

      if (this.listener.getConnectionStatus()) {
        throw new Error('Connection status is true after disconnecting');
      }

      this.pass(testName);
    } catch (error) {
      this.fail(testName, error);
    }
  }

  /**
   * Mark test as passed
   */
  private pass(testName: string): void {
    console.log(`✓ ${testName}`);
    this.testsPassed++;
  }

  /**
   * Mark test as failed
   */
  private fail(testName: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${testName}`);
    console.log(`  Error: ${errorMessage}`);
    this.testsFailed++;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Run tests if executed directly
 */
if (require.main === module) {
  const test = new ListenerTest();
  test.runAll().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export { ListenerTest };
