import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import './index.css';

import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="protrack-kaizen-theme">
      <BrowserRouter>
        <App />
        <Toaster richColors closeButton />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
