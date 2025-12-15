import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { UnifiedWalletProvider } from '@jup-ag/wallet-adapter';

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  // Use devnet for demo, switch to mainnet-beta for production
  const endpoint = useMemo(() => 'https://api.devnet.solana.com', []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <UnifiedWalletProvider
        wallets={[]}
        config={{
          autoConnect: false,
          env: 'devnet',
          metadata: {
            name: 'Ganymede',
            description: 'Premium Swap Intelligence',
            url: 'https://ganymede.dev',
            iconUrls: ['/ganymede.svg'],
          },
          theme: 'dark',
        }}
      >
        {children}
      </UnifiedWalletProvider>
    </ConnectionProvider>
  );
}
