import type { QuoteResponse } from '@jup-ag/api';

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
 * Known DEX names by AMM key prefix
 */
const DEX_NAMES: Record<string, string> = {
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpools',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca (Legacy)',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora DLMM',
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB': 'Meteora Pools',
  'SSwapUtytfBdBn1b9NUGG6foMVPtcWgpRU32HToDUZr': 'Saros AMM',
  'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY': 'Phoenix',
};

/**
 * Gets human-readable DEX name from AMM key
 */
function getDexName(ammKey: string): string {
  // Check for exact match
  if (DEX_NAMES[ammKey]) {
    return DEX_NAMES[ammKey];
  }

  // Check for prefix match
  for (const [prefix, name] of Object.entries(DEX_NAMES)) {
    if (ammKey.startsWith(prefix.slice(0, 8))) {
      return name;
    }
  }

  // Return shortened key if unknown
  return `DEX (${ammKey.slice(0, 8)}...)`;
}

/**
 * Analyzes the swap route and provides detailed analytics
 */
export async function getRouteAnalytics(quote: QuoteResponse): Promise<RouteAnalytics> {
  const routePlan = quote.routePlan || [];

  // Parse route breakdown
  const breakdown: RouteHop[] = routePlan.map((step: any) => {
    const swapInfo = step.swapInfo || {};
    return {
      dex: getDexName(swapInfo.ammKey || ''),
      inputToken: swapInfo.inputMint || '',
      outputToken: swapInfo.outputMint || '',
      inputAmount: swapInfo.inAmount || '0',
      outputAmount: swapInfo.outAmount || '0',
      priceImpact: parseFloat(swapInfo.feeAmount || '0') / parseInt(swapInfo.inAmount || '1') * 100,
      poolAddress: swapInfo.ammKey || '',
    };
  });

  // Extract unique DEXes
  const dexesUsed = [...new Set(breakdown.map(h => h.dex))];

  // Calculate summary metrics
  const totalPriceImpact = parseFloat(quote.priceImpactPct || '0');
  const inAmount = parseInt(quote.inAmount);
  const outAmount = parseInt(quote.outAmount);
  const effectivePrice = inAmount > 0 ? outAmount / inAmount : 0;

  // Generate warnings
  const warnings: string[] = [];
  if (totalPriceImpact > 1) {
    warnings.push(`High price impact: ${totalPriceImpact.toFixed(2)}%. Consider smaller trade size.`);
  }
  if (routePlan.length > 3) {
    warnings.push(`Complex route with ${routePlan.length} hops. Higher gas costs expected.`);
  }
  if (routePlan.length > 4) {
    warnings.push(`Very complex route may have higher failure risk.`);
  }

  // Check for unusual fee amounts
  const totalFees = breakdown.reduce((sum, hop) => {
    const feeAmount = parseFloat(hop.inputAmount) * hop.priceImpact / 100;
    return sum + feeAmount;
  }, 0);

  if (totalFees > inAmount * 0.01) {
    warnings.push(`Route has higher than average fees (${(totalFees / inAmount * 100).toFixed(2)}%).`);
  }

  // Generate optimization suggestions
  const suggestions: string[] = [];

  if (routePlan.length > 2) {
    suggestions.push('Consider timing your trade during lower congestion for simpler routes.');
  }

  if (totalPriceImpact > 0.5) {
    suggestions.push('Splitting into 2-3 smaller trades may reduce total price impact.');
  }

  if (totalPriceImpact > 2) {
    suggestions.push('Large price impact detected. Using limit orders might get better execution.');
  }

  // Check if using multiple DEXes (could indicate fragmented liquidity)
  if (dexesUsed.length > 2) {
    suggestions.push('Route uses multiple DEXes. Concentrated liquidity pools might offer better rates.');
  }

  return {
    summary: {
      totalHops: routePlan.length,
      dexesUsed,
      estimatedGasCost: estimateGasCost(routePlan.length),
      priceImpact: totalPriceImpact,
      effectivePrice: Number(effectivePrice.toFixed(10)),
    },
    comparison: {
      vsBestAlternative: {
        savings: 0, // Jupiter already provides best route
        savingsPercent: 0,
      },
      vsDirectRoute: routePlan.length > 1 ? {
        improvement: calculateRouteImprovement(quote),
        improvementPercent: calculateRouteImprovementPercent(quote),
      } : null,
    },
    breakdown,
    warnings,
    optimizationSuggestions: suggestions,
  };
}

/**
 * Estimates gas cost in lamports based on route complexity
 */
function estimateGasCost(hops: number): number {
  // Base cost + per-hop cost in lamports
  const baseCost = 5000;
  const perHopCost = 50000;
  return baseCost + (hops * perHopCost);
}

/**
 * Calculates improvement from using optimized route vs direct
 */
function calculateRouteImprovement(quote: QuoteResponse): number {
  const hops = (quote.routePlan || []).length;
  if (hops <= 1) return 0;

  // Estimate: multi-hop routes typically provide 0.1-0.5% better prices
  // This is a simplified calculation
  const outAmount = parseInt(quote.outAmount);
  return Number((outAmount * 0.002).toFixed(0));
}

/**
 * Calculates improvement percentage
 */
function calculateRouteImprovementPercent(quote: QuoteResponse): number {
  const hops = (quote.routePlan || []).length;
  if (hops <= 1) return 0;

  // Simplified: estimate 0.2% average improvement for multi-hop routes
  return 0.2;
}
