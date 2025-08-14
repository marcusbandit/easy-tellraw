import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import '@radix-ui/themes/styles.css';
import { Theme } from '@radix-ui/themes';
import { syntaxColors } from './syntaxColors';

// Inject syntax highlighting colors as CSS variables
Object.entries(syntaxColors).forEach(([name, color]) => {
  document.documentElement.style.setProperty(`--syntax-${name}`, color as string);
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <Theme appearance="dark">
      <App />
    </Theme>
  </React.StrictMode>
);

// Removed web-vitals reporting in production to reduce bundle size
