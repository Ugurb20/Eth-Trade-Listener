import 'dotenv/config';
import { EthereumWebSocketListener } from '../pub';

/**
 * Simple reconnection test suite for EthereumWebSocketListener
 */
class ReconnectionTest {
  private testsPassed = 0;
  private testsFailed = 0;
  private listener: EthereumWebSocketListener | null = null;

  /**
   * Run all reconnection tests
   */
  async runAll(): Promise<void> {
    console.log('=== Ethereum Listener Reconnection Test Suite ===\n');

    await this.testBasicReconnection();
    await this.sleep(1000); // Delay between tests

    await this.testListenerAutoRestart();
    await this.sleep(1000); // Delay between tests

    await this.testIntentionalDisconnectNoReconnect();

    console.log('\n=== Test Results ===');
    console.log(`✓ Passed: ${this.testsPassed}`);
    console.log(`✗ Failed: ${this.testsFailed}`);
    console.log(`Total: ${this.testsPassed + this.testsFailed}`);

    process.exit(this.testsFailed > 0 ? 1 : 0);
  }

  /**
   * Test: Basic reconnection after forced disconnect
   */
  async testBasicReconnection(): Promise<void> {
    const testName = 'Basic reconnection after disconnect';
    try {
      const websocketUrl = process.env.ETH_WEBSOCKET_URL;
      if (!websocketUrl) {
        throw new Error('ETH_WEBSOCKET_URL not set');
      }

      this.listener = new EthereumWebSocketListener(websocketUrl, {
        autoReconnect: true,
        reconnectDelay: 1000,
        maxReconnectAttempts: 3
      });

      await this.listener.connect();
      const initialConnectionId = this.listener.getConnectionId();
      console.log(`  → Initial connection ID: ${initialConnectionId}`);

      if (!this.listener.getConnectionStatus()) {
        throw new Error('Failed to establish initial connection');
      }

      // Force disconnect by accessing the provider's websocket and closing it
      const provider = (this.listener as any).provider;
      if (provider && provider.websocket) {
        console.log('  → Forcing WebSocket close to trigger reconnection...');
        provider.websocket.close();
      }

      // Wait for disconnection to be detected
      console.log('  → Waiting for disconnection to be detected...');
      await this.waitForDisconnection(this.listener, 3000);

      // Wait for reconnection
      console.log('  → Waiting for auto-reconnection (max 10 seconds)...');
      await this.waitForReconnection(this.listener, 10000);

      const newConnectionId = this.listener.getConnectionId();
      console.log(`  → New connection ID: ${newConnectionId}`);

      if (!this.listener.getConnectionStatus()) {
        throw new Error('Failed to reconnect');
      }

      if (newConnectionId <= initialConnectionId) {
        throw new Error(`Connection ID did not increment (old: ${initialConnectionId}, new: ${newConnectionId})`);
      }

      // Wait a bit for reconnection to fully settle
      await this.sleep(500);

      // Cleanup
      try {
        await this.listener.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
      this.listener = null;

      this.pass(testName);
    } catch (error) {
      if (this.listener) {
        try {
          await this.listener.disconnect();
        } catch {}
        this.listener = null;
      }
      this.fail(testName, error);
    }
  }


  /**
   * Test: Listener auto-restarts after reconnection
   */
  async testListenerAutoRestart(): Promise<void> {
    const testName = 'Listener auto-restarts after reconnection';
    try {
      const websocketUrl = process.env.ETH_WEBSOCKET_URL;
      if (!websocketUrl) {
        throw new Error('ETH_WEBSOCKET_URL not set');
      }

      this.listener = new EthereumWebSocketListener(websocketUrl, {
        autoReconnect: true,
        reconnectDelay: 1000,
        maxReconnectAttempts: 3
      });

      await this.listener.connect();
      await this.listener.startListening();

      if (!this.listener.getListeningStatus()) {
        throw new Error('Failed to start listening');
      }

      console.log('  → Listening status before disconnect: true');

      // Force disconnect
      const provider = (this.listener as any).provider;
      if (provider && provider.websocket) {
        console.log('  → Forcing disconnect...');
        provider.websocket.close();
      }

      // Wait for disconnection
      await this.waitForDisconnection(this.listener, 3000);

      // Wait for reconnection
      await this.waitForReconnection(this.listener, 10000);

      // Wait a bit more for listener to restart
      await this.sleep(1000);

      // Check if listening was restarted
      if (!this.listener.getListeningStatus()) {
        throw new Error('Listener was not automatically restarted after reconnection');
      }

      console.log('  → Listening status after reconnection: true ✓');

      // Wait a bit for things to settle
      await this.sleep(500);

      // Cleanup
      try {
        await this.listener.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
      this.listener = null;

      this.pass(testName);
    } catch (error) {
      if (this.listener) {
        try {
          await this.listener.disconnect();
        } catch {}
        this.listener = null;
      }
      this.fail(testName, error);
    }
  }


  /**
   * Test: Intentional disconnect should not trigger reconnection
   */
  async testIntentionalDisconnectNoReconnect(): Promise<void> {
    const testName = 'Intentional disconnect does not reconnect';
    try {
      const websocketUrl = process.env.ETH_WEBSOCKET_URL;
      if (!websocketUrl) {
        throw new Error('ETH_WEBSOCKET_URL not set');
      }

      this.listener = new EthereumWebSocketListener(websocketUrl, {
        autoReconnect: true,
        reconnectDelay: 1000,
        maxReconnectAttempts: 3
      });

      await this.listener.connect();
      console.log('  → Connected successfully');

      // Intentionally disconnect
      await this.listener.disconnect();
      console.log('  → Intentionally disconnected');

      const state = this.listener.getReconnectionState();
      if (state.shouldReconnect) {
        throw new Error('shouldReconnect should be false after intentional disconnect');
      }

      // Wait to ensure no reconnection happens
      await this.sleep(3000);

      if (this.listener.getConnectionStatus()) {
        throw new Error('Connection should not have been re-established');
      }

      console.log('  → No reconnection occurred after intentional disconnect ✓');

      this.listener = null;
      this.pass(testName);
    } catch (error) {
      if (this.listener) {
        try {
          await this.listener.disconnect();
        } catch {}
        this.listener = null;
      }
      this.fail(testName, error);
    }
  }

  /**
   * Wait for disconnection to be detected
   */
  private async waitForDisconnection(listener: EthereumWebSocketListener, timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (!listener.getConnectionStatus()) {
        return;
      }
      await this.sleep(100);
    }

    throw new Error('Disconnection not detected within timeout');
  }

  /**
   * Wait for reconnection to complete
   */
  private async waitForReconnection(listener: EthereumWebSocketListener, timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (listener.getConnectionStatus()) {
        return;
      }
      await this.sleep(200);
    }

    throw new Error('Reconnection timed out');
  }

  /**
   * Mark test as passed
   */
  private pass(testName: string): void {
    console.log(`✓ ${testName}\n`);
    this.testsPassed++;
  }

  /**
   * Mark test as failed
   */
  private fail(testName: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${testName}`);
    console.log(`  Error: ${errorMessage}\n`);
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
  const test = new ReconnectionTest();
  test.runAll().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export { ReconnectionTest };
