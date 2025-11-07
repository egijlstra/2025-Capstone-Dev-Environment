// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';

// Load Bootstrap once for entire app
import 'bootstrap/dist/css/bootstrap.min.css';
// Load Mariah's global theme
import './styles/mariah-theme.css';

import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
