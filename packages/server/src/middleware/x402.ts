import type { Request, Response, NextFunction } from 'express';

/**
 * Pricing configuration for x402-protected endpoints
 */
export interface PricingConfig {
  /** Price in USD (e.g., "$0.005") */
  price: string;
  /** Network identifier in CAIP-2 format */
  network: string;
  /** Description of what the payment is for */
  description: string;
  /** MIME type of the response */
  mimeType?: string;
}

/**
 * x402 payment requirements sent to client
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
 * USDC token addresses by network
 */
const USDC_ADDRESSES: Record<string, string> = {
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet
};

/**
 * Parses a price string like "$0.005" into atomic units
 */
function parsePrice(priceString: string, decimals: number): string {
  const numericValue = parseFloat(priceString.replace('$', ''));
  const atomicValue = Math.floor(numericValue * Math.pow(10, decimals));
  return atomicValue.toString();
}

/**
 * Verifies an x402 payment signature
 *
 * In a production implementation, this would:
 * 1. Decode the payment payload
 * 2. Verify the signature against the public key
 * 3. Check the payment amount and recipient
 * 4. Optionally call a facilitator to verify/settle
 *
 * For this MVP, we do basic validation
 */
async function verifyPayment(
  paymentSignature: string,
  requirements: PaymentRequirements,
  facilitatorUrl: string
): Promise<{ valid: boolean; txHash?: string; error?: string }> {
  try {
    // Decode the payment payload
    const payloadJson = atob(paymentSignature);
    const payload = JSON.parse(payloadJson);

    // Basic validation
    if (payload.x402Version !== 1) {
      return { valid: false, error: 'Invalid x402 version' };
    }

    if (payload.network !== requirements.network) {
      return { valid: false, error: 'Network mismatch' };
    }

    // In production, call the facilitator to verify
    // For MVP, we accept any properly formatted payment
    // This allows testing without actual blockchain transactions

    // Simulate facilitator verification
    const response = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: requirements,
      }),
    }).catch(() => null);

    // If facilitator is available, use its response
    if (response?.ok) {
      const result = await response.json();
      return {
        valid: result.valid,
        txHash: result.txHash,
        error: result.message,
      };
    }

    // For development/testing: accept properly formatted payments
    // This allows the SDK to work without a live facilitator
    if (process.env.NODE_ENV !== 'production') {
      console.log('[x402] Development mode: accepting payment without facilitator verification');
      return {
        valid: true,
        txHash: `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      };
    }

    return { valid: false, error: 'Facilitator unavailable' };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Payment verification failed',
    };
  }
}

/**
 * Creates x402 payment middleware for Express
 *
 * This middleware:
 * 1. Checks if the request has a payment signature
 * 2. If not, returns 402 with payment requirements
 * 3. If yes, verifies the payment and allows the request to proceed
 *
 * @param payTo - Wallet address to receive payments
 * @param pricing - Map of "METHOD /path" to pricing config
 * @param facilitatorUrl - URL of the x402 facilitator
 */
export function paymentMiddleware(
  payTo: string,
  pricing: Record<string, PricingConfig>,
  facilitatorUrl: string = 'https://x402.org/facilitator'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Build the route key (e.g., "POST /v1/swap/enhanced")
    const routeKey = `${req.method} ${req.path}`;

    // Check if this route requires payment
    const config = pricing[routeKey];
    if (!config) {
      return next(); // Not a paid route
    }

    // Get the USDC address for this network
    const usdcAddress = USDC_ADDRESSES[config.network];
    if (!usdcAddress) {
      console.error(`[x402] Unknown network: ${config.network}`);
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Build payment requirements
    const requirements: PaymentRequirements = {
      x402Version: 1,
      scheme: 'exact',
      network: config.network,
      maxAmountRequired: parsePrice(config.price, 6),
      amount: parsePrice(config.price, 6),
      resource: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      description: config.description,
      mimeType: config.mimeType || 'application/json',
      payTo,
      maxTimeoutSeconds: 60,
      asset: {
        address: usdcAddress,
        decimals: 6,
        symbol: 'USDC',
      },
    };

    // Check for payment signature in headers
    const paymentSignature = req.headers['payment-signature'] ||
                             req.headers['x-payment'] as string;

    if (!paymentSignature) {
      // No payment provided - return 402 with requirements
      const requirementsBase64 = btoa(JSON.stringify(requirements));

      res.setHeader('Payment-Required', requirementsBase64);
      res.setHeader('X-Payment-Required', requirementsBase64);
      res.setHeader('Content-Type', 'application/json');

      return res.status(402).json({
        error: 'Payment Required',
        message: config.description,
        price: config.price,
        network: config.network,
      });
    }

    // Verify the payment
    const verification = await verifyPayment(
      paymentSignature as string,
      requirements,
      facilitatorUrl
    );

    if (!verification.valid) {
      return res.status(402).json({
        error: 'Payment Invalid',
        message: verification.error || 'Payment verification failed',
      });
    }

    // Payment verified - attach payment info to request and continue
    (req as any).x402Payment = {
      txHash: verification.txHash,
      amount: requirements.amount,
      payer: 'verified',
    };

    // Add payment response header
    if (verification.txHash) {
      res.setHeader('X-Payment-Response', verification.txHash);
      res.setHeader('X-Payment-TxHash', verification.txHash);
    }

    next();
  };
}

/**
 * Helper to check if request has been paid
 */
export function isPaid(req: Request): boolean {
  return !!(req as any).x402Payment;
}

/**
 * Helper to get payment info from request
 */
export function getPaymentInfo(req: Request): { txHash?: string; amount?: string; payer?: string } | null {
  return (req as any).x402Payment || null;
}
