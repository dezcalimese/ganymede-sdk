import { describe, it, expect } from 'vitest';
import { getRouteAnalytics, type RouteAnalytics } from '../../src/services/analytics.js';

// Mock quote response
function createMockQuote(options: {
  inAmount?: string;
  outAmount?: string;
  priceImpactPct?: string;
  routePlan?: any[];
} = {}) {
  const defaultRoutePlan = [
    {
      swapInfo: {
        ammKey: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000000',
        outAmount: '150000000',
        feeAmount: '100000',
      },
    },
  ];

  return {
    inAmount: options.inAmount ?? '1000000000',
    outAmount: options.outAmount ?? '150000000',
    priceImpactPct: options.priceImpactPct ?? '0.1',
    routePlan: options.routePlan ?? defaultRoutePlan,
  } as any;
}

describe('getRouteAnalytics', () => {
  it('should return analytics with summary', async () => {
    const quote = createMockQuote();
    const analytics = await getRouteAnalytics(quote);

    expect(analytics.summary).toBeDefined();
    expect(analytics.summary.totalHops).toBe(1);
    expect(analytics.summary.dexesUsed).toContain('Raydium AMM');
    expect(typeof analytics.summary.estimatedGasCost).toBe('number');
    expect(typeof analytics.summary.priceImpact).toBe('number');
    expect(typeof analytics.summary.effectivePrice).toBe('number');
  });

  it('should identify multiple DEXes in multi-hop routes', async () => {
    const routePlan = [
      {
        swapInfo: {
          ammKey: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
          inputMint: 'token1',
          outputMint: 'token2',
          inAmount: '1000',
          outAmount: '900',
        },
      },
      {
        swapInfo: {
          ammKey: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca
          inputMint: 'token2',
          outputMint: 'token3',
          inAmount: '900',
          outAmount: '800',
        },
      },
    ];

    const quote = createMockQuote({ routePlan });
    const analytics = await getRouteAnalytics(quote);

    expect(analytics.summary.totalHops).toBe(2);
    expect(analytics.summary.dexesUsed).toContain('Raydium AMM');
    expect(analytics.summary.dexesUsed).toContain('Orca Whirlpools');
  });

  it('should generate warnings for high price impact', async () => {
    const quote = createMockQuote({ priceImpactPct: '2.5' });
    const analytics = await getRouteAnalytics(quote);

    expect(analytics.warnings.length).toBeGreaterThan(0);
    expect(analytics.warnings.some(w => w.includes('price impact'))).toBe(true);
  });

  it('should generate warnings for complex routes', async () => {
    const routePlan = Array(4).fill({
      swapInfo: {
        ammKey: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
        inputMint: 'token1',
        outputMint: 'token2',
        inAmount: '1000',
        outAmount: '900',
      },
    });

    const quote = createMockQuote({ routePlan });
    const analytics = await getRouteAnalytics(quote);

    expect(analytics.warnings.some(w => w.includes('Complex route'))).toBe(true);
  });

  it('should provide optimization suggestions', async () => {
    const routePlan = Array(3).fill({
      swapInfo: {
        ammKey: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
        inputMint: 'token1',
        outputMint: 'token2',
        inAmount: '1000',
        outAmount: '900',
      },
    });

    const quote = createMockQuote({ routePlan, priceImpactPct: '1.0' });
    const analytics = await getRouteAnalytics(quote);

    expect(analytics.optimizationSuggestions.length).toBeGreaterThan(0);
  });

  it('should provide route breakdown', async () => {
    const quote = createMockQuote();
    const analytics = await getRouteAnalytics(quote);

    expect(analytics.breakdown.length).toBe(1);
    expect(analytics.breakdown[0]).toHaveProperty('dex');
    expect(analytics.breakdown[0]).toHaveProperty('inputToken');
    expect(analytics.breakdown[0]).toHaveProperty('outputToken');
    expect(analytics.breakdown[0]).toHaveProperty('inputAmount');
    expect(analytics.breakdown[0]).toHaveProperty('outputAmount');
  });

  it('should include comparison data for multi-hop routes', async () => {
    const routePlan = [
      {
        swapInfo: {
          ammKey: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
          inputMint: 'token1',
          outputMint: 'token2',
          inAmount: '1000',
          outAmount: '900',
        },
      },
      {
        swapInfo: {
          ammKey: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
          inputMint: 'token2',
          outputMint: 'token3',
          inAmount: '900',
          outAmount: '800',
        },
      },
    ];

    const quote = createMockQuote({ routePlan });
    const analytics = await getRouteAnalytics(quote);

    expect(analytics.comparison.vsDirectRoute).not.toBeNull();
    expect(analytics.comparison.vsDirectRoute?.improvement).toBeGreaterThanOrEqual(0);
  });

  it('should return null vsDirectRoute for single-hop routes', async () => {
    const quote = createMockQuote();
    const analytics = await getRouteAnalytics(quote);

    expect(analytics.comparison.vsDirectRoute).toBeNull();
  });

  it('should estimate gas cost based on hops', async () => {
    const singleHopQuote = createMockQuote();
    const multiHopQuote = createMockQuote({
      routePlan: Array(3).fill({
        swapInfo: {
          ammKey: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
          inputMint: 'token1',
          outputMint: 'token2',
          inAmount: '1000',
          outAmount: '900',
        },
      }),
    });

    const singleHopAnalytics = await getRouteAnalytics(singleHopQuote);
    const multiHopAnalytics = await getRouteAnalytics(multiHopQuote);

    expect(multiHopAnalytics.summary.estimatedGasCost).toBeGreaterThan(
      singleHopAnalytics.summary.estimatedGasCost
    );
  });
});
