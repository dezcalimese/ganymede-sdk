import { Router, type IRouter } from 'express';
import { getJupiterQuote, buildEnhancedSwap } from '../services/jupiter.js';
import { getMEVAnalysis } from '../services/mev.js';
import { getOptimalPriorityFee } from '../services/priority.js';
import { getRouteAnalytics } from '../services/analytics.js';
import { getPaymentInfo } from '../middleware/x402.js';

const router: IRouter = Router();

/**
 * Enhanced swap endpoint (x402-protected)
 *
 * This endpoint provides:
 * - MEV risk analysis and protection recommendations
 * - Optimal priority fee calculation
 * - Detailed route analytics
 *
 * Requires x402 micropayment of $0.005
 */
router.post('/v1/swap/enhanced', async (req, res) => {
  try {
    const {
      inputMint,
      outputMint,
      amount,
      slippageBps,
      userPublicKey,
      mevProtection,
      optimizePriorityFee,
      includeAnalytics,
    } = req.body;

    // Validate required fields
    if (!inputMint || !outputMint || !amount || !userPublicKey) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['inputMint', 'outputMint', 'amount', 'userPublicKey'],
      });
    }

    // Validate amount is a positive number
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Amount must be a positive number in smallest units',
      });
    }

    // Get payment info (set by x402 middleware)
    const paymentInfo = getPaymentInfo(req);
    console.log('[Premium] Request received', {
      inputMint: inputMint.slice(0, 8) + '...',
      outputMint: outputMint.slice(0, 8) + '...',
      amount,
      paymentTx: paymentInfo?.txHash?.slice(0, 16) + '...',
    });

    // Get base quote from Jupiter
    const quote = await getJupiterQuote({
      inputMint,
      outputMint,
      amount,
      slippageBps: slippageBps || 50,
    });

    // Build response with requested premium features
    const response: any = { quote };

    // MEV Analysis
    if (mevProtection) {
      console.log('[Premium] Generating MEV analysis...');
      response.mevAnalysis = await getMEVAnalysis(quote, inputMint, outputMint);
    }

    // Priority Fee Optimization
    if (optimizePriorityFee) {
      console.log('[Premium] Calculating optimal priority fee...');
      response.recommendedPriorityFee = await getOptimalPriorityFee(quote);
    }

    // Route Analytics
    if (includeAnalytics) {
      console.log('[Premium] Generating route analytics...');
      response.routeAnalytics = await getRouteAnalytics(quote);
    }

    // Build the swap transaction with optimizations applied
    console.log('[Premium] Building enhanced swap transaction...');
    const swapTransaction = await buildEnhancedSwap({
      quote,
      userPublicKey,
      priorityFee: response.recommendedPriorityFee?.microLamports,
      mevProtection: response.mevAnalysis?.shouldUseMevProtection,
    });

    response.swapTransaction = swapTransaction;

    console.log('[Premium] Response ready', {
      hasMevAnalysis: !!response.mevAnalysis,
      hasPriorityFee: !!response.recommendedPriorityFee,
      hasAnalytics: !!response.routeAnalytics,
    });

    res.json(response);
  } catch (error) {
    console.error('[Premium] Error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('No route found')) {
        return res.status(400).json({
          error: 'No route found',
          message: 'No swap route available for the requested token pair',
        });
      }

      if (error.message.includes('rate limit')) {
        return res.status(429).json({
          error: 'Rate limited',
          message: 'Too many requests. Please try again later.',
        });
      }
    }

    res.status(500).json({
      error: 'Failed to build enhanced swap',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Free tier quote endpoint (no payment required)
 */
router.get('/v1/quote', async (req, res) => {
  try {
    const { inputMint, outputMint, amount, slippageBps } = req.query;

    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({
        error: 'Missing required query parameters',
        required: ['inputMint', 'outputMint', 'amount'],
      });
    }

    const quote = await getJupiterQuote({
      inputMint: inputMint as string,
      outputMint: outputMint as string,
      amount: parseInt(amount as string),
      slippageBps: slippageBps ? parseInt(slippageBps as string) : 50,
    });

    res.json({ quote });
  } catch (error) {
    console.error('[Quote] Error:', error);
    res.status(500).json({
      error: 'Failed to get quote',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
