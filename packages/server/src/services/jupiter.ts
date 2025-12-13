import { createJupiterApiClient, type QuoteGetRequest, type QuoteResponse } from '@jup-ag/api';

const jupiter = createJupiterApiClient();

/**
 * Parameters for getting a Jupiter quote
 */
export interface GetQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

/**
 * Parameters for building an enhanced swap transaction
 */
export interface BuildSwapParams {
  quote: QuoteResponse;
  userPublicKey: string;
  priorityFee?: number;
  mevProtection?: boolean;
}

/**
 * Gets a swap quote from Jupiter
 */
export async function getJupiterQuote(params: GetQuoteParams): Promise<QuoteResponse> {
  const quoteRequest: QuoteGetRequest = {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps ?? 50,
    restrictIntermediateTokens: true,
  };

  const quote = await jupiter.quoteGet(quoteRequest);

  if (!quote) {
    throw new Error('No route found for the requested swap');
  }

  return quote;
}

/**
 * Builds an enhanced swap transaction with optional optimizations
 */
export async function buildEnhancedSwap(params: BuildSwapParams): Promise<string> {
  const { swapTransaction } = await jupiter.swapPost({
    swapRequest: {
      quoteResponse: params.quote,
      userPublicKey: params.userPublicKey,
      dynamicComputeUnitLimit: true,
      // Apply custom priority fee if provided, otherwise use auto
      prioritizationFeeLamports: params.priorityFee
        ? { jitoTipLamports: params.priorityFee }
        : 'auto',
      // Use Jito for MEV protection if requested
      ...(params.mevProtection && {
        prioritizationFeeLamports: {
          jitoTipLamports: params.priorityFee || 10000,
        },
      }),
    },
  });

  return swapTransaction;
}

/**
 * Gets the current SOL price in USD
 */
export async function getSolPrice(): Promise<number> {
  try {
    // Use Jupiter's price API
    const response = await fetch(
      'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112'
    );

    if (!response.ok) {
      throw new Error('Failed to fetch SOL price');
    }

    const data = await response.json();
    const solData = data.data?.['So11111111111111111111111111111111111111112'];

    if (solData?.price) {
      return parseFloat(solData.price);
    }

    // Fallback price
    return 150;
  } catch {
    // Fallback if price fetch fails
    return 150;
  }
}

/**
 * Gets token info from Jupiter
 */
export async function getTokenInfo(mint: string): Promise<{
  symbol: string;
  name: string;
  decimals: number;
  price?: number;
} | null> {
  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const tokenData = data.data?.[mint];

    if (tokenData) {
      return {
        symbol: tokenData.mintSymbol || 'UNKNOWN',
        name: tokenData.mintSymbol || 'Unknown Token',
        decimals: 6, // Most SPL tokens use 6 decimals
        price: tokenData.price ? parseFloat(tokenData.price) : undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}
