import { createJupiterApiClient, type QuoteGetRequest, type QuoteResponse } from '@jup-ag/api';
import {
  Connection,
  VersionedTransaction,
  type Transaction,
} from '@solana/web3.js';
import {
  type GanymedeConfig,
  type SwapParams,
  type SwapResult,
  type EnhancedSwapResponse,
  GanymedeError,
  GanymedeErrorCode,
} from './types.js';
import { validateWallet, getWalletAddress } from './utils/wallet.js';
import { wrapFetchWithPayment, extractPaymentTxHash } from './utils/x402-fetch.js';

/**
 * Extended wallet interface that includes optional signTransaction
 */
interface SignableWallet {
  signTransaction?<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
}

/** Default API endpoint for the Ganymede premium server */
const DEFAULT_API_ENDPOINT = 'http://localhost:3001';

/** Default maximum payment per swap in USDC */
const DEFAULT_MAX_PAYMENT = 0.01;

/** Default slippage in basis points (0.5%) */
const DEFAULT_SLIPPAGE_BPS = 50;

/** Default compute unit limit for swaps */
const DEFAULT_COMPUTE_UNIT_LIMIT = 200_000;

/** Maximum retry attempts for transactions */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY = 500;

/** Maximum retry delay (ms) */
const MAX_RETRY_DELAY = 5000;

/**
 * Blockhash data with expiration info
 */
interface BlockhashData {
  blockhash: string;
  lastValidBlockHeight: number;
}

/**
 * Fetches latest blockhash with expiration height
 */
async function getLatestBlockhash(connection: Connection): Promise<BlockhashData> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  return { blockhash, lastValidBlockHeight };
}

/**
 * Waits for transaction confirmation with proper error handling
 */
