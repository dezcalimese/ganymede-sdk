import type { WalletAdapter } from '@solana/wallet-adapter-base';
import { GanymedeError, GanymedeErrorCode } from '../types.js';

/**
 * Extended wallet interface with optional signing methods
 */
interface ExtendedWallet {
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
  signTransaction?<T>(transaction: T): Promise<T>;
}

/**
 * Wallet connection state check
 */
export interface WalletConnectionState {
  connected: boolean;
  publicKeyAvailable: boolean;
  canSignTransaction: boolean;
  canSignMessage: boolean;
}

/**
 * Gets comprehensive wallet connection state
 */
export function getWalletConnectionState(wallet: WalletAdapter): WalletConnectionState {
  const extWallet = wallet as unknown as ExtendedWallet;

  return {
    connected: wallet.connected,
    publicKeyAvailable: wallet.publicKey !== null,
    canSignTransaction: typeof extWallet.signTransaction === 'function',
    canSignMessage: typeof extWallet.signMessage === 'function',
  };
}

/**
 * Validates that a wallet is properly connected and ready for use
 */
export function validateWallet(wallet: WalletAdapter): void {
  if (!wallet.connected) {
    throw new GanymedeError(
      GanymedeErrorCode.WALLET_NOT_CONNECTED,
      'Wallet is not connected. Please connect your wallet first.'
    );
  }

  if (!wallet.publicKey) {
    throw new GanymedeError(
      GanymedeErrorCode.WALLET_NOT_CONNECTED,
      'Wallet public key is not available.'
    );
  }
}

/**
 * Validates that a wallet supports transaction signing
 */
export function validateWalletForTransaction(wallet: WalletAdapter): void {
  validateWallet(wallet);

  const extWallet = wallet as unknown as ExtendedWallet;
  if (typeof extWallet.signTransaction !== 'function') {
    throw new GanymedeError(
      GanymedeErrorCode.WALLET_SIGNING_FAILED,
      'Wallet does not support transaction signing required for swaps.'
    );
  }
}

/**
 * Validates that a wallet supports message signing (required for x402 payments)
 */
export function validateWalletForPayment(wallet: WalletAdapter): void {
  validateWallet(wallet);

  const extWallet = wallet as unknown as ExtendedWallet;
  if (typeof extWallet.signMessage !== 'function') {
    throw new GanymedeError(
      GanymedeErrorCode.WALLET_SIGNING_FAILED,
      'Wallet does not support message signing required for x402 payments.'
    );
  }
}

/**
 * Checks if wallet supports message signing (required for x402 payments)
 */
export function supportsMessageSigning(wallet: WalletAdapter): boolean {
  const extWallet = wallet as unknown as ExtendedWallet;
  return typeof extWallet.signMessage === 'function';
}

/**
 * Checks if wallet supports transaction signing
 */
export function supportsTransactionSigning(wallet: WalletAdapter): boolean {
  const extWallet = wallet as unknown as ExtendedWallet;
  return typeof extWallet.signTransaction === 'function';
}

/**
 * Gets the wallet's public key as a base58 string
 */
export function getWalletAddress(wallet: WalletAdapter): string {
  validateWallet(wallet);
  return wallet.publicKey!.toBase58();
}

/**
 * Gets the wallet's public key as a Uint8Array
 */
export function getWalletPublicKeyBytes(wallet: WalletAdapter): Uint8Array {
  validateWallet(wallet);
  return wallet.publicKey!.toBytes();
}

/**
 * Creates a unique wallet identifier for logging/analytics
 */
export function getWalletIdentifier(wallet: WalletAdapter): string {
  if (!wallet.publicKey) {
    return 'unknown';
  }
  const address = wallet.publicKey.toBase58();
  // Return truncated address for privacy in logs
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
