import type { WalletAdapter } from '@solana/wallet-adapter-base';
import { GanymedeError, GanymedeErrorCode } from '../types.js';

/**
 * Extended wallet interface that includes signMessage
 */
interface MessageSignableWallet {
  publicKey: { toBase58(): string } | null;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Configuration for x402 payment wrapper
 */
export interface PaymentConfig {
  /** Maximum payment amount in USDC */
  maxPayment: number;
  /** Network to use for payments */
  network?: 'devnet' | 'mainnet';
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether to use payment idempotency */
  enableIdempotency?: boolean;
}

/**
 * Payment requirements from 402 response
 */
interface PaymentRequirements {
  x402Version: number;
  scheme: string;
  network: string;
  maxAmountRequired: string;
  amount: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: {
    address: string;
    decimals: number;
    symbol: string;
  };
}

/**
 * Idempotency key storage
 */
const idempotencyKeys = new Map<string, string>();

/**
 * Generates a unique idempotency key for a request
 */
function generateIdempotencyKey(
  url: string,
  method: string,
  walletAddress: string
): string {
  const timestamp = Date.now();
  const uniqueKey = `${walletAddress}:${url}:${method}:${timestamp}`;
  return `idem_${Buffer.from(uniqueKey).toString('base64url')}`;
}

/**
 * Gets or creates an idempotency key for a wallet
 */
function getIdempotencyKey(
  url: string,
  method: string,
  walletAddress: string
): string {
  const cacheKey = `${walletAddress}:${url}:${method}`;
  const existing = idempotencyKeys.get(cacheKey);

  if (existing) {
    return existing;
  }

  const newKey = generateIdempotencyKey(url, method, walletAddress);
  idempotencyKeys.set(cacheKey, newKey);
  return newKey;
}

/**
 * Parses the PAYMENT-REQUIRED header from a 402 response
 */
function parsePaymentRequirements(header: string): PaymentRequirements {
  try {
    const decoded = atob(header);
    return JSON.parse(decoded);
  } catch {
    throw new GanymedeError(
      GanymedeErrorCode.PAYMENT_DECLINED,
      'Failed to parse payment requirements from server'
    );
  }
}

/**
 * Creates a payment payload for x402
 */
async function createPaymentPayload(
  wallet: MessageSignableWallet,
  requirements: PaymentRequirements,
  _network: 'devnet' | 'mainnet',
  idempotencyKey: string
): Promise<string> {
  if (!wallet.signMessage) {
    throw new GanymedeError(
      GanymedeErrorCode.WALLET_SIGNING_FAILED,
      'Wallet does not support message signing required for x402 payments'
    );
  }

  if (!wallet.publicKey) {
    throw new GanymedeError(
      GanymedeErrorCode.WALLET_NOT_CONNECTED,
      'Wallet public key is not available'
    );
  }

  // Create the payment authorization message
  const message = JSON.stringify({
    x402Version: 1,
    scheme: requirements.scheme,
    network: requirements.network,
    amount: requirements.amount,
    resource: requirements.resource,
    payTo: requirements.payTo,
    timestamp: Date.now(),
    payer: wallet.publicKey.toBase58(),
    idempotencyKey, // Add idempotency key to prevent duplicate payments
  });

  // Sign the message with the wallet
  const messageBytes = new TextEncoder().encode(message);
  const signature = await wallet.signMessage(messageBytes);

  // Create the payment payload
  const payload = {
    x402Version: 1,
    scheme: requirements.scheme,
    network: requirements.network,
    payload: {
      message,
      signature: Buffer.from(signature).toString('base64'),
      publicKey: wallet.publicKey.toBase58(),
      idempotencyKey,
    },
  };

  return btoa(JSON.stringify(payload));
}

/**
 * Creates a fetch request with timeout
 */
async function fetchWithTimeout(
  input: string | URL | Request,
  init?: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new GanymedeError(
        GanymedeErrorCode.NETWORK_ERROR,
        `Request timeout after ${timeoutMs}ms`
      );
    }
    throw error;
  }
}

