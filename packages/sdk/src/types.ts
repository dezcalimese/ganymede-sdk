import type { QuoteResponse } from '@jup-ag/api';
import type { Connection, VersionedTransaction } from '@solana/web3.js';
import type { WalletAdapter } from '@solana/wallet-adapter-base';

/**
 * Configuration for the Ganymede client
 */
export interface GanymedeConfig {
  /** Connected wallet adapter for signing transactions and payments */
  wallet: WalletAdapter;
  /** Solana connection instance */
  connection: Connection;
  /** Custom API endpoint for x402-protected server (defaults to hosted version) */
  apiEndpoint?: string;
  /** Enable premium features requiring x402 micropayments */
  enablePremium?: boolean;
  /** Maximum payment allowed per swap in USDC (default: 0.01) */
  maxPaymentPerSwap?: number;
  /** Network to use: 'devnet' or 'mainnet' */
  network?: 'devnet' | 'mainnet';
}

/**
 * Parameters for requesting a swap quote or execution
 */
export interface SwapParams {
  /** Input token mint address */
  inputMint: string;
  /** Output token mint address */
  outputMint: string;
  /** Amount in smallest units (lamports for SOL, etc.) */
  amount: number;
  /** Slippage tolerance in basis points (100 = 1%) */
  slippageBps?: number;
  /** Enable MEV protection analysis (premium feature) */
  mevProtection?: boolean;
  /** Get optimized priority fee recommendation (premium feature) */
  optimizePriorityFee?: boolean;
  /** Include detailed route analytics (premium feature) */
  includeAnalytics?: boolean;
}

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

/**
 * Detailed breakdown of a single hop in the swap route
 */
export interface RouteHop {
  /** DEX/AMM name */
  dex: string;
  /** Input token mint */
  inputToken: string;
  /** Output token mint */
  outputToken: string;
  /** Input amount in atomic units */
  inputAmount: string;
  /** Output amount in atomic units */
  outputAmount: string;
  /** Price impact for this hop */
  priceImpact: number;
  /** Pool/AMM address */
  poolAddress: string;
  /** Pool liquidity if available */
  poolLiquidity?: number;
}

/**
 * Comprehensive route analytics
 */
export interface RouteAnalytics {
  /** Summary statistics */
  summary: {
    totalHops: number;
    dexesUsed: string[];
    estimatedGasCost: number;
    priceImpact: number;
    effectivePrice: number;
  };
  /** Comparison with alternatives */
  comparison: {
    vsBestAlternative: {
      savings: number;
      savingsPercent: number;
    };
    vsDirectRoute: {
      improvement: number;
      improvementPercent: number;
    } | null;
  };
  /** Detailed breakdown of each hop */
  breakdown: RouteHop[];
  /** Warning messages about the route */
  warnings: string[];
  /** Suggestions for optimization */
  optimizationSuggestions: string[];
}

/**
 * Result of a swap request
 */
export interface SwapResult {
  /** Serialized transaction ready for signing */
  transaction: VersionedTransaction;
  /** Quote details from Jupiter */
  quote: QuoteResponse;
  /** MEV analysis (only if mevProtection was requested) */
  mevAnalysis?: MEVAnalysis;
  /** Priority fee recommendation (only if optimizePriorityFee was requested) */
  recommendedPriorityFee?: PriorityFeeRecommendation;
  /** Route analytics (only if includeAnalytics was requested) */
  routeAnalytics?: RouteAnalytics;
  /** x402 payment transaction hash (if premium features were used) */
  paymentTxHash?: string;
}

/**
 * Enhanced swap response from the premium API
 */
export interface EnhancedSwapResponse {
  swapTransaction: string;
  quote: QuoteResponse;
  mevAnalysis?: MEVAnalysis;
  recommendedPriorityFee?: PriorityFeeRecommendation;
  routeAnalytics?: RouteAnalytics;
}

/**
 * Error codes for Ganymede operations
 */
export enum GanymedeErrorCode {
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  WALLET_SIGNING_FAILED = 'WALLET_SIGNING_FAILED',
  PAYMENT_DECLINED = 'PAYMENT_DECLINED',
  PAYMENT_EXCEEDED_LIMIT = 'PAYMENT_EXCEEDED_LIMIT',
  QUOTE_FAILED = 'QUOTE_FAILED',
  SWAP_FAILED = 'SWAP_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_PARAMS = 'INVALID_PARAMS',
}

/**
 * Custom error class for Ganymede operations
 */
export class GanymedeError extends Error {
  constructor(
    public code: GanymedeErrorCode,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'GanymedeError';
  }
}
