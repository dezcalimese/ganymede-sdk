import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { wrapFetchWithPayment, extractPaymentTxHash } from '../src/utils/x402-fetch.js';
import { GanymedeError, GanymedeErrorCode } from '../src/types.js';

// Mock wallet
function createMockWallet(options: { signMessage?: boolean } = {}) {
  return {
    connected: true,
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signMessage: options.signMessage !== false
      ? async (msg: Uint8Array) => new Uint8Array(64).fill(1)
      : undefined,
  } as any;
}

// Mock fetch
const mockFetch = vi.fn();

describe('wrapFetchWithPayment', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should pass through non-402 responses', async () => {
    const wallet = createMockWallet();
    const wrappedFetch = wrapFetchWithPayment(wallet, { maxPayment: 0.01 });

    const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    mockFetch.mockResolvedValueOnce(mockResponse);

    const response = await wrappedFetch('https://api.example.com/test');

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle 402 response and retry with payment', async () => {
    const wallet = createMockWallet();
    const wrappedFetch = wrapFetchWithPayment(wallet, { maxPayment: 0.01 });

    // Create payment requirements
    const requirements = {
      x402Version: 1,
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      maxAmountRequired: '5000',
      amount: '5000',
      resource: 'https://api.example.com/premium',
      description: 'Premium feature',
      mimeType: 'application/json',
      payTo: 'RecipientAddress',
      maxTimeoutSeconds: 60,
      asset: {
        address: 'USDC_ADDRESS',
        decimals: 6,
        symbol: 'USDC',
      },
    };

    // First call returns 402
    const paymentRequiredResponse = new Response(JSON.stringify({ error: 'Payment Required' }), {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'payment-required': btoa(JSON.stringify(requirements)),
      },
    });

    // Second call (with payment) returns 200
    const successResponse = new Response(JSON.stringify({ data: 'premium' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    mockFetch
      .mockResolvedValueOnce(paymentRequiredResponse)
      .mockResolvedValueOnce(successResponse);

    const response = await wrappedFetch('https://api.example.com/premium');

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Check that second call has payment headers
    const secondCallInit = mockFetch.mock.calls[1][1];
    expect(secondCallInit.headers).toHaveProperty('payment-signature');
    expect(secondCallInit.headers).toHaveProperty('x-payment');
  });

  it('should throw when payment exceeds limit', async () => {
    const wallet = createMockWallet();
    const wrappedFetch = wrapFetchWithPayment(wallet, { maxPayment: 0.001 }); // Very low limit

    const requirements = {
      x402Version: 1,
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      amount: '10000', // 0.01 USDC (exceeds 0.001 limit)
      resource: 'https://api.example.com/premium',
      description: 'Premium feature',
      mimeType: 'application/json',
      payTo: 'RecipientAddress',
      maxTimeoutSeconds: 60,
      asset: {
        address: 'USDC_ADDRESS',
        decimals: 6,
        symbol: 'USDC',
      },
    };

    const paymentRequiredResponse = new Response(JSON.stringify({ error: 'Payment Required' }), {
      status: 402,
      headers: {
        'payment-required': btoa(JSON.stringify(requirements)),
      },
    });

    mockFetch.mockResolvedValueOnce(paymentRequiredResponse);

    await expect(wrappedFetch('https://api.example.com/premium')).rejects.toThrow(GanymedeError);

    try {
      mockFetch.mockResolvedValueOnce(paymentRequiredResponse);
      await wrappedFetch('https://api.example.com/premium');
    } catch (error) {
      expect((error as GanymedeError).code).toBe(GanymedeErrorCode.PAYMENT_EXCEEDED_LIMIT);
    }
  });

  it('should throw when wallet does not support message signing', async () => {
    const wallet = createMockWallet({ signMessage: false });
    const wrappedFetch = wrapFetchWithPayment(wallet, { maxPayment: 0.01 });

    const requirements = {
      x402Version: 1,
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      amount: '5000',
      resource: 'https://api.example.com/premium',
      description: 'Premium feature',
      mimeType: 'application/json',
      payTo: 'RecipientAddress',
      maxTimeoutSeconds: 60,
      asset: {
        address: 'USDC_ADDRESS',
        decimals: 6,
        symbol: 'USDC',
      },
    };

    const paymentRequiredResponse = new Response(JSON.stringify({ error: 'Payment Required' }), {
      status: 402,
      headers: {
        'payment-required': btoa(JSON.stringify(requirements)),
      },
    });

    mockFetch.mockResolvedValueOnce(paymentRequiredResponse);

    await expect(wrappedFetch('https://api.example.com/premium')).rejects.toThrow(GanymedeError);
  });

  it('should throw when 402 response has no payment requirements', async () => {
    const wallet = createMockWallet();
    const wrappedFetch = wrapFetchWithPayment(wallet, { maxPayment: 0.01 });

    const paymentRequiredResponse = new Response(JSON.stringify({ error: 'Payment Required' }), {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        // No payment-required header
      },
    });

    mockFetch.mockResolvedValueOnce(paymentRequiredResponse);

    await expect(wrappedFetch('https://api.example.com/premium')).rejects.toThrow(GanymedeError);
  });
});

describe('extractPaymentTxHash', () => {
  it('should extract tx hash from x-payment-response header', () => {
    const response = new Response('', {
      headers: { 'x-payment-response': 'tx_hash_123' },
    });

    expect(extractPaymentTxHash(response)).toBe('tx_hash_123');
  });

  it('should extract tx hash from x-payment-txhash header', () => {
    const response = new Response('', {
      headers: { 'x-payment-txhash': 'tx_hash_456' },
    });

    expect(extractPaymentTxHash(response)).toBe('tx_hash_456');
  });

  it('should return undefined when no tx hash header present', () => {
    const response = new Response('', {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(extractPaymentTxHash(response)).toBeUndefined();
  });
});
