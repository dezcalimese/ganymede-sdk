import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { paymentMiddleware, isPaid, getPaymentInfo, type PricingConfig } from '../../src/middleware/x402.js';

describe('x402 middleware', () => {
  let app: Express;
  let mockFetch: any;

  const testPricing: Record<string, PricingConfig> = {
    'GET /premium': {
      price: '$0.005',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      description: 'Test premium endpoint',
    },
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    app = express();
    app.use(express.json());
    app.use(paymentMiddleware('TestPaymentWallet', testPricing, 'https://test.facilitator.com'));

    app.get('/premium', (req, res) => {
      res.json({
        data: 'premium content',
        paid: isPaid(req),
        paymentInfo: getPaymentInfo(req),
      });
    });

    app.get('/free', (req, res) => {
      res.json({ data: 'free content' });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should allow access to non-premium routes', async () => {
    const response = await request(app).get('/free');

    expect(response.status).toBe(200);
    expect(response.body.data).toBe('free content');
  });

  it('should return 402 for premium routes without payment', async () => {
    const response = await request(app).get('/premium');

    expect(response.status).toBe(402);
    expect(response.body.error).toBe('Payment Required');
    expect(response.headers['payment-required']).toBeDefined();
  });

  it('should include payment requirements in 402 response', async () => {
    const response = await request(app).get('/premium');

    expect(response.status).toBe(402);

    const paymentHeader = response.headers['payment-required'];
    expect(paymentHeader).toBeDefined();

    const requirements = JSON.parse(atob(paymentHeader));
    expect(requirements.x402Version).toBe(1);
    expect(requirements.scheme).toBe('exact');
    expect(requirements.network).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    expect(requirements.payTo).toBe('TestPaymentWallet');
    expect(requirements.amount).toBe('5000'); // $0.005 * 1e6
  });

  it('should accept valid payment signature (dev mode)', async () => {
    // Mock facilitator to not respond (triggers dev mode acceptance)
    mockFetch.mockRejectedValue(new Error('Network error'));

    // Create a mock payment payload
    const paymentPayload = btoa(JSON.stringify({
      x402Version: 1,
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      payload: {
        message: 'test',
        signature: 'test_sig',
        publicKey: 'test_pubkey',
      },
    }));

    const response = await request(app)
      .get('/premium')
      .set('payment-signature', paymentPayload);

    expect(response.status).toBe(200);
    expect(response.body.data).toBe('premium content');
    expect(response.body.paid).toBe(true);
    expect(response.body.paymentInfo).toBeDefined();
  });

  it('should set payment response headers after successful payment', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const paymentPayload = btoa(JSON.stringify({
      x402Version: 1,
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      payload: {
        message: 'test',
        signature: 'test_sig',
        publicKey: 'test_pubkey',
      },
    }));

    const response = await request(app)
      .get('/premium')
      .set('payment-signature', paymentPayload);

    expect(response.status).toBe(200);
    expect(response.headers['x-payment-response']).toBeDefined();
    expect(response.headers['x-payment-txhash']).toBeDefined();
  });

  it('should reject invalid payment version', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const paymentPayload = btoa(JSON.stringify({
      x402Version: 999, // Invalid version
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      payload: {},
    }));

    const response = await request(app)
      .get('/premium')
      .set('payment-signature', paymentPayload);

    expect(response.status).toBe(402);
    expect(response.body.error).toBe('Payment Invalid');
  });

  it('should reject payment with network mismatch', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const paymentPayload = btoa(JSON.stringify({
      x402Version: 1,
      scheme: 'exact',
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // Mainnet instead of devnet
      payload: {},
    }));

    const response = await request(app)
      .get('/premium')
      .set('payment-signature', paymentPayload);

    expect(response.status).toBe(402);
    expect(response.body.error).toBe('Payment Invalid');
  });

  it('should accept payment from x-payment header', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const paymentPayload = btoa(JSON.stringify({
      x402Version: 1,
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      payload: {
        message: 'test',
        signature: 'test_sig',
        publicKey: 'test_pubkey',
      },
    }));

    const response = await request(app)
      .get('/premium')
      .set('x-payment', paymentPayload);

    expect(response.status).toBe(200);
    expect(response.body.paid).toBe(true);
  });
});

describe('isPaid helper', () => {
  it('should return false for request without payment', () => {
    const req = {} as any;
    expect(isPaid(req)).toBe(false);
  });

  it('should return true for request with payment', () => {
    const req = { x402Payment: { txHash: 'test' } } as any;
    expect(isPaid(req)).toBe(true);
  });
});

describe('getPaymentInfo helper', () => {
  it('should return null for request without payment', () => {
    const req = {} as any;
    expect(getPaymentInfo(req)).toBeNull();
  });

  it('should return payment info for request with payment', () => {
    const paymentInfo = { txHash: 'test_hash', amount: '5000', payer: 'verified' };
    const req = { x402Payment: paymentInfo } as any;
    expect(getPaymentInfo(req)).toEqual(paymentInfo);
  });
});
