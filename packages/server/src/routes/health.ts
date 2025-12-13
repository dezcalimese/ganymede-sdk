import { Router, type IRouter } from 'express';

const router: IRouter = Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

/**
 * Server info endpoint
 */
router.get('/info', (req, res) => {
  res.json({
    name: 'Ganymede API',
    version: '1.0.0',
    description: 'x402 micropayment-gated premium Jupiter swap features',
    pricing: {
      'POST /v1/swap/enhanced': '$0.005 per request',
    },
    features: {
      mevProtection: 'MEV risk analysis and Jito bundle support',
      priorityFees: 'Optimal priority fee recommendations',
      analytics: 'Detailed route analytics and optimization suggestions',
    },
    network: process.env.NODE_ENV === 'production' ? 'mainnet' : 'devnet',
  });
});

export default router;
