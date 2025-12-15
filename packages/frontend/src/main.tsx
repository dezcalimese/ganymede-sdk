import { createRoot } from 'react-dom/client';
import './index.css';
import { ErrorBoundary } from './ErrorBoundary';
import { WalletProvider } from './WalletProvider';
import GanymedeSwap from './GanymedeSwap';

// Note: StrictMode disabled for wallet adapter compatibility
// React 18 StrictMode double-mounts components in dev, which breaks wallet state
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <WalletProvider>
      <GanymedeSwap />
    </WalletProvider>
  </ErrorBoundary>,
);
