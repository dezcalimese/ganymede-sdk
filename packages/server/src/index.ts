import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import healthRoutes from './routes/health.js';
import premiumRoutes from './routes/premium.js';
import { paymentMiddleware, type PricingConfig } from './middleware/x402.js';

// Load environment variables from monorepo root
const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: true,
  exposedHeaders: [
    'Payment-Required',
    'X-Payment-Required',
    'X-Payment-Response',
    'X-Payment-TxHash',
  ],
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Payment wallet (receives x402 payments)
const PAYMENT_WALLET = process.env.PAYMENT_WALLET || 'YOUR_WALLET_ADDRESS_HERE';
const X402_FACILITATOR = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';

// Determine network based on environment
const isProduction = process.env.NODE_ENV === 'production';
const NETWORK = isProduction
  ? 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'  // Mainnet
  : 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'; // Devnet

// x402 pricing configuration
const premiumPricing: Record<string, PricingConfig> = {
  'POST /v1/swap/enhanced': {
    price: '$0.005',
    network: NETWORK,
    description: 'Enhanced swap with MEV protection, priority fees, and analytics',
    mimeType: 'application/json',
  },
};

// Apply x402 payment middleware to premium routes
app.use(paymentMiddleware(PAYMENT_WALLET, premiumPricing, X402_FACILITATOR));

// Routes
app.use('/', healthRoutes);
app.use('/', premiumRoutes);

// Error handling
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🌙 Ganymede API Server                                      ║
║   ─────────────────────────────────────────────────────────   ║
║                                                               ║
║   Server running on http://localhost:${PORT}                     ║
║   Network: ${isProduction ? 'Mainnet' : 'Devnet'}                                              ║
║   Payment wallet: ${PAYMENT_WALLET.slice(0, 8)}...${PAYMENT_WALLET.slice(-4)}                        ║
║                                                               ║
║   Endpoints:                                                  ║
║   • GET  /health           - Health check                     ║
║   • GET  /info             - Server info                      ║
║   • GET  /v1/quote         - Free tier quote (no payment)     ║
║   • POST /v1/swap/enhanced - Premium swap ($0.005)            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
