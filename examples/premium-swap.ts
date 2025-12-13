/**
 * Premium Swap Example - Paid Tier ($0.005/swap)
 *
 * This example demonstrates Ganymede's premium features:
 * - MEV Protection Analysis
 * - Priority Fee Optimization
 * - Route Analytics
 *
 * Premium features require an x402 micropayment of $0.005 USDC
 */

import { GanymedeClient, TOKENS } from 'ganymede';
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';

// Mock wallet adapter for demonstration
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
    const nacl = await import('tweetnacl');
    return nacl.sign.detached(message, this.keypair.secretKey);
  }
}

async function main() {
  console.log('=== Ganymede Premium Swap Example ===\n');
  console.log('Premium features cost $0.005 USDC per swap via x402 micropayments\n');

  // Setup
  const keypair = Keypair.generate();
  const wallet = new MockWalletAdapter(keypair) as any;
  const connection = new Connection(clusterApiUrl('devnet'));

  console.log('Wallet:', keypair.publicKey.toBase58());
  console.log('Network: Devnet\n');

  // Initialize with premium features enabled
  const client = new GanymedeClient({
    wallet,
    connection,
    apiEndpoint: 'http://localhost:3001', // Local dev server
    enablePremium: true,
    maxPaymentPerSwap: 0.01, // Safety limit: max $0.01 per swap
    network: 'devnet',
  });

  try {
    console.log('Requesting enhanced swap with ALL premium features:');
    console.log('  ✓ MEV Protection Analysis');
    console.log('  ✓ Priority Fee Optimization');
    console.log('  ✓ Route Analytics\n');

    // Get enhanced swap with all premium features
    // This triggers a $0.005 x402 micropayment
    const result = await client.getEnhancedSwap({
      inputMint: TOKENS.SOL,
      outputMint: TOKENS.USDC,
      amount: 1_000_000_000, // 1 SOL
      slippageBps: 50,
      // Premium features
      mevProtection: true,
      optimizePriorityFee: true,
      includeAnalytics: true,
    });

    // Display results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                    PREMIUM SWAP RESULT');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Quote info
    console.log('📊 Quote:');
    console.log(`   Input:  ${parseInt(result.quote.inAmount) / 1e9} SOL`);
    console.log(`   Output: ${parseInt(result.quote.outAmount) / 1e6} USDC`);
    console.log(`   Price Impact: ${result.quote.priceImpactPct}%`);

    // Payment confirmation
    if (result.paymentTxHash) {
      console.log(`\n💰 Payment: ${result.paymentTxHash.slice(0, 20)}...`);
    }

    // MEV Analysis
    if (result.mevAnalysis) {
      console.log('\n🛡️  MEV Analysis:');
      console.log(`   Risk Score: ${result.mevAnalysis.riskScore}/100`);
      console.log(`   Protection Needed: ${result.mevAnalysis.shouldUseMevProtection ? 'YES' : 'No'}`);
      console.log(`   Est. MEV Cost: $${result.mevAnalysis.estimatedMevCost.toFixed(4)}`);
      console.log(`   Recommendation: ${result.mevAnalysis.recommendation}`);
      console.log('   Factors:');
      console.log(`     • Pool Liquidity: ${result.mevAnalysis.factors.poolLiquidity}`);
      console.log(`     • Trade Size: ${result.mevAnalysis.factors.tradeSize}`);
      console.log(`     • Token Volatility: ${result.mevAnalysis.factors.tokenVolatility}`);
      console.log(`     • Recent MEV Activity: ${result.mevAnalysis.factors.recentMevActivity ? 'Yes' : 'No'}`);
    }

    // Priority Fee
    if (result.recommendedPriorityFee) {
      console.log('\n⚡ Priority Fee Recommendation:');
      console.log(`   Fee: ${result.recommendedPriorityFee.microLamports.toLocaleString()} microLamports`);
      console.log(`   Tier: ${result.recommendedPriorityFee.tier.toUpperCase()}`);
      console.log(`   Est. Landing Time: ${result.recommendedPriorityFee.estimatedLandingTime}`);
      console.log(`   Cost: ${result.recommendedPriorityFee.costInSol} SOL ($${result.recommendedPriorityFee.costInUsd.toFixed(4)})`);
      console.log(`   Network Congestion: ${result.recommendedPriorityFee.networkCongestion}`);
      console.log('   Fee Percentiles:');
      console.log(`     • p25: ${result.recommendedPriorityFee.recentFeePercentiles.p25}`);
      console.log(`     • p50: ${result.recommendedPriorityFee.recentFeePercentiles.p50}`);
      console.log(`     • p75: ${result.recommendedPriorityFee.recentFeePercentiles.p75}`);
      console.log(`     • p95: ${result.recommendedPriorityFee.recentFeePercentiles.p95}`);
    }

    // Route Analytics
    if (result.routeAnalytics) {
      console.log('\n📈 Route Analytics:');
      console.log(`   Total Hops: ${result.routeAnalytics.summary.totalHops}`);
      console.log(`   DEXes Used: ${result.routeAnalytics.summary.dexesUsed.join(', ')}`);
      console.log(`   Est. Gas Cost: ${result.routeAnalytics.summary.estimatedGasCost} lamports`);
      console.log(`   Price Impact: ${result.routeAnalytics.summary.priceImpact}%`);

      if (result.routeAnalytics.warnings.length > 0) {
        console.log('   ⚠️  Warnings:');
        result.routeAnalytics.warnings.forEach(w => console.log(`      • ${w}`));
      }

      if (result.routeAnalytics.optimizationSuggestions.length > 0) {
        console.log('   💡 Suggestions:');
        result.routeAnalytics.optimizationSuggestions.forEach(s => console.log(`      • ${s}`));
      }

      if (result.routeAnalytics.breakdown.length > 0) {
        console.log('   Route Breakdown:');
        result.routeAnalytics.breakdown.forEach((hop, i) => {
          console.log(`     ${i + 1}. ${hop.dex}: ${hop.inputToken.slice(0, 8)}... → ${hop.outputToken.slice(0, 8)}...`);
        });
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Premium swap analysis completed!');
    console.log('═══════════════════════════════════════════════════════════\n');

    // In production, execute the swap:
    // const txid = await client.executeSwap(result);
    // console.log('Transaction:', txid);

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('402') || error.message.includes('Payment')) {
        console.error('\n❌ Payment required or failed');
        console.error('Make sure:');
        console.error('  1. The Ganymede server is running (pnpm dev:server)');
        console.error('  2. Your wallet has devnet USDC');
        console.error('  3. maxPaymentPerSwap is set high enough');
      } else {
        console.error('Error:', error.message);
      }
    } else {
      console.error('Error:', error);
    }
  }
}

main().catch(console.error);
