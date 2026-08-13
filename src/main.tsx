import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../design-system/presets/clean.css';
import '../../design-system/index.css';
import './styles/seder.css';
import './styles/mobile.css';
import App from './App';
import { applyUrlOverrides } from './lib/urlState';

// URL params (?theme=dark&lang=he&view=board&cardstyle=tint) override stored
// prefs — this is what makes every state screenshot-addressable for review.
applyUrlOverrides();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
