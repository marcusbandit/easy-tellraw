import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
