# Ganymede API Reference

## GanymedeClient

The main client class for interacting with Jupiter swaps and premium features.

### Constructor

```typescript
new GanymedeClient(config: GanymedeConfig)
```

#### GanymedeConfig

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `wallet` | `WalletAdapter` | Yes | - | Connected Solana wallet |
| `connection` | `Connection` | Yes | - | Solana RPC connection |
| `apiEndpoint` | `string` | No | `http://localhost:3001` | Premium API endpoint |
| `enablePremium` | `boolean` | No | `true` | Enable premium features |
| `maxPaymentPerSwap` | `number` | No | `0.01` | Max payment in USDC |
| `network` | `'devnet' \| 'mainnet'` | No | `'devnet'` | Network to use |

---

## Methods

### getQuote(params)

Gets a swap quote from Jupiter (free tier).

```typescript
async getQuote(params: QuoteParams): Promise<QuoteResponse>
```

#### Parameters

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `inputMint` | `string` | Yes | - | Input token mint address |
| `outputMint` | `string` | Yes | - | Output token mint address |
| `amount` | `number` | Yes | - | Amount in smallest units |
| `slippageBps` | `number` | No | `50` | Slippage in basis points |

#### Returns

`QuoteResponse` from Jupiter API.

---

### buildSwap(params)

Builds a swap transaction (free tier).

```typescript
async buildSwap(params: QuoteParams): Promise<SwapResult>
```

#### Returns

```typescript
interface SwapResult {
  transaction: VersionedTransaction;
  quote: QuoteResponse;
}
```

---

### getEnhancedSwap(params)

Gets enhanced swap with premium features (requires x402 payment).

```typescript
async getEnhancedSwap(params: SwapParams): Promise<SwapResult>
```

#### Parameters

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `inputMint` | `string` | Yes | - | Input token mint |
| `outputMint` | `string` | Yes | - | Output token mint |
| `amount` | `number` | Yes | - | Amount in smallest units |
| `slippageBps` | `number` | No | `50` | Slippage tolerance |
| `mevProtection` | `boolean` | No | `false` | Enable MEV analysis |
| `optimizePriorityFee` | `boolean` | No | `false` | Get optimal priority fee |
| `includeAnalytics` | `boolean` | No | `false` | Include route analytics |

#### Returns

```typescript
interface SwapResult {
  transaction: VersionedTransaction;
  quote: QuoteResponse;
  mevAnalysis?: MEVAnalysis;           // If mevProtection: true
  recommendedPriorityFee?: PriorityFeeRecommendation; // If optimizePriorityFee: true
  routeAnalytics?: RouteAnalytics;     // If includeAnalytics: true
  paymentTxHash?: string;              // x402 payment confirmation
}
```

---

### executeSwap(result)

Signs and sends a swap transaction.

```typescript
async executeSwap(result: SwapResult): Promise<string>
```

#### Returns

Transaction signature (txid).

---

### swap(params)

Convenience method: quote, build, and execute in one call.

```typescript
async swap(params: SwapParams): Promise<{ txid: string; result: SwapResult }>
```

---

## Types

### MEVAnalysis

```typescript
interface MEVAnalysis {
  riskScore: number;                 // 0-100
  shouldUseMevProtection: boolean;
  estimatedMevCost: number;          // USD
  recommendation: string;
  factors: {
    poolLiquidity: 'low' | 'medium' | 'high';
    tradeSize: 'small' | 'medium' | 'large';
    tokenVolatility: 'low' | 'medium' | 'high';
    recentMevActivity: boolean;
  };
}
```

### PriorityFeeRecommendation

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

### RouteAnalytics

```typescript
interface RouteAnalytics {
  summary: {
    totalHops: number;
    dexesUsed: string[];
    estimatedGasCost: number;
    priceImpact: number;
    effectivePrice: number;
  };
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
  breakdown: RouteHop[];
  warnings: string[];
  optimizationSuggestions: string[];
}
```

### RouteHop

```typescript
interface RouteHop {
  dex: string;
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  poolAddress: string;
  poolLiquidity?: number;
}
```

---

## Error Handling

```typescript
import { GanymedeError, GanymedeErrorCode } from 'ganymede';

try {
  const result = await client.getEnhancedSwap(params);
} catch (error) {
  if (error instanceof GanymedeError) {
    switch (error.code) {
      case GanymedeErrorCode.WALLET_NOT_CONNECTED:
        // Handle wallet not connected
        break;
      case GanymedeErrorCode.PAYMENT_EXCEEDED_LIMIT:
        // Handle payment limit exceeded
        break;
      case GanymedeErrorCode.QUOTE_FAILED:
        // Handle no route found
        break;
      // ... etc
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `WALLET_NOT_CONNECTED` | Wallet is not connected |
| `WALLET_SIGNING_FAILED` | Failed to sign transaction/message |
| `PAYMENT_DECLINED` | x402 payment was declined |
| `PAYMENT_EXCEEDED_LIMIT` | Payment exceeds maxPaymentPerSwap |
| `QUOTE_FAILED` | Failed to get quote from Jupiter |
| `SWAP_FAILED` | Swap transaction failed |
| `NETWORK_ERROR` | Network request failed |
| `INVALID_PARAMS` | Invalid parameters provided |

---

## Constants

### TOKENS

Common token mint addresses:

```typescript
import { TOKENS } from 'ganymede';

TOKENS.SOL          // Native SOL (wrapped)
TOKENS.USDC         // USDC mainnet
TOKENS.USDT         // USDT mainnet
TOKENS.USDC_DEVNET  // USDC devnet
```

---

## Server API

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| GET | `/info` | None | Server info |
| GET | `/v1/quote` | None | Free tier quote |
| POST | `/v1/swap/enhanced` | x402 | Premium swap |

### POST /v1/swap/enhanced

**Cost:** $0.005 USDC via x402

**Request:**
```json
{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": 1000000000,
  "slippageBps": 50,
  "userPublicKey": "YourWalletAddress",
  "mevProtection": true,
  "optimizePriorityFee": true,
  "includeAnalytics": true
}
```

**Response:**
```json
{
  "quote": { ... },
  "swapTransaction": "base64EncodedTransaction",
  "mevAnalysis": { ... },
  "recommendedPriorityFee": { ... },
  "routeAnalytics": { ... }
}
```

**Headers:**
- `X-Payment-Response` - Payment transaction hash (after successful payment)
