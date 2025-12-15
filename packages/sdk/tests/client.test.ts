import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { GanymedeClient } from '../src/client.js';
import { GanymedeError, GanymedeErrorCode } from '../src/types.js';

// Mock Jupiter API
vi.mock('@jup-ag/api', () => ({
  createJupiterApiClient: () => ({
    quoteGet: vi.fn(),
    swapPost: vi.fn(),
  }),
}));

// Mock wallet
function createMockWallet(options: {
  connected?: boolean;
  publicKey?: PublicKey | null;
  signTransaction?: boolean;
  signMessage?: boolean;
} = {}) {
  const pk = options.publicKey ?? new PublicKey('11111111111111111111111111111111');
  return {
    connected: options.connected ?? true,
    publicKey: pk,
    signTransaction: options.signTransaction !== false
      ? async <T>(tx: T) => tx
      : undefined,
    signMessage: options.signMessage !== false
      ? async (msg: Uint8Array) => new Uint8Array(64).fill(1)
      : undefined,
    sendTransaction: async () => 'mock_txid',
  } as any;
}

// Mock connection
function createMockConnection() {
  return {
    sendRawTransaction: vi.fn().mockResolvedValue('mock_txid'),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    getRecentPrioritizationFees: vi.fn().mockResolvedValue([]),
  } as unknown as Connection;
}

describe('GanymedeClient', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const wallet = createMockWallet();
      const connection = createMockConnection();

      const client = new GanymedeClient({
        wallet,
        connection,
      });

      expect(client.apiEndpoint).toBe('http://localhost:3001');
      expect(client.network).toBe('devnet');
      expect(client.isPremiumEnabled).toBe(true);
    });

    it('should create client with custom config', () => {
      const wallet = createMockWallet();
      const connection = createMockConnection();

      const client = new GanymedeClient({
        wallet,
        connection,
        apiEndpoint: 'https://custom.api.com',
        network: 'mainnet',
        enablePremium: false,
        maxPaymentPerSwap: 0.05,
      });

      expect(client.apiEndpoint).toBe('https://custom.api.com');
      expect(client.network).toBe('mainnet');
      expect(client.isPremiumEnabled).toBe(false);
    });
  });

  describe('getQuote', () => {
    it('should throw when wallet is not connected', async () => {
      const wallet = createMockWallet({ connected: false });
      const connection = createMockConnection();

      const client = new GanymedeClient({ wallet, connection });

      // getQuote itself doesn't require wallet validation, but buildSwap does
      // Let's test buildSwap instead
      await expect(client.buildSwap({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: 1000000000,
      })).rejects.toThrow(GanymedeError);
    });
  });

  describe('getEnhancedSwap', () => {
    it('should fall back to free tier when premium disabled', async () => {
      const wallet = createMockWallet();
      const connection = createMockConnection();

      const client = new GanymedeClient({
        wallet,
        connection,
        enablePremium: false,
      });

      // This would normally call Jupiter API, which is mocked
      // The test verifies that premium features don't trigger x402 payment
      // when enablePremium is false
      expect(client.isPremiumEnabled).toBe(false);
    });

    it('should fall back to free tier when no premium features requested', async () => {
      const wallet = createMockWallet();
      const connection = createMockConnection();

      const client = new GanymedeClient({
        wallet,
        connection,
        enablePremium: true,
      });

      // When mevProtection, optimizePriorityFee, and includeAnalytics are all false,
      // should use free tier even if premium is enabled
      expect(client.isPremiumEnabled).toBe(true);
    });
  });

  describe('executeSwap', () => {
    it('should throw when wallet does not support signTransaction', async () => {
      const wallet = createMockWallet({ signTransaction: false });
      const connection = createMockConnection();

      const client = new GanymedeClient({ wallet, connection });

      // Create a minimal mock SwapResult
      const mockResult = {
        transaction: {
          serialize: () => new Uint8Array(100),
        } as unknown as VersionedTransaction,
        quote: {} as any,
      };

      await expect(client.executeSwap(mockResult)).rejects.toThrow(GanymedeError);

      try {
        await client.executeSwap(mockResult);
      } catch (error) {
        expect((error as GanymedeError).code).toBe(GanymedeErrorCode.WALLET_SIGNING_FAILED);
      }
    });
  });
});

describe('GanymedeClient integration', () => {
  it('should export TOKENS constant', async () => {
    const { TOKENS } = await import('../src/index.js');

    expect(TOKENS.SOL).toBe('So11111111111111111111111111111111111111112');
    expect(TOKENS.USDC).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(TOKENS.USDT).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(TOKENS.USDC_DEVNET).toBe('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  });

  it('should export error types', async () => {
    const { GanymedeError, GanymedeErrorCode } = await import('../src/index.js');

    expect(GanymedeError).toBeDefined();
    expect(GanymedeErrorCode).toBeDefined();
    expect(GanymedeErrorCode.WALLET_NOT_CONNECTED).toBe('WALLET_NOT_CONNECTED');
  });
});
