// src/App.jsx
import React, { useState } from 'react';
import WarehouseSettlement from './components/WarehouseSettlement.jsx';
import PaymentProcessingUI from './components/PaymentProcessingUI.jsx';

export default function App() {
  const [view, setView] = useState('checkout'); // 'checkout' | 'warehouse'

  return (
    <div>
      {/* Global top bar shared look */}
      <div className="top-bar">
        <div className="container-fluid px-4 d-flex justify-content-between align-items-center">
          <div className="brand-container">
            <div className="brand-icon-box" />
            <div>
              <h1 className="brand-title">Manhattan Associates</h1>
              <p className="brand-subtitle">Supply Chain Commerce Platform</p>
            </div>
          </div>
          <div className="btn-group" role="group" aria-label="Views">
            <button
              className={`btn ${view === 'checkout' ? 'btn-dark' : 'btn-outline-dark'}`}
              onClick={() => setView('checkout')}
            >
              Checkout (Authorize)
            </button>
            <button
              className={`btn ${view === 'warehouse' ? 'btn-dark' : 'btn-outline-dark'}`}
              onClick={() => setView('warehouse')}
            >
              Warehouse Settlement
            </button>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="content-container">
          {view === 'checkout' ? <PaymentProcessingUI /> : <WarehouseSettlement />}
        </div>
      </div>
    </div>
  );
}
