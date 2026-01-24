import { Connection, ComputeBudgetProgram, type TransactionInstruction } from '@solana/web3.js';
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
  /** Compute units estimate for the transaction */
  estimatedComputeUnits: number;
}

/**
 * Network fee statistics
 */
interface FeeStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  p75: number;
  p95: number;
  sampleCount: number;
}

// Singleton connection for reuse
let connection: Connection | null = null;

/**
 * Gets or creates a connection instance
 */
function getConnection(): Connection {
  if (!connection) {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    connection = new Connection(rpcUrl, 'confirmed');
  }
  return connection;
}

/**
 * Refreshes the connection (useful for switching RPC endpoints)
 */
export function refreshConnection(rpcUrl?: string): void {
  const url = rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  connection = new Connection(url, 'confirmed');
}

/**
 * Gets recent priority fees and calculates statistics
 */
async function getRecentFeeStats(): Promise<FeeStats> {
  const conn = getConnection();

  const recentFees = await conn.getRecentPrioritizationFees();

  // Filter and sort fees
  const fees = recentFees
    .map(f => f.prioritizationFee)
    .filter(f => f > 0)
    .sort((a, b) => a - b);

  if (fees.length === 0) {
    // Return defaults if no fee data available
    return {
      min: 1000,
      max: 50000,
      avg: 10000,
      median: 5000,
      p75: 25000,
      p95: 50000,
      sampleCount: 0,
    };
  }

  const sum = fees.reduce((a, b) => a + b, 0);

  return {
    min: fees[0],
    max: fees[fees.length - 1],
    avg: sum / fees.length,
    median: fees[Math.floor(fees.length / 2)],
    p75: fees[Math.floor(fees.length * 0.75)],
    p95: fees[Math.floor(fees.length * 0.95)],
    sampleCount: fees.length,
  };
}

/**
 * Determines network congestion level based on fee statistics
 */
function determineCongestion(stats: FeeStats): 'low' | 'medium' | 'high' {
  const { avg, p75 } = stats;

  if (avg > 100000 || p75 > 200000) {
    return 'high';
  } else if (avg > 10000 || p75 > 50000) {
    return 'medium';
  }
  return 'low';
}

/**
 * Analyzes trade characteristics for priority fee adjustment
 */
function analyzeTradeCharacteristics(quote: QuoteResponse): {
  isLargeTrade: boolean;
  isHighImpact: boolean;
  hasMultipleHops: boolean;
  estimatedComputeUnits: number;
} {
  const tradeSize = parseInt(quote.inAmount);
  const priceImpact = parseFloat(quote.priceImpactPct || '0');
  const routePlan = quote.routePlan || [];
  const numHops = routePlan.length;

  // Large trade: > 1000 USDC equivalent
  const isLargeTrade = tradeSize > 1_000_000_000;

  // High price impact: > 1%
  const isHighImpact = priceImpact > 1;

  // Multiple hops increases complexity
  const hasMultipleHops = numHops > 1;

  // Estimate compute units based on complexity
  let estimatedComputeUnits = 100_000; // Base for simple swap

  if (isLargeTrade) estimatedComputeUnits += 50_000;
  if (isHighImpact) estimatedComputeUnits += 30_000;
  if (hasMultipleHops) estimatedComputeUnits += numHops * 20_000;

  // Cap at maximum
  estimatedComputeUnits = Math.min(estimatedComputeUnits, 1_400_000);

  return { isLargeTrade, isHighImpact, hasMultipleHops, estimatedComputeUnits };
}

/**
 * Calculates optimal priority fee based on network conditions and trade characteristics
 */
function calculateOptimalFee(
  stats: FeeStats,
  congestion: 'low' | 'medium' | 'high',
  characteristics: ReturnType<typeof analyzeTradeCharacteristics>
): { microLamports: number; tier: 'low' | 'medium' | 'high' | 'turbo' } {
  const { isLargeTrade, isHighImpact } = characteristics;

  // Base multiplier on congestion
  let baseMultiplier = 1;
  let tier: 'low' | 'medium' | 'high' | 'turbo' = 'low';

  switch (congestion) {
    case 'high':
      baseMultiplier = 2;
      tier = 'high';
      break;
    case 'medium':
      baseMultiplier = 1.5;
      tier = 'medium';
      break;
    default:
      baseMultiplier = 1;
      tier = 'low';
  }

  // Adjust for trade characteristics
  let recommendedFee: number;

  if (congestion === 'high' || isLargeTrade || isHighImpact) {
    // Use p95 for high-priority situations
    recommendedFee = stats.p95 * baseMultiplier;
    tier = 'turbo';
  } else if (congestion === 'medium') {
    recommendedFee = stats.p75 * baseMultiplier;
    tier = 'high';
  } else {
    recommendedFee = stats.p50 * baseMultiplier;
    tier = 'medium';
  }

  // Ensure minimum fee
  recommendedFee = Math.max(recommendedFee, 1000);

  // Cap maximum fee
  recommendedFee = Math.min(recommendedFee, 5_000_000);

  return { microLamports: Math.round(recommendedFee), tier };
}

/**
 * Gets optimal priority fee recommendation based on current network conditions
 */
export async function getOptimalPriorityFee(quote: QuoteResponse): Promise<PriorityFeeRecommendation> {
  const stats = await getRecentFeeStats();
  const congestion = determineCongestion(stats);
  const characteristics = analyzeTradeCharacteristics(quote);

  const { microLamports, tier } = calculateOptimalFee(stats, congestion, characteristics);

  // Calculate costs
  const costInLamports = (microLamports * characteristics.estimatedComputeUnits) / 1_000_000;
  const costInSol = costInLamports / 1_000_000_000;
  const solPrice = await getSolPrice();
  const costInUsd = costInSol * solPrice;

  return {
    microLamports,
    tier,
    estimatedLandingTime: getEstimatedLandingTime(tier),
    costInSol: Number(costInSol.toFixed(9)),
    costInUsd: Number(costInUsd.toFixed(6)),
    networkCongestion: congestion,
    recentFeePercentiles: {
      p25: stats.p75 * 0.25,
      p50: stats.median,
      p75: stats.p75,
      p95: stats.p95,
    },
    estimatedComputeUnits: characteristics.estimatedComputeUnits,
  };
}

/**
 * Creates a compute unit limit instruction
 */
export function createComputeUnitLimitInstruction(units: number): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitLimit({ units });
}

/**
 * Creates a compute unit price (priority fee) instruction
 */
export function createComputeUnitPriceInstruction(microLamports: number): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
}

/**
 * Creates both CU limit and price instructions for a transaction
 */
export function createComputeBudgetInstructions(
  microLamports: number,
  units?: number
): TransactionInstruction[] {
  const instructions: TransactionInstruction[] = [];

  if (units) {
    instructions.push(createComputeUnitLimitInstruction(units));
  }

  instructions.push(createComputeUnitPriceInstruction(microLamports));

  return instructions;
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

/**
 * Gets current network status overview
 */
export async function getNetworkStatus(): Promise<{
  congestion: 'low' | 'medium' | 'high';
  feeStats: FeeStats;
  slot: number;
  blockHeight: number;
}> {
  const conn = getConnection();
  const stats = await getRecentFeeStats();

  const [slot, blockHeight] = await Promise.all([
    conn.getSlot(),
    conn.getBlockHeight(),
  ]);

  return {
    congestion: determineCongestion(stats),
    feeStats: stats,
    slot,
    blockHeight,
  };
}
