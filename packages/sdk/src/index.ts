/**
 * Ganymede SDK
 *
 * Jupiter swap SDK with x402 micropayment-gated premium features.
 *
 * Free tier: Basic Jupiter swaps (pass-through to Jupiter API)
 * Paid tier ($0.005/swap): MEV protection, priority fee optimization, route analytics
 *
 * @example
 * ```typescript
 * import { GanymedeClient } from 'ganymede';
 * import { Connection } from '@solana/web3.js';
 *
 * const client = new GanymedeClient({
 *   wallet: yourWallet,
 *   connection: new Connection('https://api.devnet.solana.com'),
 * });
 *
 * // Premium swap with all features
 * const result = await client.getEnhancedSwap({
 *   inputMint: 'So11111111111111111111111111111111111111112',  // SOL
 *   outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
 *   amount: 1_000_000_000, // 1 SOL
 *   mevProtection: true,
 *   optimizePriorityFee: true,
 *   includeAnalytics: true,
 * });
 *
 * console.log('MEV Risk:', result.mevAnalysis?.riskScore);
 * console.log('Priority Fee:', result.recommendedPriorityFee?.microLamports);
 *
 * const txid = await client.executeSwap(result);
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { GanymedeClient } from './client.js';

// Types
export type {
  GanymedeConfig,
  SwapParams,
  SwapResult,
  MEVAnalysis,
  PriorityFeeRecommendation,
  RouteAnalytics,
  RouteHop,
  EnhancedSwapResponse,
} from './types.js';

export { GanymedeError, GanymedeErrorCode } from './types.js';

// Utilities (for advanced usage)
export { wrapFetchWithPayment, extractPaymentTxHash } from './utils/x402-fetch.js';
export type { PaymentConfig } from './utils/x402-fetch.js';
export { validateWallet, getWalletAddress, supportsMessageSigning } from './utils/wallet.js';

// Re-export useful types from dependencies
export type { QuoteResponse } from '@jup-ag/api';
export type { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';
export type { WalletAdapter } from '@solana/wallet-adapter-base';

// Common token addresses for convenience
export const TOKENS = {
  /** Native SOL (wrapped) */
  SOL: 'So11111111111111111111111111111111111111112',
  /** USDC on Solana */
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  /** USDT on Solana */
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  /** Devnet USDC (for testing) */
  USDC_DEVNET: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;
