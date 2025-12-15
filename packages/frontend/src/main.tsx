import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import GanymedeSwap from './GanymedeSwap';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GanymedeSwap />
  </StrictMode>,
);
