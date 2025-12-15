import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOptimalPriorityFee, calculateJitoTip } from '../../src/services/priority.js';

// Mock @solana/web3.js Connection
vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({
    getRecentPrioritizationFees: vi.fn().mockResolvedValue([
      { slot: 1, prioritizationFee: 1000 },
      { slot: 2, prioritizationFee: 5000 },
      { slot: 3, prioritizationFee: 10000 },
      { slot: 4, prioritizationFee: 50000 },
      { slot: 5, prioritizationFee: 100000 },
    ]),
  })),
}));

// Mock fetch for SOL price
const mockFetch = vi.fn();

describe('getOptimalPriorityFee', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          'So11111111111111111111111111111111111111112': {
            price: '150',
          },
        },
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return a priority fee recommendation', async () => {
    const quote = {
      inAmount: '1000000000',
      outAmount: '150000000',
      priceImpactPct: '0.1',
      routePlan: [{}],
    } as any;

    const recommendation = await getOptimalPriorityFee(quote);

    expect(recommendation).toHaveProperty('microLamports');
    expect(recommendation).toHaveProperty('tier');
    expect(recommendation).toHaveProperty('estimatedLandingTime');
    expect(recommendation).toHaveProperty('costInSol');
    expect(recommendation).toHaveProperty('costInUsd');
    expect(recommendation).toHaveProperty('networkCongestion');
    expect(recommendation).toHaveProperty('recentFeePercentiles');
  });

  it('should have valid tier values', async () => {
    const quote = {
      inAmount: '1000000000',
      outAmount: '150000000',
      priceImpactPct: '0.1',
      routePlan: [{}],
    } as any;

    const recommendation = await getOptimalPriorityFee(quote);

    expect(['low', 'medium', 'high', 'turbo']).toContain(recommendation.tier);
  });

  it('should calculate fee percentiles', async () => {
    const quote = {
      inAmount: '1000000000',
      outAmount: '150000000',
      priceImpactPct: '0.1',
      routePlan: [{}],
    } as any;

    const recommendation = await getOptimalPriorityFee(quote);

    expect(recommendation.recentFeePercentiles).toHaveProperty('p25');
    expect(recommendation.recentFeePercentiles).toHaveProperty('p50');
    expect(recommendation.recentFeePercentiles).toHaveProperty('p75');
    expect(recommendation.recentFeePercentiles).toHaveProperty('p95');
  });

  it('should return higher fees for large trades', async () => {
    const smallQuote = {
      inAmount: '100000000', // 0.1 SOL
      outAmount: '15000000',
      priceImpactPct: '0.1',
      routePlan: [{}],
    } as any;

    const largeQuote = {
      inAmount: '10000000000000', // 10000 SOL
      outAmount: '1500000000000',
      priceImpactPct: '0.1',
      routePlan: [{}],
    } as any;

    const smallRec = await getOptimalPriorityFee(smallQuote);
    const largeRec = await getOptimalPriorityFee(largeQuote);

    // Large trades should get turbo tier
    expect(largeRec.tier).toBe('turbo');
  });

  it('should ensure minimum fee', async () => {
    const quote = {
      inAmount: '1000000',
      outAmount: '150000',
      priceImpactPct: '0.01',
      routePlan: [{}],
    } as any;

    const recommendation = await getOptimalPriorityFee(quote);

    expect(recommendation.microLamports).toBeGreaterThanOrEqual(1000);
  });

  it('should calculate cost in SOL and USD', async () => {
    const quote = {
      inAmount: '1000000000',
      outAmount: '150000000',
      priceImpactPct: '0.1',
      routePlan: [{}],
    } as any;

    const recommendation = await getOptimalPriorityFee(quote);

    expect(recommendation.costInSol).toBeGreaterThan(0);
    expect(recommendation.costInUsd).toBeGreaterThan(0);
  });

  it('should provide landing time estimate', async () => {
    const quote = {
      inAmount: '1000000000',
      outAmount: '150000000',
      priceImpactPct: '0.1',
      routePlan: [{}],
    } as any;

    const recommendation = await getOptimalPriorityFee(quote);

    expect(recommendation.estimatedLandingTime).toMatch(/second/);
  });
});

describe('calculateJitoTip', () => {
  it('should calculate tip with default multiplier', () => {
    const baseFee = 100000;
    const tip = calculateJitoTip(baseFee);

    expect(tip).toBeGreaterThanOrEqual(1000000); // Minimum 0.001 SOL
  });

  it('should apply urgency multiplier', () => {
    const baseFee = 500000;
    const normalTip = calculateJitoTip(baseFee, 1);
    const urgentTip = calculateJitoTip(baseFee, 3);

    expect(urgentTip).toBeGreaterThan(normalTip);
  });

  it('should enforce minimum tip', () => {
    const veryLowFee = 100;
    const tip = calculateJitoTip(veryLowFee);

    expect(tip).toBe(1000000); // Minimum 0.001 SOL in lamports
  });
});
