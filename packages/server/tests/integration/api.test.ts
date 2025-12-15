import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import cors from 'cors';
import healthRoutes from '../../src/routes/health.js';
import premiumRoutes from '../../src/routes/premium.js';
import { paymentMiddleware, type PricingConfig } from '../../src/middleware/x402.js';

// Mock Jupiter API
vi.mock('@jup-ag/api', () => ({
  createJupiterApiClient: () => ({
    quoteGet: async () => ({
      inAmount: '1000000000',
      outAmount: '150000000',
      priceImpactPct: '0.1',
      routePlan: [
        {
          swapInfo: {
            ammKey: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            inAmount: '1000000000',
            outAmount: '150000000',
            feeAmount: '100000',
          },
        },
      ],
    }),
    swapPost: async () => ({
      swapTransaction: Buffer.from('mock_transaction').toString('base64'),
    }),
  }),
}));

// Mock Connection for priority fees
vi.mock('@solana/web3.js', () => ({
  Connection: class MockConnection {
    getRecentPrioritizationFees() {
      return Promise.resolve([
        { slot: 1, prioritizationFee: 5000 },
        { slot: 2, prioritizationFee: 10000 },
        { slot: 3, prioritizationFee: 50000 },
      ]);
    }
  },
}));

describe('API Integration Tests', () => {
  let app: Express;
  let mockFetch: any;

  const premiumPricing: Record<string, PricingConfig> = {
    'POST /v1/swap/enhanced': {
      price: '$0.005',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      description: 'Enhanced swap with premium features',
    },
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Mock SOL price fetch
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          'So11111111111111111111111111111111111111112': { price: '150' },
        },
      }),
    });

    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(paymentMiddleware('TestWallet', premiumPricing, 'https://test.facilitator.com'));
    app.use('/', healthRoutes);
    app.use('/', premiumRoutes);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  describe('Free tier endpoints', () => {
    it('GET /health should work without payment', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('GET /info should work without payment', async () => {
      const response = await request(app).get('/info');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Ganymede API');
    });

    it('GET /v1/quote should work without payment', async () => {
      const response = await request(app)
        .get('/v1/quote')
        .query({
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '1000000000',
        });

      expect(response.status).toBe(200);
      expect(response.body.quote).toBeDefined();
    });
  });

  describe('Premium tier endpoints', () => {
    it('POST /v1/swap/enhanced should require payment', async () => {
      const response = await request(app)
        .post('/v1/swap/enhanced')
        .send({
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: 1000000000,
          userPublicKey: 'TestUserPublicKey',
          mevProtection: true,
        });

      expect(response.status).toBe(402);
      expect(response.body.error).toBe('Payment Required');
    });

    it('POST /v1/swap/enhanced should work with valid payment', async () => {
      // Mock facilitator unavailable (triggers dev mode)
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
        .post('/v1/swap/enhanced')
        .set('payment-signature', paymentPayload)
        .send({
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: 1000000000,
          userPublicKey: 'TestUserPublicKey',
          mevProtection: true,
          optimizePriorityFee: true,
          includeAnalytics: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.quote).toBeDefined();
      expect(response.body.swapTransaction).toBeDefined();
      expect(response.body.mevAnalysis).toBeDefined();
      expect(response.body.recommendedPriorityFee).toBeDefined();
      expect(response.body.routeAnalytics).toBeDefined();
    });

    it('POST /v1/swap/enhanced should validate required fields', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const paymentPayload = btoa(JSON.stringify({
        x402Version: 1,
        scheme: 'exact',
        network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        payload: { message: 'test', signature: 'sig', publicKey: 'pk' },
      }));

      const response = await request(app)
        .post('/v1/swap/enhanced')
        .set('payment-signature', paymentPayload)
        .send({
          // Missing required fields
          inputMint: 'So11111111111111111111111111111111111111112',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('POST /v1/swap/enhanced should return only requested features', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const paymentPayload = btoa(JSON.stringify({
        x402Version: 1,
        scheme: 'exact',
        network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        payload: { message: 'test', signature: 'sig', publicKey: 'pk' },
      }));

      const response = await request(app)
        .post('/v1/swap/enhanced')
        .set('payment-signature', paymentPayload)
        .send({
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: 1000000000,
          userPublicKey: 'TestUserPublicKey',
          mevProtection: true, // Only MEV
          optimizePriorityFee: false,
          includeAnalytics: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.mevAnalysis).toBeDefined();
      expect(response.body.recommendedPriorityFee).toBeUndefined();
      expect(response.body.routeAnalytics).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid amount in quote', async () => {
      const response = await request(app)
        .get('/v1/quote')
        .query({
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          // Missing amount
        });

      expect(response.status).toBe(400);
    });
  });
});
