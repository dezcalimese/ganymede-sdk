import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  validateWallet,
  getWalletAddress,
  supportsMessageSigning,
  supportsTransactionSigning,
} from '../src/utils/wallet.js';
import { GanymedeError, GanymedeErrorCode } from '../src/types.js';

// Mock wallet factory
function createMockWallet(options: {
  connected?: boolean;
  publicKey?: PublicKey | null;
  signMessage?: boolean;
  signTransaction?: boolean;
}) {
  return {
    connected: options.connected ?? true,
    publicKey: options.publicKey === null
      ? null
      : (options.publicKey ?? new PublicKey('11111111111111111111111111111111')),
    signMessage: options.signMessage ? async (msg: Uint8Array) => msg : undefined,
    signTransaction: options.signTransaction ? async <T>(tx: T) => tx : undefined,
    sendTransaction: async () => 'txid',
  } as any;
}

describe('validateWallet', () => {
  it('should pass for connected wallet with public key', () => {
    const wallet = createMockWallet({ connected: true });
    expect(() => validateWallet(wallet)).not.toThrow();
  });

  it('should throw for disconnected wallet', () => {
    const wallet = createMockWallet({ connected: false });

    expect(() => validateWallet(wallet)).toThrow(GanymedeError);
    try {
      validateWallet(wallet);
    } catch (error) {
      expect((error as GanymedeError).code).toBe(GanymedeErrorCode.WALLET_NOT_CONNECTED);
    }
  });

  it('should throw for wallet without public key', () => {
    const wallet = createMockWallet({ connected: true, publicKey: null });

    expect(() => validateWallet(wallet)).toThrow(GanymedeError);
    try {
      validateWallet(wallet);
    } catch (error) {
      expect((error as GanymedeError).code).toBe(GanymedeErrorCode.WALLET_NOT_CONNECTED);
    }
  });
});

describe('getWalletAddress', () => {
  it('should return the wallet address as base58 string', () => {
    const pubkey = new PublicKey('So11111111111111111111111111111111111111112');
    const wallet = createMockWallet({ publicKey: pubkey });

    const address = getWalletAddress(wallet);
    expect(address).toBe('So11111111111111111111111111111111111111112');
  });

  it('should throw for invalid wallet', () => {
    const wallet = createMockWallet({ connected: false });
    expect(() => getWalletAddress(wallet)).toThrow(GanymedeError);
  });
});

describe('supportsMessageSigning', () => {
  it('should return true for wallet with signMessage', () => {
    const wallet = createMockWallet({ signMessage: true });
    expect(supportsMessageSigning(wallet)).toBe(true);
  });

  it('should return false for wallet without signMessage', () => {
    const wallet = createMockWallet({ signMessage: false });
    expect(supportsMessageSigning(wallet)).toBe(false);
  });
});

describe('supportsTransactionSigning', () => {
  it('should return true for wallet with signTransaction', () => {
    const wallet = createMockWallet({ signTransaction: true });
    expect(supportsTransactionSigning(wallet)).toBe(true);
  });

  it('should return false for wallet without signTransaction', () => {
    const wallet = createMockWallet({ signTransaction: false });
    expect(supportsTransactionSigning(wallet)).toBe(false);
  });
});
