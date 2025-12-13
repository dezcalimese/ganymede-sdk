import type { QuoteResponse } from '@jup-ag/api';

/**
 * MEV (Maximal Extractable Value) risk analysis
 */
export interface MEVAnalysis {
  /** Risk score from 0-100, higher means more MEV risk */
  riskScore: number;
  /** Whether MEV protection is recommended for this swap */
  shouldUseMevProtection: boolean;
  /** Estimated potential MEV cost in USD if unprotected */
  estimatedMevCost: number;
  /** Human-readable recommendation */
  recommendation: string;
  /** Factors contributing to the risk assessment */
  factors: {
    poolLiquidity: 'low' | 'medium' | 'high';
    tradeSize: 'small' | 'medium' | 'large';
    tokenVolatility: 'low' | 'medium' | 'high';
    recentMevActivity: boolean;
  };
}

/**
 * High-volatility tokens (simplified list for MVP)
 */
const HIGH_VOLATILITY_TOKENS = new Set([
  // Meme coins and high-volatility assets
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
]);

/**
 * Stablecoin addresses
 */
const STABLECOINS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
]);

/**
 * Analyzes MEV risk for a given swap quote
 */
export async function getMEVAnalysis(
  quote: QuoteResponse,
  inputMint: string,
  outputMint: string
): Promise<MEVAnalysis> {
  const routePlan = quote.routePlan || [];
  const priceImpact = parseFloat(quote.priceImpactPct || '0');
  const swapAmount = parseInt(quote.inAmount);

  // Calculate MEV risk factors
  const factors = {
    poolLiquidity: assessPoolLiquidity(routePlan),
    tradeSize: assessTradeSize(swapAmount, inputMint),
    tokenVolatility: assessVolatility(inputMint, outputMint),
    recentMevActivity: await checkRecentMevActivity(inputMint, outputMint),
  };

  // Calculate composite risk score
  let riskScore = 0;

  // Pool liquidity factor (0-30 points)
  if (factors.poolLiquidity === 'low') riskScore += 30;
  else if (factors.poolLiquidity === 'medium') riskScore += 15;

  // Trade size factor (0-25 points)
  if (factors.tradeSize === 'large') riskScore += 25;
  else if (factors.tradeSize === 'medium') riskScore += 10;

  // Token volatility factor (0-25 points)
  if (factors.tokenVolatility === 'high') riskScore += 25;
  else if (factors.tokenVolatility === 'medium') riskScore += 10;

  // Recent MEV activity factor (0-20 points)
  if (factors.recentMevActivity) riskScore += 20;

  // Price impact contribution (0-20 points)
  riskScore += Math.min(priceImpact * 10, 20);

  // Stablecoin swaps have lower risk
  if (STABLECOINS.has(inputMint) && STABLECOINS.has(outputMint)) {
    riskScore = Math.max(0, riskScore - 30);
  }

  // Cap risk score at 100
  riskScore = Math.min(riskScore, 100);

  const estimatedMevCost = calculateEstimatedMevCost(quote, riskScore);

  return {
    riskScore: Math.round(riskScore),
    shouldUseMevProtection: riskScore > 40,
    estimatedMevCost,
    recommendation: generateRecommendation(riskScore, factors),
    factors,
  };
}

/**
 * Assesses pool liquidity based on route complexity
 */
function assessPoolLiquidity(routePlan: any[]): 'low' | 'medium' | 'high' {
  // More hops typically indicate lower liquidity in direct pools
  if (routePlan.length > 3) return 'low';
  if (routePlan.length > 1) return 'medium';
  return 'high';
}

/**
 * Assesses trade size relative to typical swap volumes
 */
function assessTradeSize(amount: number, inputMint: string): 'small' | 'medium' | 'large' {
  // SOL-based assessment (amount in lamports)
  if (inputMint === 'So11111111111111111111111111111111111111112') {
    const solAmount = amount / 1_000_000_000;
    if (solAmount > 100) return 'large';
    if (solAmount > 10) return 'medium';
    return 'small';
  }

  // USDC/USDT-based assessment (amount in atomic units, 6 decimals)
  if (STABLECOINS.has(inputMint)) {
    const usdAmount = amount / 1_000_000;
    if (usdAmount > 10000) return 'large';
    if (usdAmount > 1000) return 'medium';
    return 'small';
  }

  // For other tokens, use a general heuristic
  // Assuming 6 decimal tokens
  const normalizedAmount = amount / 1_000_000;
  if (normalizedAmount > 10000) return 'large';
  if (normalizedAmount > 1000) return 'medium';
  return 'small';
}

/**
 * Assesses token volatility based on known characteristics
 */
function assessVolatility(inputMint: string, outputMint: string): 'low' | 'medium' | 'high' {
  // Stablecoin to stablecoin = low volatility
  if (STABLECOINS.has(inputMint) && STABLECOINS.has(outputMint)) {
    return 'low';
  }

  // High-volatility token involved
  if (HIGH_VOLATILITY_TOKENS.has(inputMint) || HIGH_VOLATILITY_TOKENS.has(outputMint)) {
    return 'high';
  }

  // One stablecoin involved = medium
  if (STABLECOINS.has(inputMint) || STABLECOINS.has(outputMint)) {
    return 'medium';
  }

  // Token-to-token with no stablecoins = medium-high
  return 'medium';
}

/**
 * Checks for recent MEV activity on the token pair
 * In production, this would query MEV tracking services
 */
async function checkRecentMevActivity(inputMint: string, outputMint: string): Promise<boolean> {
  // For MVP: high-volatility tokens have higher MEV activity
  return HIGH_VOLATILITY_TOKENS.has(inputMint) || HIGH_VOLATILITY_TOKENS.has(outputMint);
}

/**
 * Calculates estimated MEV cost based on quote and risk score
 */
function calculateEstimatedMevCost(quote: QuoteResponse, riskScore: number): number {
  const outAmount = parseInt(quote.outAmount);
  // High risk trades lose 0.5-2% to MEV
  const mevPercentage = (riskScore / 100) * 0.02;
  // Assuming output is in USDC (6 decimals) or converting
  return Number(((outAmount * mevPercentage) / 1_000_000).toFixed(4));
}

/**
 * Generates a human-readable recommendation
 */
function generateRecommendation(riskScore: number, factors: MEVAnalysis['factors']): string {
  if (riskScore < 20) {
    return 'Low MEV risk. Standard transaction recommended.';
  }

  if (riskScore < 40) {
    return 'Moderate MEV risk. Consider using Jito bundles for larger trades.';
  }

  if (riskScore < 60) {
    let recommendation = 'Elevated MEV risk. MEV protection recommended.';
    if (factors.tradeSize === 'large') {
      recommendation += ' Consider splitting into smaller trades.';
    }
    return recommendation;
  }

  let recommendation = 'High MEV risk. Strongly recommend MEV protection.';
  if (factors.tradeSize === 'large') {
    recommendation += ' Splitting into smaller trades is advised.';
  }
  if (factors.tokenVolatility === 'high') {
    recommendation += ' High token volatility increases sandwich attack risk.';
  }
  return recommendation;
}
