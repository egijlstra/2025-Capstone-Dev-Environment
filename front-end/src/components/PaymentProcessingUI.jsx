// src/components/PaymentProcessingUI.jsx
import { useEffect, useState } from 'react';
import { getNextOrder, postAuthorize } from '../lib/api.js';

function resolveOutcome(resp) {
  if (!resp || typeof resp !== 'object') return 'SERVER_ERROR';
  if (resp.outcome) return String(resp.outcome);
  if (resp.authorization?.outcome) return String(resp.authorization.outcome);
  if (resp.code) return String(resp.code);
  return 'SUCCESS';
}

// --- Card type detection (Visa / Mastercard / AmEx) ---
function detectCardType(input) {
  const n = String(input || '').replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  // MasterCard: 51–55 or 2221–2720
  if (/^(5[1-5]|2(2[2-9]|[3-6][0-9]|7[01]|720))/.test(n)) return 'Mastercard';
  // American Express: 34 or 37
  if (/^3[47]/.test(n)) return 'American Express';
  return null; // unknown/other
}

// --- Expiry auto-format (MM/YY) ---
function fmtExpiry(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4); // max 4 digits (MMYY)
  if (digits.length <= 2) return digits; // "M", "MM"
  return `${digits.slice(0, 2)}/${digits.slice(2)}`; // "MM/YY"
}

// --- Expiry must be in the future (MM/YY) ---
function isFutureExpiry(mmYY) {
  const m = (mmYY || '').match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const [, mm, yy] = m;
  const month = Number(mm);
  if (month < 1 || month > 12) return false;
  const year = 2000 + Number(yy); // interpret YY as 20YY
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  return endOfMonth >= new Date();
}

/** ---------- Card number formatting helpers ---------- **/
function getCardFormat(type) {
  switch (type) {
    case 'American Express':
      return { max: 15, groups: [4, 6, 5] };
    case 'Mastercard':
    case 'Visa':
    default:
      return { max: 16, groups: [4, 4, 4, 4] };
  }
}

function formatWithGroups(digits, groups) {
  let out = '';
  let idx = 0;
  for (let i = 0; i < groups.length; i++) {
    const size = groups[i];
    const chunk = digits.slice(idx, idx + size);
    if (!chunk) break;
    if (out) out += ' ';
    out += chunk;
    idx += size;
  }
  return out;
}

function formatCardNumberForType(input, type) {
  const digits = String(input || '').replace(/\D/g, '');
  const { max, groups } = getCardFormat(type);
  const trimmed = digits.slice(0, max);
  return formatWithGroups(trimmed, groups);
}

