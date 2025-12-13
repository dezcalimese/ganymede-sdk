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
  _network: 'devnet' | 'mainnet'
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
    },
  };

  return btoa(JSON.stringify(payload));
}

/**
 * Wraps fetch with automatic x402 payment handling
 *
 * When a request returns 402 Payment Required, this wrapper:
 * 1. Extracts payment requirements from the response
 * 2. Validates the payment amount against maxPayment limit
 * 3. Signs a payment authorization with the wallet
 * 4. Retries the request with the payment signature
 */
export function wrapFetchWithPayment(
  wallet: WalletAdapter,
  config: PaymentConfig
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  // Cast wallet to include signMessage capability
  const signableWallet = wallet as unknown as MessageSignableWallet;

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    // Make the initial request
    const response = await fetch(input, init);

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

    // Create and sign payment
    const paymentPayload = await createPaymentPayload(
      signableWallet,
      requirements,
      config.network || 'devnet'
    );

    // Retry request with payment signature
    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...init?.headers,
        'payment-signature': paymentPayload,
        'x-payment': paymentPayload,
      },
    };

    const paidResponse = await fetch(input, retryInit);

    if (!paidResponse.ok) {
      throw new GanymedeError(
        GanymedeErrorCode.PAYMENT_DECLINED,
        `Payment was rejected: ${paidResponse.statusText}`
      );
    }

    return paidResponse;
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
