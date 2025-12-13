import { Connection } from '@solana/web3.js';
import type { QuoteResponse } from '@jup-ag/api';
import { getSolPrice } from './jupiter.js';

/**
 * Priority fee recommendation for optimal transaction landing
 */
export interface PriorityFeeRecommendation {
  /** Recommended priority fee in micro-lamports */
  microLamports: number;
  /** Fee tier classification */
  tier: 'low' | 'medium' | 'high' | 'turbo';
  /** Estimated time for transaction to land */
  estimatedLandingTime: string;
  /** Cost of priority fee in SOL */
  costInSol: number;
  /** Cost of priority fee in USD */
  costInUsd: number;
  /** Current network congestion level */
  networkCongestion: 'low' | 'medium' | 'high';
  /** Recent fee percentiles from network */
  recentFeePercentiles: {
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
}

// Solana connection (lazy initialized)
let connection: Connection | null = null;

function getConnection(): Connection {
  if (!connection) {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    connection = new Connection(rpcUrl);
  }
  return connection;
}

/**
 * Gets optimal priority fee recommendation based on current network conditions
 */
export async function getOptimalPriorityFee(quote: QuoteResponse): Promise<PriorityFeeRecommendation> {
  const conn = getConnection();

  // Get recent priority fee data
  const recentFees = await conn.getRecentPrioritizationFees();

  // Calculate percentiles from non-zero fees
  const fees = recentFees
    .map(f => f.prioritizationFee)
    .filter(f => f > 0)
    .sort((a, b) => a - b);

  const percentiles = {
    p25: getPercentile(fees, 25),
    p50: getPercentile(fees, 50),
    p75: getPercentile(fees, 75),
    p95: getPercentile(fees, 95),
  };

  // Determine network congestion based on average fee
  const avgFee = fees.length > 0
    ? fees.reduce((a, b) => a + b, 0) / fees.length
    : 0;

  const networkCongestion: 'low' | 'medium' | 'high' = avgFee > 100000
    ? 'high'
    : avgFee > 10000
      ? 'medium'
      : 'low';

  // Analyze trade characteristics
  const tradeSize = parseInt(quote.inAmount);
  const isLargeTrade = tradeSize > 1_000_000_000; // > 1000 USDC equivalent
  const priceImpact = parseFloat(quote.priceImpactPct || '0');
  const isHighImpact = priceImpact > 1;

  // Calculate optimal fee based on conditions
  let recommendedFee: number;
  let tier: 'low' | 'medium' | 'high' | 'turbo';

  if (networkCongestion === 'high' || isLargeTrade || isHighImpact) {
    // High priority for congested network or large/high-impact trades
    recommendedFee = percentiles.p95;
    tier = 'turbo';
  } else if (networkCongestion === 'medium') {
    recommendedFee = percentiles.p75;
    tier = 'high';
  } else {
    recommendedFee = percentiles.p50;
    tier = 'medium';
  }

  // Ensure minimum fee (1000 micro-lamports)
  recommendedFee = Math.max(recommendedFee, 1000);

  // Cap maximum fee at 5M micro-lamports (~0.005 SOL for 200k CU)
  recommendedFee = Math.min(recommendedFee, 5_000_000);

  // Calculate costs
  const estimatedCUs = 200000; // Typical swap CU usage
  const costInLamports = (recommendedFee * estimatedCUs) / 1_000_000;
  const costInSol = costInLamports / 1_000_000_000;
  const solPrice = await getSolPrice();
  const costInUsd = costInSol * solPrice;

  return {
    microLamports: Math.round(recommendedFee),
    tier,
    estimatedLandingTime: getEstimatedLandingTime(tier),
    costInSol: Number(costInSol.toFixed(9)),
    costInUsd: Number(costInUsd.toFixed(6)),
    networkCongestion,
    recentFeePercentiles: percentiles,
  };
}

/**
 * Calculates a percentile value from a sorted array
 */
function getPercentile(sortedArr: number[], percentile: number): number {
  if (sortedArr.length === 0) return 0;

  const index = Math.ceil((percentile / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)];
}

/**
 * Estimates landing time based on fee tier
 */
function getEstimatedLandingTime(tier: 'low' | 'medium' | 'high' | 'turbo'): string {
  switch (tier) {
    case 'turbo':
      return '< 1 second';
    case 'high':
      return '1-2 seconds';
    case 'medium':
      return '2-5 seconds';
    case 'low':
      return '5-10 seconds';
    default:
      return '2-5 seconds';
  }
}

/**
 * Calculates priority fee for Jito tips (MEV protection)
 */
export function calculateJitoTip(
  baseFee: number,
  urgencyMultiplier: number = 1.5
): number {
  // Jito tips should be higher than standard priority fees
  // Minimum tip is usually around 0.001 SOL
  const minTip = 1_000_000; // 0.001 SOL in lamports
  const calculatedTip = Math.round(baseFee * urgencyMultiplier);

  return Math.max(minTip, calculatedTip);
}
