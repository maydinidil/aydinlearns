// web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startTheme } from './lib/theme.ts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

// The head script in index.html set the theme before first paint; this keeps it, and follows Windows while the choice is Follow Windows (S9-18).
startTheme(document.documentElement);
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