/**
 * Wraps fetch with automatic x402 payment handling
 *
 * When a request returns 402 Payment Required, this wrapper:
 * 1. Extracts payment requirements from the response
 * 2. Validates the payment amount against maxPayment limit
 * 3. Signs a payment authorization with the wallet
 * 4. Retries the request with the payment signature
 *
 * Features:
 * - Automatic timeout handling
 * - Idempotency key generation to prevent duplicate payments
 * - Configurable payment limits
 */
export function wrapFetchWithPayment(
  wallet: WalletAdapter,
  config: PaymentConfig
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  // Cast wallet to include signMessage capability
  const signableWallet = wallet as unknown as MessageSignableWallet;

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';

    // Get wallet address for idempotency
    const walletAddress = signableWallet.publicKey?.toBase58() || 'unknown';
    const idempotencyKey = config.enableIdempotency !== false
      ? getIdempotencyKey(url, method, walletAddress)
      : generateIdempotencyKey(url, method, walletAddress);

    const timeoutMs = config.timeout || 30000;

    try {
      // Make the initial request with timeout
      const response = await fetchWithTimeout(url, {
        ...init,
        headers: {
          ...init?.headers,
          'x-idempotency-key': idempotencyKey,
        },
      }, timeoutMs);

      // If not a 402, return as-is
      if (response.status !== 402) {
        return response;
      }

      // Extract payment requirements
      const paymentHeader = response.headers.get('payment-required') ||
                            response.headers.get('x-payment-required');

      if (!paymentHeader) {
        throw new GanymedeError(
          GanymedeErrorCode.PAYMENT_DECLINED,
          'Server returned 402 but no payment requirements were provided'
        );
      }

      const requirements = parsePaymentRequirements(paymentHeader);

      // Validate payment amount against limit
      const requiredAmount = parseInt(requirements.amount) / Math.pow(10, requirements.asset.decimals);
      if (requiredAmount > config.maxPayment) {
        throw new GanymedeError(
          GanymedeErrorCode.PAYMENT_EXCEEDED_LIMIT,
          `Payment of $${requiredAmount} exceeds maximum limit of $${config.maxPayment}`
        );
      }

      // Create and sign payment with idempotency key
      const paymentPayload = await createPaymentPayload(
        signableWallet,
        requirements,
        config.network || 'devnet',
        idempotencyKey
      );

      // Retry request with payment signature
      const retryInit: RequestInit = {
        ...init,
        headers: {
          ...init?.headers,
          'payment-signature': paymentPayload,
          'x-payment': paymentPayload,
          'x-idempotency-key': idempotencyKey,
        },
      };

      const paidResponse = await fetchWithTimeout(url, retryInit, timeoutMs);

      if (!paidResponse.ok) {
        const errorText = await paidResponse.text();
        throw new GanymedeError(
          GanymedeErrorCode.PAYMENT_DECLINED,
          `Payment was rejected: ${paidResponse.status} ${errorText}`
        );
      }

      return paidResponse;
    } catch (error) {
      if (error instanceof GanymedeError) throw error;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new GanymedeError(
        GanymedeErrorCode.NETWORK_ERROR,
        `Payment request failed: ${errorMessage}`,
        error
      );
    }
  };
}

/**
 * Extracts the payment transaction hash from response headers
 */
export function extractPaymentTxHash(response: Response): string | undefined {
  return response.headers.get('x-payment-response') ||
         response.headers.get('x-payment-txhash') ||
         undefined;
}

/**
 * Clears idempotency keys for a specific wallet
 */
export function clearIdempotencyKeys(walletAddress: string): void {
  for (const [key, value] of idempotencyKeys.entries()) {
    if (value.includes(walletAddress)) {
      idempotencyKeys.delete(key);
    }
  }
}

/**
 * Clears all idempotency keys (use sparingly)
 */
export function clearAllIdempotencyKeys(): void {
  idempotencyKeys.clear();
}
