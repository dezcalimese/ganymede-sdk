# Ganymede

> Jupiter swap SDK with x402 micropayment-gated premium features

**Ganymede** wraps Jupiter's swap API with premium DeFi features accessed via [x402](https://x402.org) micropayments. Pay $0.005 per swap for MEV protection analysis, priority fee optimization, and route analytics.

## Quick Start

```bash
# Install
npm install ganymede @solana/web3.js

# Or with pnpm
pnpm add ganymede @solana/web3.js
```

```typescript
import { GanymedeClient, TOKENS } from 'ganymede';
import { Connection } from '@solana/web3.js';

const client = new GanymedeClient({
  wallet: yourWalletAdapter,
  connection: new Connection('https://api.devnet.solana.com'),
  enablePremium: true,
});

// Premium swap with all features ($0.005)
const result = await client.getEnhancedSwap({
  inputMint: TOKENS.SOL,
  outputMint: TOKENS.USDC,
  amount: 1_000_000_000, // 1 SOL
  mevProtection: true,
  optimizePriorityFee: true,
  includeAnalytics: true,
});

console.log('MEV Risk:', result.mevAnalysis?.riskScore);
console.log('Priority Fee:', result.recommendedPriorityFee?.tier);
```

## Features

| Feature | Free | Premium ($0.005) |
|---------|------|-----------------|
| Jupiter quotes | ✅ | ✅ |
| Swap execution | ✅ | ✅ |
| MEV risk analysis | ❌ | ✅ |
| Priority fee optimization | ❌ | ✅ |
| Route analytics | ❌ | ✅ |

## Documentation

- [Full Documentation](./docs/README.md)
- [API Reference](./docs/API.md)
- [Examples](./examples/)

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run server (dev mode)
pnpm dev:server

# Run SDK in watch mode
pnpm dev:sdk
```

## Project Structure

```
ganymede/
├── packages/
│   ├── sdk/          # Client SDK (npm package)
│   └── server/       # x402-protected API server
├── examples/         # Usage examples
└── docs/            # Documentation
```

## How x402 Works

x402 is an open payment protocol that uses HTTP 402 Payment Required for micropayments:

1. Client requests premium feature
2. Server returns `402` with payment requirements
3. SDK signs payment with wallet
4. Request retries with payment signature
5. Server verifies and returns premium data

All payment handling is automatic - just call the method.

## License

MIT

---

Built for the **"Best Use of x402 w/ Solana"** hackathon.
