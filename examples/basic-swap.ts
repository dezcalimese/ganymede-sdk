/**
 * Basic Swap Example - Free Tier
 *
 * This example demonstrates how to use Ganymede's free tier
 * for basic Jupiter swaps without any premium features.
 */

import { GanymedeClient, TOKENS } from 'ganymede';
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';

// Mock wallet adapter for demonstration
// In a real app, you'd use @solana/wallet-adapter-react
class MockWalletAdapter {
  private keypair: Keypair;

  constructor(keypair: Keypair) {
    this.keypair = keypair;
  }

  get publicKey() {
    return this.keypair.publicKey;
  }

  get connected() {
    return true;
  }

  async signTransaction(tx: any) {
    tx.sign([this.keypair]);
    return tx;
  }

  async signMessage(message: Uint8Array) {
    // In a real wallet, this would prompt the user
    const nacl = await import('tweetnacl');
    return nacl.sign.detached(message, this.keypair.secretKey);
  }
}

async function main() {
  console.log('=== Ganymede Basic Swap Example ===\n');

  // Setup - In production, use a real wallet adapter
  // WARNING: Never use hardcoded private keys in production!
  const keypair = Keypair.generate(); // Demo keypair (will have no funds)
  const wallet = new MockWalletAdapter(keypair) as any;
  const connection = new Connection(clusterApiUrl('devnet'));

  console.log('Wallet:', keypair.publicKey.toBase58());
  console.log('Network: Devnet\n');

  // Initialize the Ganymede client
  const client = new GanymedeClient({
    wallet,
    connection,
    enablePremium: false, // Disable premium for free tier
    network: 'devnet',
  });

  try {
    // Get a quote for swapping 0.1 SOL to USDC
    console.log('Getting quote for 0.1 SOL → USDC...\n');

    const quote = await client.getQuote({
      inputMint: TOKENS.SOL,
      outputMint: TOKENS.USDC,
      amount: 100_000_000, // 0.1 SOL in lamports
      slippageBps: 50, // 0.5% slippage
    });

    console.log('Quote received:');
    console.log('  Input:', parseInt(quote.inAmount) / 1e9, 'SOL');
    console.log('  Output:', parseInt(quote.outAmount) / 1e6, 'USDC');
    console.log('  Price Impact:', quote.priceImpactPct, '%');
    console.log('  Route hops:', quote.routePlan?.length || 1);

    // Build the swap transaction
    console.log('\nBuilding swap transaction...');

    const result = await client.buildSwap({
      inputMint: TOKENS.SOL,
      outputMint: TOKENS.USDC,
      amount: 100_000_000,
      slippageBps: 50,
    });

    console.log('Transaction built successfully!');
    console.log('  Transaction size:', result.transaction.serialize().length, 'bytes');

    // In a real app, you would execute the swap:
    // const txid = await client.executeSwap(result);
    // console.log('Transaction:', txid);

    console.log('\n✅ Basic swap example completed!');
    console.log('Note: Transaction not executed (demo keypair has no funds)');

  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