export default function PaymentProcessingUI() {
  const [loadingInit, setLoadingInit] = useState(true);
  const [errorInit, setErrorInit] = useState(null);

  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState(0);

  // Card form fields
  const [nameOnCard, setNameOnCard] = useState('');
  const [cardNumber, setCardNumber] = useState(''); // formatted value shown to user
  const [cardType, setCardType] = useState(null);   // detected type
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Right-panel: this-session activity only (no backend changes)
  const [sessionTxns, setSessionTxns] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { orderId, amount } = await getNextOrder();
        if (!mounted) return;
        setOrderId(orderId);
        setAmount(amount);
        setLoadingInit(false);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setErrorInit('Failed to initialize checkout.');
        setLoadingInit(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const appendSessionTxn = (entry) =>
    setSessionTxns((prev) => [{ id: crypto.randomUUID(), ...entry }, ...prev].slice(0, 8));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    setResult(null);

    // Client-side expiry check (FR requirement)
    if (!isFutureExpiry(expiry)) {
      setErrorMsg('Card is expired. Please check the expiry date (MM/YY).');
      setSubmitting(false);
      return;
    }

    try {
      // Build payload; sanitize PAN back to digits
      const payload = {
        orderId,
        amount,
        cardNumber: String(cardNumber).replace(/\D/g, ''), // sanitize
        cvv,
        nameOnCard,
        expiry,
        // aliases some backends expect
        cardName: nameOnCard,
        expiryDate: expiry,
      };

      const resp = await postAuthorize(payload);
      setResult(resp);

      const outcome = resolveOutcome(resp);
      appendSessionTxn({
        orderId,
        amount,
        outcome,
        when: new Date().toISOString(),
      });

      // prepare next order
      try {
        const next = await getNextOrder();
        setOrderId(next.orderId);
        setAmount(next.amount);
      } catch {}
    } catch (err) {
      console.error(err);
      setErrorMsg('Authorization failed. Please check details or try again.');

      const outcome =
        err?.response?.data?.code ||
        err?.code ||
        'SERVER_ERROR';
      appendSessionTxn({
        orderId,
        amount,
        outcome: String(outcome),
        when: new Date().toISOString(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInit) {
    return (
      <div className="container py-4">
        <div className="alert alert-info mb-0">Preparing checkout…</div>
      </div>
    );
  }

  if (errorInit) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger mb-3">{errorInit}</div>
        <button className="btn btn-outline-light" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  const outcomeBadgeClass = (o) => {
    const s = String(o || '').toUpperCase();
    if (s.includes('SUCCESS') || s.includes('AUTHORIZED')) return 'badge bg-success';
    if (s.includes('INSUFFICIENT')) return 'badge bg-warning';
    if (s.includes('INCORRECT') || s.includes('ERROR') || s.includes('SERVER')) return 'badge bg-danger';
    return 'badge bg-secondary';
  };

  const fmtMoney = (n) => `$${Number(n ?? 0).toFixed(2)}`;
  const fmtTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  // --- Reactive card number formatting & detection ---
  const onCardNumberChange = (e) => {
    const raw = e.target.value;
    // First, detect based on digits (so length rules apply correctly)
    const detected = detectCardType(raw);
    setCardType(detected);
    // Then format for that brand
    const formatted = formatCardNumberForType(raw, detected);
    setCardNumber(formatted);
  };

  const onCardNumberPaste = (e) => {
    // Normalize pasted content into our formatting immediately
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const detected = detectCardType(text);
    setCardType(detected);
    const formatted = formatCardNumberForType(text, detected);
    e.preventDefault();
    setCardNumber(formatted);
  };

  const onExpiryChange = (e) => {
    setExpiry(fmtExpiry(e.target.value));
  };

  return (
    <div className="container py-4">
      <h3 className="mb-3 text-on-dark">Checkout</h3>

      <div className="row g-4">
        {/* LEFT: Payment Form */}
        <div className="col-lg-8">
          <form onSubmit={handleSubmit} className="card portal-card shadow-sm">
            <div className="card-body">
              <div className="row g-3">
                {/* Order ID (disabled input to preserve original layout) */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Order ID</label>
                  <input
                    type="text"
                    className="form-control"
                    value={orderId}
                    disabled
                    aria-readonly="true"
                  />
                </div>

                {/* Amount (disabled input to preserve original layout) */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Amount</label>
                  <div className="input-group">
                    <span className="input-group-text">$</span>
                    <input
                      type="text"
                      className="form-control"
                      value={amount.toFixed(2)}
                      disabled
                      aria-readonly="true"
                    />
                  </div>
                </div>

                {/* Name on Card */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Name on Card</label>
                  <input
                    type="text"
                    className="form-control"
                    value={nameOnCard}
                    onChange={(e) => setNameOnCard(e.target.value)}
                    required
                    placeholder=""
                    autoComplete="cc-name"
                  />
                </div>

                {/* Card Number + detected brand badge */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom d-flex align-items-center justify-content-between">
                    <span>Card Number</span>
                    <span className="small" style={{ opacity: 0.9 }}>
                      {cardType && <span className="badge bg-secondary">{cardType}</span>}
                    </span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={cardNumber}
                    onChange={onCardNumberChange}
                    onPaste={onCardNumberPaste}
                    required
                    inputMode="numeric"
                    placeholder=""
                    autoComplete="cc-number"
                  />
                </div>

                {/* Expiry (auto MM/YY formatting) */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Expiry (MM/YY)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={expiry}
                    onChange={onExpiryChange}
                    required
                    placeholder="MM/YY"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                  />
                </div>

                {/* CVV */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom">CVV</label>
                  <input
                    type="password"
                    className="form-control"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    required
                    inputMode="numeric"
                    placeholder=""
                    autoComplete="cc-csc"
                  />
                </div>
              </div>
            </div>

            <div className="card-footer d-flex gap-2">
              <button type="submit" className="btn btn-primary btn-process-payment" disabled={submitting}>
                {submitting ? 'Authorizing…' : 'Pay Now'}
              </button>
              {errorMsg && <div className="text-danger align-self-center">{errorMsg}</div>}
            </div>
          </form>

          {/* Optional: raw result (kept for debugging; remove if you want it cleaner) */}
          {result && (
            <div className="alert alert-success mt-3 alert-custom success">
              <strong>Authorization complete.</strong>
              <pre className="mb-0 mt-2" style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* RIGHT: This Session panel */}
        <div className="col-lg-4">
          <div className="card portal-card shadow-sm">
            <div className="card-body">
              <h5 className="mb-3">This Session</h5>

              {sessionTxns.length === 0 ? (
                <div className="text-muted" style={{ opacity: 0.8 }}>
                  No attempts yet.
                </div>
              ) : (
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {sessionTxns.map((t) => (
                    <div
                      key={t.id}
                      className="mb-3 p-3"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 6,
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="fw-semibold">{t.orderId}</div>
                          <div className="text-muted small">{fmtTime(t.when)}</div>
                        </div>
                        <span className={outcomeBadgeClass(t.outcome)}>{t.outcome}</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-muted me-2">Amount:</span>
                        <span className="fw-semibold">{fmtMoney(t.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
