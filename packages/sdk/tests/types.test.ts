import { describe, it, expect } from 'vitest';
import { GanymedeError, GanymedeErrorCode } from '../src/types.js';

describe('GanymedeError', () => {
  it('should create an error with code and message', () => {
    const error = new GanymedeError(
      GanymedeErrorCode.WALLET_NOT_CONNECTED,
      'Wallet is not connected'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GanymedeError);
    expect(error.code).toBe(GanymedeErrorCode.WALLET_NOT_CONNECTED);
    expect(error.message).toBe('Wallet is not connected');
    expect(error.name).toBe('GanymedeError');
  });

  it('should create an error with cause', () => {
    const originalError = new Error('Original error');
    const error = new GanymedeError(
      GanymedeErrorCode.NETWORK_ERROR,
      'Network request failed',
      originalError
    );

    expect(error.code).toBe(GanymedeErrorCode.NETWORK_ERROR);
    expect(error.cause).toBe(originalError);
  });

  it('should have all expected error codes', () => {
    expect(GanymedeErrorCode.WALLET_NOT_CONNECTED).toBe('WALLET_NOT_CONNECTED');
    expect(GanymedeErrorCode.WALLET_SIGNING_FAILED).toBe('WALLET_SIGNING_FAILED');
    expect(GanymedeErrorCode.PAYMENT_DECLINED).toBe('PAYMENT_DECLINED');
    expect(GanymedeErrorCode.PAYMENT_EXCEEDED_LIMIT).toBe('PAYMENT_EXCEEDED_LIMIT');
    expect(GanymedeErrorCode.QUOTE_FAILED).toBe('QUOTE_FAILED');
    expect(GanymedeErrorCode.SWAP_FAILED).toBe('SWAP_FAILED');
    expect(GanymedeErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(GanymedeErrorCode.INVALID_PARAMS).toBe('INVALID_PARAMS');
  });
});
