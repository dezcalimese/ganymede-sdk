# Ganymede SDK

> Jupiter swap SDK with x402 micropayment-gated premium features

**Ganymede** wraps Jupiter's swap API with premium DeFi features accessed via x402 micropayments. Developers get automatic payment handling for enhanced swap capabilities.

## Why "Ganymede"?

Ganymede was the cupbearer to the gods — Zeus abducted him to serve drinks on Mount Olympus. For a payment SDK, "serving" transactions to developers is a perfect metaphor. Also, it's Jupiter's largest moon.

## Features

### Free Tier (No Payment)
- Direct Jupiter swap quotes
- Basic transaction building
- Standard swap execution

### Premium Tier ($0.005/swap)
- **MEV Protection Analysis** - Risk scoring, sandwich attack detection, Jito bundle support
- **Priority Fee Optimization** - Real-time fee recommendations based on network conditions
- **Route Analytics** - Detailed breakdown, warnings, and optimization suggestions

## Quick Start

### Installation

```bash
npm install ganymede @solana/web3.js
```

### Basic Usage (Free Tier)

```typescript
import { GanymedeClient, TOKENS } from 'ganymede';
import { Connection } from '@solana/web3.js';

const client = new GanymedeClient({
  wallet: yourWalletAdapter,
  connection: new Connection('https://api.devnet.solana.com'),
});

// Get a quote
const quote = await client.getQuote({
  inputMint: TOKENS.SOL,
  outputMint: TOKENS.USDC,
  amount: 1_000_000_000, // 1 SOL
});

// Build and execute swap
const result = await client.buildSwap({
  inputMint: TOKENS.SOL,
  outputMint: TOKENS.USDC,
  amount: 1_000_000_000,
});

const txid = await client.executeSwap(result);
```

### Premium Usage ($0.005/swap)

```typescript
import { GanymedeClient, TOKENS } from 'ganymede';

const client = new GanymedeClient({
  wallet: yourWalletAdapter,
  connection,
  enablePremium: true,
  maxPaymentPerSwap: 0.01, // Safety limit
});

// Get enhanced swap with all premium features
// Automatically pays $0.005 via x402
const result = await client.getEnhancedSwap({
  inputMint: TOKENS.SOL,
  outputMint: TOKENS.USDC,
  amount: 1_000_000_000,
  // Premium features
  mevProtection: true,
  optimizePriorityFee: true,
  includeAnalytics: true,
});

// Access premium data
console.log('MEV Risk:', result.mevAnalysis?.riskScore);
console.log('Priority Fee:', result.recommendedPriorityFee?.microLamports);
console.log('Route:', result.routeAnalytics?.summary.dexesUsed);

// Execute with optimizations applied
const txid = await client.executeSwap(result);
```

## How x402 Payments Work

1. Client calls a premium method (e.g., `getEnhancedSwap`)
2. Request hits the x402-protected API endpoint
3. Server returns `402 Payment Required` with payment details
4. SDK automatically signs payment authorization with connected wallet
5. Request retries with payment signature
6. Server verifies payment and returns premium data

The entire flow is transparent to the developer - just call the method and the SDK handles payment.

## Configuration

```typescript
interface GanymedeConfig {
  // Required
  wallet: WalletAdapter;      // Connected wallet
  connection: Connection;     // Solana connection

  // Optional
  apiEndpoint?: string;       // Premium API URL (default: hosted)
  enablePremium?: boolean;    // Enable premium features (default: true)
  maxPaymentPerSwap?: number; // Safety limit in USDC (default: 0.01)
  network?: 'devnet' | 'mainnet'; // Network (default: devnet)
}
```

## Premium Features

### MEV Protection Analysis

```typescript
interface MEVAnalysis {
  riskScore: number;            // 0-100
  shouldUseMevProtection: boolean;
  estimatedMevCost: number;     // USD
  recommendation: string;
  factors: {
    poolLiquidity: 'low' | 'medium' | 'high';
    tradeSize: 'small' | 'medium' | 'large';
    tokenVolatility: 'low' | 'medium' | 'high';
    recentMevActivity: boolean;
  };
}
```

### Priority Fee Optimization

```typescript
interface PriorityFeeRecommendation {
  microLamports: number;
  tier: 'low' | 'medium' | 'high' | 'turbo';
  estimatedLandingTime: string;
  costInSol: number;
  costInUsd: number;
  networkCongestion: 'low' | 'medium' | 'high';
  recentFeePercentiles: {
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
}
```

### Route Analytics

```typescript
interface RouteAnalytics {
  summary: {
    totalHops: number;
    dexesUsed: string[];
    estimatedGasCost: number;
    priceImpact: number;
  };
  breakdown: RouteHop[];
  warnings: string[];
  optimizationSuggestions: string[];
}
```

## Running the Server

For self-hosted deployments:

```bash
cd packages/server
cp .env.example .env
# Edit .env with your wallet address
pnpm dev
```

Server endpoints:
- `GET /health` - Health check
- `GET /info` - Server info
- `GET /v1/quote` - Free tier quote
- `POST /v1/swap/enhanced` - Premium swap ($0.005)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Your App      │────▶│  Ganymede SDK   │────▶│  Ganymede API   │
│                 │     │                 │     │  (x402-gated)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        │
                               │                        │
                               ▼                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  Jupiter API    │     │ Premium Services│
                        │  (Free quotes)  │     │ MEV/Fees/Routes │
                        └─────────────────┘     └─────────────────┘
```

## License

MIT

---

Built for the "Best Use of x402 w/ Solana" hackathon category.
