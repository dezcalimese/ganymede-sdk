import { useState, useMemo, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useUnifiedWalletContext } from '@jup-ag/wallet-adapter';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { GanymedeClient, type SwapResult } from 'ganymede';
import {
  ArrowDown,
  ShieldCheck,
  Activity,
  ChevronDown,
  Cpu,
  MoveRight,
  Wallet,
  LogOut,
  AlertCircle
} from 'lucide-react';

// --- Mock Data & SDK Simulation ---

interface Token {
  symbol: string;
  name: string;
  mint: string;
  icon: string;
  image?: string;
  decimals: number;
  price: number;
  color: string;
}

const TOKENS: Token[] = [
  { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', icon: '◎', image: 'tokens/solana.svg', decimals: 9, price: 145.20, color: 'bg-indigo-600' },
  { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', icon: '$', image: 'tokens/usdc.svg', decimals: 6, price: 1.00, color: 'bg-blue-600' },
  { symbol: 'BONK', name: 'Bonk', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', icon: '🐕', image: 'tokens/bonk.svg', decimals: 5, price: 0.000024, color: 'bg-orange-600' },
  { symbol: 'JUP', name: 'Jupiter', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', icon: '🪐', image: 'tokens/jup.svg', decimals: 6, price: 1.12, color: 'bg-emerald-600' },
];

// Server URL - change to your deployed server for production
const GANYMEDE_SERVER_URL = import.meta.env.VITE_GANYMEDE_SERVER_URL || 'http://localhost:3001';

interface TokenSelectorProps {
  selected: Token;
  onSelect: (token: Token) => void;
  tokens: Token[];
  label: string;
}

const TokenSelector = ({ selected, onSelect, tokens, label }: TokenSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative group">
      <div className="flex justify-between mb-3">
        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">{label}</label>
      </div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 p-4 transition-all duration-300 border-l-2 border-transparent hover:border-indigo-500"
      >
        <div className="flex items-center gap-4">
          {selected.image ? (
            <img src={selected.image} alt={selected.symbol} className="w-10 h-10" />
          ) : (
            <div className={`w-10 h-10 flex items-center justify-center text-white font-bold ${selected.color} shadow-lg`}>
              {selected.icon}
            </div>
          )}
          <span className="font-light text-white text-2xl tracking-tight">{selected.symbol}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#111] border border-white/10 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {tokens.map((token) => (
            <button
              key={token.symbol}
              onClick={() => { onSelect(token); setIsOpen(false); }}
              className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors border-l-2 border-transparent hover:border-indigo-500"
            >
              {token.image ? (
                <img src={token.image} alt={token.symbol} className="w-6 h-6" />
              ) : (
                <div className={`w-6 h-6 flex items-center justify-center text-xs text-white ${token.color}`}>
                  {token.icon}
                </div>
              )}
              <div className="text-left">
                <div className="text-white font-medium tracking-wide">{token.symbol}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function GanymedeSwap() {
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const { connection } = useConnection();
  const { setShowModal } = useUnifiedWalletContext();

  const [payToken, setPayToken] = useState(TOKENS[0]);
  const [receiveToken, setReceiveToken] = useState(TOKENS[1]);
  const [amount, setAmount] = useState('1');
  const [isPremium, setIsPremium] = useState(true);
  const [swapState, setSwapState] = useState<'idle' | 'quoting' | 'success' | 'error'>('idle');
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
  const [x402Status, setX402Status] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  // Detect if we're on devnet
  const isDevnet = connection.rpcEndpoint.includes('devnet');

  // Fetch wallet balance
  useEffect(() => {
    if (!publicKey || !connection) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (err) {
        console.error('Failed to fetch balance:', err);
        setBalance(null);
      }
    };

    fetchBalance();
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  // Truncate wallet address for display
  const truncatedAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  // Create Ganymede client when wallet is connected
  const ganymedeClient = useMemo(() => {
    if (!wallet?.adapter || !connection) return null;
    return new GanymedeClient({
      wallet: wallet.adapter,
      connection,
      apiEndpoint: GANYMEDE_SERVER_URL,
      enablePremium: true,
      network: 'devnet',
    });
  }, [wallet?.adapter, connection]);

  const handleSwap = async () => {
    if (!ganymedeClient) return;

    setSwapState('quoting');
    setSwapResult(null);
    setError(null);
    setX402Status('INITIALIZING');

    try {
      // Convert amount to smallest units (lamports for SOL, etc.)
      const amountInSmallestUnit = Math.floor(
        parseFloat(amount || '0') * Math.pow(10, payToken.decimals)
      );

      if (isPremium) {
        // Show x402 flow status
        setX402Status('FETCHING QUOTE');

        const result = await ganymedeClient.getEnhancedSwap({
          inputMint: payToken.mint,
          outputMint: receiveToken.mint,
          amount: amountInSmallestUnit,
          mevProtection: true,
          optimizePriorityFee: true,
          includeAnalytics: true,
        });

        // Update status based on whether payment was made
        if (result.paymentTxHash) {
          setX402Status('PAYMENT VERIFIED');
        }

        setSwapResult(result);
        setSwapState('success');
      } else {
        // Free tier - just get quote
        const result = await ganymedeClient.buildSwap({
          inputMint: payToken.mint,
          outputMint: receiveToken.mint,
          amount: amountInSmallestUnit,
        });

        setSwapResult(result);
        setSwapState('success');
      }
    } catch (err) {
      console.error('Swap error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSwapState('error');
    }
  };

  const reset = () => {
    setSwapState('idle');
    setSwapResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#08090C] text-slate-200 font-sans selection:bg-indigo-500/30 overflow-hidden relative">

      {/* TYPOGRAPHY AS STRUCTURE */}
      <div className="absolute top-[-5vw] left-[-2vw] leading-none pointer-events-none select-none opacity-5">
        <h1 className="text-[25vw] font-bold tracking-tighter text-white">GANY</h1>
      </div>
      <div className="absolute top-[18vw] left-[15vw] leading-none pointer-events-none select-none opacity-5">
        <h1 className="text-[25vw] font-bold tracking-tighter text-white">MEDE</h1>
      </div>

      {/* ATMOSPHERE */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[10%] right-[10%] w-[40vw] h-[40vw] rounded-full bg-indigo-900/10 blur-[120px]" />
        <div className="absolute bottom-[0%] left-[0%] w-[30vw] h-[30vw] rounded-full bg-blue-900/5 blur-[100px]" />
      </div>

      {/* MAIN GRID */}
      <div className="relative z-10 w-full min-h-screen p-6 md:p-12 lg:p-20 grid lg:grid-cols-12 gap-12 lg:gap-20 items-end">

        {/* LEFT COLUMN: SWAP INTERFACE */}
        <div className="lg:col-span-5 flex flex-col justify-end">

          <div className="mb-12">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-[1px] w-12 bg-indigo-500"></div>
              <span className="text-indigo-400 font-mono text-xs tracking-widest uppercase">Ganymede</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-light text-white leading-tight tracking-tight">
              Swap with <br />
              <span className="font-bold italic">Intention.</span>
            </h2>
          </div>

          <div className="bg-[#111]/80 backdrop-blur-2xl border border-white/5 p-0 shadow-2xl relative group transition-all duration-500 hover:border-white/10">
            {/* Visual Tension: A sharp accent line */}
            <div className={`absolute top-0 left-0 w-1 h-full transition-all duration-500 ${isPremium ? 'bg-indigo-500' : 'bg-slate-700'}`} />

            <div className="p-8 space-y-8">
              {/* Input Section */}
              <div className="space-y-6">
                <div>
                  <TokenSelector label="Pay" selected={payToken} onSelect={setPayToken} tokens={TOKENS} />
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-transparent text-5xl font-light text-white outline-none placeholder-slate-700 mt-4 px-4 font-mono tracking-tighter"
                    placeholder="0.00"
                  />
                  <div className="text-xs text-slate-500 px-4 mt-2 font-mono">
                    ≈ ${(parseFloat(amount || '0') * payToken.price).toFixed(2)} USD
                  </div>
                </div>

                <div className="flex items-center justify-between px-4">
                  <div className="h-[1px] flex-1 bg-white/5"></div>
                  <button className="mx-4 p-3 bg-white/5 hover:bg-white/10 rounded-full transition-transform hover:rotate-180 border border-white/5">
                    <ArrowDown className="w-4 h-4 text-white" />
                  </button>
                  <div className="h-[1px] flex-1 bg-white/5"></div>
                </div>

                <div>
                  <TokenSelector label="Receive" selected={receiveToken} onSelect={setReceiveToken} tokens={TOKENS} />
                  <div className="mt-4 px-4 font-mono tracking-tighter text-5xl text-right">
                     {swapResult?.quote && swapState === 'success' ? (
                       <span className="text-emerald-400 animate-in fade-in slide-in-from-bottom-2 block">
                         {(parseInt(swapResult.quote.outAmount) / Math.pow(10, receiveToken.decimals)).toFixed(4)}
                       </span>
                     ) : (
                       <span className="text-slate-600">
                         {(parseFloat(amount || '0') * payToken.price / receiveToken.price).toFixed(4)}
                       </span>
                     )}
                  </div>
                </div>
              </div>

              {/* Status / Premium Indicator */}
              <div className="flex items-end justify-between border-t border-white/5 pt-6">
                <div
                  onClick={() => setIsPremium(!isPremium)}
                  className="cursor-pointer group/toggle"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`text-xs font-bold tracking-widest uppercase ${isPremium ? 'text-indigo-400' : 'text-slate-500'}`}>
                      {isPremium ? 'Premium Access' : 'Standard'}
                    </span>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${isPremium ? 'bg-indigo-900/50' : 'bg-slate-800'}`}>
                      <div className={`absolute top-1 w-2 h-2 rounded-full bg-current transition-all duration-300 ${isPremium ? 'left-5 bg-indigo-400' : 'left-1 bg-slate-500'}`} />
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-600 font-mono group-hover/toggle:text-slate-400 transition-colors">
                    x402 Micropayment: $0.005
                  </div>
                </div>

                <div className="text-right">
                  {swapState === 'quoting' && isPremium && (
                    <div className="flex flex-col items-end animate-pulse">
                      <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest mb-1">{x402Status}</span>
                      <div className="w-24 h-[2px] bg-indigo-900 overflow-hidden">
                        <div className="h-full bg-indigo-400 w-1/2 animate-shimmer" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Button */}
            {!connected ? (
              <button
                onClick={() => setShowModal(true)}
                className="w-full py-6 font-bold text-sm tracking-[0.2em] uppercase transition-all duration-300 bg-white text-black hover:bg-indigo-500 hover:text-white"
              >
                Select Wallet
              </button>
            ) : (
              <button
                onClick={swapState === 'success' ? reset : handleSwap}
                disabled={swapState === 'quoting'}
                className={`w-full py-6 font-bold text-sm tracking-[0.2em] uppercase transition-all duration-300
                  ${swapState === 'quoting'
                    ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
                    : swapState === 'success'
                      ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                      : 'bg-white text-black hover:bg-indigo-500 hover:text-white'
                  }
                `}
              >
                {swapState === 'quoting'
                  ? 'Processing x402'
                  : swapState === 'success'
                    ? 'Swap Complete'
                    : 'Execute Swap'
                }
              </button>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ANALYTICS & NARRATIVE */}
        <div className="lg:col-span-6 lg:col-start-7 flex flex-col gap-8 h-full justify-center pb-20">

          {/* Narrative Block */}
          <div className="mb-12 lg:pl-12 text-right lg:text-left self-end lg:self-auto">
            <h3 className="text-xl text-slate-400 font-light max-w-sm ml-auto lg:ml-0 leading-relaxed">
              <span className="text-white font-normal">Premium intelligence</span> hidden behind a micropayment wall.
              Pay per swap for MEV protection and route optimization.
            </h3>
          </div>

          {/* Floating Cards */}
          <div className={`space-y-6 transition-all duration-700 ${isPremium ? 'opacity-100 translate-x-0' : 'opacity-30 translate-x-10 blur-sm'}`}>

            {/* Card 1: MEV Protection */}
            <div className="lg:-ml-12 bg-gradient-to-r from-zinc-900 to-transparent border-l-2 border-emerald-500 p-6 max-w-md w-full relative overflow-hidden group">
               <div className="flex justify-between items-start mb-4 relative z-10">
                 <div>
                   <h4 className="text-white font-medium flex items-center gap-2">
                     <ShieldCheck className="w-4 h-4 text-emerald-500" />
                     MEV Protection
                   </h4>
                   <p className="text-xs text-slate-500 mt-1 font-mono">Front-running defense system</p>
                 </div>
                 {swapResult?.mevAnalysis && (
                   <span className="text-2xl font-mono text-emerald-400">
                     {swapResult.mevAnalysis.riskScore < 30 ? 'Low' : swapResult.mevAnalysis.riskScore < 60 ? 'Med' : 'High'}
                   </span>
                 )}
               </div>
               {swapResult?.mevAnalysis && (
                 <p className="text-xs text-slate-400 font-mono">{swapResult.mevAnalysis.recommendation}</p>
               )}
               <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-emerald-500/10 transition-colors" />
            </div>

            {/* Card 2: Priority Fee */}
            <div className="lg:ml-auto bg-gradient-to-l from-zinc-900 to-transparent border-r-2 border-amber-500 p-6 max-w-md w-full text-right relative overflow-hidden group">
               <div className="flex justify-end items-start mb-4 relative z-10 gap-4">
                 {swapResult?.recommendedPriorityFee && (
                   <div className="text-right">
                     <span className="text-2xl font-mono text-amber-400 block">{swapResult.recommendedPriorityFee.tier}</span>
                     <span className="text-xs text-green-500 font-mono">${swapResult.recommendedPriorityFee.costInUsd.toFixed(4)}</span>
                   </div>
                 )}
                 <div className="text-right">
                   <h4 className="text-white font-medium flex items-center justify-end gap-2">
                     Priority Fee
                     <Activity className="w-4 h-4 text-amber-500" />
                   </h4>
                   <p className="text-xs text-slate-500 mt-1 font-mono">Dynamic fee optimization</p>
                 </div>
               </div>
               {swapResult?.recommendedPriorityFee && (
                 <p className="text-xs text-slate-400 font-mono text-right">{swapResult.recommendedPriorityFee.estimatedLandingTime}</p>
               )}
               <div className="absolute left-0 bottom-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -ml-10 -mb-10 group-hover:bg-amber-500/10 transition-colors" />
            </div>

            {/* Card 3: Route Analytics */}
            <div className="lg:-ml-8 bg-gradient-to-r from-zinc-900 to-transparent border-l-2 border-cyan-500 p-6 max-w-md w-full relative overflow-hidden group">
               <div className="flex justify-between items-start mb-4 relative z-10">
                 <div>
                   <h4 className="text-white font-medium flex items-center gap-2">
                     <Cpu className="w-4 h-4 text-cyan-500" />
                     Route Analytics
                   </h4>
                   <p className="text-xs text-slate-500 mt-1 font-mono">
                     {swapResult?.routeAnalytics
                       ? `${swapResult.routeAnalytics.summary.totalHops} hops via ${swapResult.routeAnalytics.summary.dexesUsed.join(', ')}`
                       : 'Multi-hop pathway logic'
                     }
                   </p>
                 </div>
               </div>
                {swapResult?.routeAnalytics ? (
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-2 flex-wrap">
                    {swapResult.routeAnalytics.breakdown.map((step: { dex: string }, i: number) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <MoveRight className="w-3 h-3 text-cyan-500" />}
                        <span className={i === 0 || i === swapResult.routeAnalytics!.breakdown.length - 1 ? 'text-white' : ''}>
                          {step.dex}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-2">
                     <span className="text-white">{payToken.symbol}</span>
                     <MoveRight className="w-3 h-3 text-cyan-500" />
                     <span>DEX</span>
                     <MoveRight className="w-3 h-3 text-cyan-500" />
                     <span className="text-white">{receiveToken.symbol}</span>
                  </div>
                )}
            </div>

            {/* Error display */}
            {swapState === 'error' && error && (
              <div className="lg:-ml-12 bg-gradient-to-r from-red-900/50 to-transparent border-l-2 border-red-500 p-6 max-w-md w-full">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-white font-medium">Error</h4>
                    <p className="text-xs text-red-400 font-mono mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Connect Wallet */}
          <div className="absolute top-10 right-10">
            {connected ? (
              <div className="flex items-center gap-3">
                {isDevnet && (
                  <div className="px-2 py-1 bg-amber-500/20 border border-amber-500/50 text-amber-400 font-mono text-[10px] tracking-widest uppercase">
                    Devnet
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 text-white font-mono text-xs tracking-widest">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>{truncatedAddress}</span>
                  {balance !== null && (
                    <span className="text-slate-400 border-l border-white/10 pl-3">
                      {balance.toFixed(4)} SOL
                    </span>
                  )}
                </div>
                <button
                  onClick={() => disconnect()}
                  className="p-3 bg-transparent border border-white/20 hover:border-red-500 hover:bg-red-500/10 text-white transition-all"
                  title="Disconnect"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-3 px-6 py-3 bg-transparent border border-white/20 hover:border-white text-white font-mono text-xs tracking-widest uppercase transition-all"
              >
                <Wallet className="w-4 h-4" />
                Connect
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
