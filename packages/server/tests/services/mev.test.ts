import { describe, it, expect } from 'vitest';
import { getMEVAnalysis, type MEVAnalysis } from '../../src/services/mev.js';

// Mock quote response
function createMockQuote(options: {
  inAmount?: string;
  outAmount?: string;
  priceImpactPct?: string;
  routePlanLength?: number;
} = {}) {
  const hops = options.routePlanLength ?? 1;
  return {
    inAmount: options.inAmount ?? '1000000000',
    outAmount: options.outAmount ?? '150000000',
    priceImpactPct: options.priceImpactPct ?? '0.1',
    routePlan: Array(hops).fill({
      swapInfo: {
        ammKey: 'TestAMM',
        inputMint: 'input',
        outputMint: 'output',
        inAmount: '1000000000',
        outAmount: '150000000',
      },
    }),
  } as any;
}

describe('getMEVAnalysis', () => {
  it('should return low risk for stablecoin swaps', async () => {
    const quote = createMockQuote({ priceImpactPct: '0.01' });
    const inputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
    const outputMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'; // USDT

    const analysis = await getMEVAnalysis(quote, inputMint, outputMint);

    expect(analysis.riskScore).toBeLessThan(30);
    expect(analysis.shouldUseMevProtection).toBe(false);
    expect(analysis.factors.tokenVolatility).toBe('low');
  });

  it('should return higher risk for complex routes', async () => {
    const quote = createMockQuote({ routePlanLength: 4, priceImpactPct: '0.5' });
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

    const analysis = await getMEVAnalysis(quote, inputMint, outputMint);

    expect(analysis.factors.poolLiquidity).toBe('low');
    expect(analysis.riskScore).toBeGreaterThan(20);
  });

  it('should return higher risk for large trades', async () => {
    const quote = createMockQuote({ inAmount: '150000000000' }); // 150 SOL (> 100 threshold)
    const inputMint = 'So11111111111111111111111111111111111111112';
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const analysis = await getMEVAnalysis(quote, inputMint, outputMint);

    expect(analysis.factors.tradeSize).toBe('large');
  });

  it('should return higher risk for high volatility tokens', async () => {
    const quote = createMockQuote();
    const inputMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK (high volatility)
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const analysis = await getMEVAnalysis(quote, inputMint, outputMint);

    expect(analysis.factors.tokenVolatility).toBe('high');
    expect(analysis.riskScore).toBeGreaterThan(30);
  });

  it('should recommend MEV protection for high risk scores', async () => {
    const quote = createMockQuote({
      routePlanLength: 4,
      priceImpactPct: '2.0',
      inAmount: '100000000000',
    });
    const inputMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK
    const outputMint = 'So11111111111111111111111111111111111111112';

    const analysis = await getMEVAnalysis(quote, inputMint, outputMint);

    expect(analysis.shouldUseMevProtection).toBe(true);
    expect(analysis.recommendation).toContain('MEV protection');
  });

  it('should calculate estimated MEV cost', async () => {
    const quote = createMockQuote({ outAmount: '150000000' });
    const inputMint = 'So11111111111111111111111111111111111111112';
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const analysis = await getMEVAnalysis(quote, inputMint, outputMint);

    expect(analysis.estimatedMevCost).toBeGreaterThanOrEqual(0);
    expect(typeof analysis.estimatedMevCost).toBe('number');
  });

  it('should include all required factors', async () => {
    const quote = createMockQuote();
    const inputMint = 'So11111111111111111111111111111111111111112';
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const analysis = await getMEVAnalysis(quote, inputMint, outputMint);

    expect(analysis.factors).toHaveProperty('poolLiquidity');
    expect(analysis.factors).toHaveProperty('tradeSize');
    expect(analysis.factors).toHaveProperty('tokenVolatility');
    expect(analysis.factors).toHaveProperty('recentMevActivity');
    expect(['low', 'medium', 'high']).toContain(analysis.factors.poolLiquidity);
    expect(['small', 'medium', 'large']).toContain(analysis.factors.tradeSize);
    expect(['low', 'medium', 'high']).toContain(analysis.factors.tokenVolatility);
    expect(typeof analysis.factors.recentMevActivity).toBe('boolean');
  });

  it('should cap risk score at 100', async () => {
    // Create worst-case scenario
    const quote = createMockQuote({
      routePlanLength: 5,
      priceImpactPct: '10.0',
      inAmount: '1000000000000',
    });
    const inputMint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK
    const outputMint = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'; // WIF

    const analysis = await getMEVAnalysis(quote, inputMint, outputMint);

    expect(analysis.riskScore).toBeLessThanOrEqual(100);
  });
});
