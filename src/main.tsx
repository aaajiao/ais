import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient } from './lib/queryClient';
import { createIDBPersister } from './lib/indexedDBPersister';
import './locales'; // Initialize i18n
import './index.css';
import App from './App.tsx';

const persister = createIDBPersister();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 小时
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>
);