async function confirmTransaction(
  connection: Connection,
  txid: string,
  commitment: 'confirmed' | 'finalized' = 'confirmed'
): Promise<boolean> {
  const confirmation = await connection.confirmTransaction(
    { signature: txid, ...await getLatestBlockhash(connection) },
    commitment
  );

  if (confirmation.value.err) {
    throw new GanymedeError(
      GanymedeErrorCode.SWAP_FAILED,
      `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
    );
  }

  return true;
}

/**
 * Checks if transaction has expired based on block height
 */
async function hasTransactionExpired(
  connection: Connection,
  lastValidBlockHeight: number
): Promise<boolean> {
  const currentBlockHeight = await connection.getBlockHeight('confirmed');
  return currentBlockHeight > lastValidBlockHeight;
}

/**
 * Exponential backoff delay calculator
 */
function getRetryDelay(attempt: number): number {
  const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY);
}

/**
 * Sends transaction with retry logic and proper error handling
 */
async function sendTransactionWithRetry(
  connection: Connection,
  serializedTransaction: Uint8Array,
  blockhashData: BlockhashData
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      // Check if transaction has expired before sending
      if (await hasTransactionExpired(connection, blockhashData.lastValidBlockHeight)) {
        throw new GanymedeError(
          GanymedeErrorCode.SWAP_FAILED,
          'Transaction blockhash has expired. Please rebuild the transaction.'
        );
      }

      const txid = await connection.sendRawTransaction(serializedTransaction, {
        skipPreflight: false, // Keep preflight checks for better error detection
        maxRetries: 0, // Manual retry control
        preflightCommitment: 'confirmed',
      });

      // Wait for confirmation
      await confirmTransaction(connection, txid, 'confirmed');

      return txid;
    } catch (error) {
      lastError = error as Error;

      // If this is a blockhash expired error, don't retry
      if (lastError.message.includes('blockhash has expired')) {
        throw lastError;
      }

      // If we've exhausted retries, give up
      if (attempt >= MAX_RETRY_ATTEMPTS) {
        throw new GanymedeError(
          GanymedeErrorCode.SWAP_FAILED,
          `Transaction failed after ${MAX_RETRY_ATTEMPTS} retry attempts: ${lastError.message}`,
          lastError
        );
      }

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
    }
  }

  throw lastError;
}

/**
 * GanymedeClient - Jupiter swap SDK with x402 micropayment-gated premium features
 *
 * Free tier: Basic Jupiter swaps (direct pass-through)
 * Paid tier ($0.005/swap): MEV protection, priority fee optimization, route analytics
 *
 * @example
 * ```typescript
 * const client = new GanymedeClient({
 *   wallet: phantomWallet,
 *   connection: new Connection('https://api.devnet.solana.com'),
 *   enablePremium: true,
 * });
 *
 * // Free tier - basic swap
 * const quote = await client.getQuote({
 *   inputMint: 'So11111111111111111111111111111111111111112',
 *   outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
 *   amount: 1_000_000_000,
 * });
 *
 * // Premium tier - enhanced swap with MEV protection
 * const result = await client.getEnhancedSwap({
 *   inputMint: 'So11111111111111111111111111111111111111112',
 *   outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
 *   amount: 1_000_000_000,
 *   mevProtection: true,
 *   optimizePriorityFee: true,
 * });
 * ```
 */
export class GanymedeClient {
  private jupiter: ReturnType<typeof createJupiterApiClient>;
  private config: Required<GanymedeConfig>;
  private paidFetch: typeof fetch | null = null;

  constructor(config: GanymedeConfig) {
    this.config = {
      wallet: config.wallet,
      connection: config.connection,
      apiEndpoint: config.apiEndpoint || DEFAULT_API_ENDPOINT,
      enablePremium: config.enablePremium ?? true,
      maxPaymentPerSwap: config.maxPaymentPerSwap ?? DEFAULT_MAX_PAYMENT,
      network: config.network || 'devnet',
    };

    // Initialize Jupiter API client
    this.jupiter = createJupiterApiClient();
  }

  /**
   * Gets the configured API endpoint
   */
  get apiEndpoint(): string {
    return this.config.apiEndpoint;
  }

  /**
   * Gets the current network setting
   */
  get network(): 'devnet' | 'mainnet' {
    return this.config.network;
  }

  /**
   * Checks if premium features are enabled
   */
  get isPremiumEnabled(): boolean {
    return this.config.enablePremium;
  }

  /**
   * Free tier: Get a swap quote directly from Jupiter
   *
   * This is a pass-through to Jupiter's quote API with no additional fees.
   */
  async getQuote(params: Omit<SwapParams, 'mevProtection' | 'optimizePriorityFee' | 'includeAnalytics'>): Promise<QuoteResponse> {
    try {
      const quoteRequest: QuoteGetRequest = {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
        restrictIntermediateTokens: true, // More stable routes
      };

      const quote = await this.jupiter.quoteGet(quoteRequest);

      if (!quote) {
        throw new GanymedeError(
          GanymedeErrorCode.QUOTE_FAILED,
          'No route found for the requested swap'
        );
      }

      return quote;
    } catch (error) {
      if (error instanceof GanymedeError) throw error;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new GanymedeError(
        GanymedeErrorCode.QUOTE_FAILED,
        `Failed to get quote: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Free tier: Build a swap transaction from a quote
   *
   * Gets a quote and builds a ready-to-sign transaction.
   */
  async buildSwap(params: Omit<SwapParams, 'mevProtection' | 'optimizePriorityFee' | 'includeAnalytics'>): Promise<SwapResult> {
    validateWallet(this.config.wallet);

    const quote = await this.getQuote(params);

    try {
      const { swapTransaction } = await this.jupiter.swapPost({
        swapRequest: {
          quoteResponse: quote,
          userPublicKey: getWalletAddress(this.config.wallet),
          dynamicComputeUnitLimit: true,
        },
      });

      const transaction = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, 'base64')
      );

      return {
        transaction,
        quote,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new GanymedeError(
        GanymedeErrorCode.SWAP_FAILED,
        `Failed to build swap transaction: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Premium tier: Get an enhanced swap with MEV protection, priority fees, and analytics
   *
   * This triggers an x402 micropayment ($0.005) for premium features.
   * If no premium features are requested, falls back to free tier.
   */
  async getEnhancedSwap(params: SwapParams): Promise<SwapResult> {
    validateWallet(this.config.wallet);

    const hasPremiumFeatures = params.mevProtection ||
                               params.optimizePriorityFee ||
                               params.includeAnalytics;

    // Fall back to free tier if no premium features requested or premium disabled
    if (!hasPremiumFeatures || !this.config.enablePremium) {
      return this.buildSwap(params);
    }

    return this.fetchPremiumSwap(params);
  }

  /**
   * Fetches premium swap data from the x402-protected API
   */
  private async fetchPremiumSwap(params: SwapParams): Promise<SwapResult> {
    // Initialize paid fetch wrapper if not already done
    if (!this.paidFetch) {
      this.paidFetch = wrapFetchWithPayment(this.config.wallet, {
        maxPayment: this.config.maxPaymentPerSwap,
        network: this.config.network,
      });
    }

    try {
      const response = await this.paidFetch(`${this.config.apiEndpoint}/v1/swap/enhanced`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
          userPublicKey: getWalletAddress(this.config.wallet),
          mevProtection: params.mevProtection ?? false,
          optimizePriorityFee: params.optimizePriorityFee ?? false,
          includeAnalytics: params.includeAnalytics ?? false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new GanymedeError(
          GanymedeErrorCode.SWAP_FAILED,
          `Premium swap request failed: ${response.status} ${errorText}`
        );
      }

      const data = await response.json() as EnhancedSwapResponse;

      const transaction = VersionedTransaction.deserialize(
        Buffer.from(data.swapTransaction, 'base64')
      );

      return {
        transaction,
        quote: data.quote,
        mevAnalysis: data.mevAnalysis,
        recommendedPriorityFee: data.recommendedPriorityFee,
        routeAnalytics: data.routeAnalytics,
        paymentTxHash: extractPaymentTxHash(response),
      };
    } catch (error) {
      if (error instanceof GanymedeError) throw error;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new GanymedeError(
        GanymedeErrorCode.NETWORK_ERROR,
        `Failed to fetch premium swap: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Executes a swap transaction with robust error handling and retry logic
   *
   * Signs and sends the transaction with proper compute unit settings,
   * then waits for confirmation with automatic retry on failure.
   *
   * @param result - The swap result containing the transaction to execute
   * @returns The transaction signature
   */
  async executeSwap(result: SwapResult): Promise<string> {
    validateWallet(this.config.wallet);

    const wallet = this.config.wallet as unknown as SignableWallet;
    if (!wallet.signTransaction) {
      throw new GanymedeError(
        GanymedeErrorCode.WALLET_SIGNING_FAILED,
        'Wallet does not support transaction signing'
      );
    }

    try {
      // Sign the transaction
      const signed = await wallet.signTransaction(result.transaction);

      // Get fresh blockhash for sending
      const blockhashData = await getLatestBlockhash(this.config.connection);

      // Send with retry logic
      const txid = await sendTransactionWithRetry(
        this.config.connection,
        signed.serialize(),
        blockhashData
      );

      return txid;
    } catch (error) {
      if (error instanceof GanymedeError) throw error;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new GanymedeError(
        GanymedeErrorCode.SWAP_FAILED,
        `Failed to execute swap: ${errorMessage}`,
        error
      );
    }
  }

  /**
   * Convenience method: Get quote, build, and execute swap in one call
   *
   * @param params - Swap parameters
   * @returns Object containing the transaction signature and swap result
   */
  async swap(params: SwapParams): Promise<{ txid: string; result: SwapResult }> {
    const result = await this.getEnhancedSwap(params);
    const txid = await this.executeSwap(result);
    return { txid, result };
  }
}

// Re-export utilities for external use
export { getLatestBlockhash };
