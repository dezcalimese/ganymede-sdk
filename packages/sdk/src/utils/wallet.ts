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
