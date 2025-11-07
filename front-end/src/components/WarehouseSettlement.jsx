// src/components/WarehouseSettlement.jsx
import { useMemo, useState } from 'react';
import { postSettlement, getOrderDetails } from '../lib/api.js';

export default function WarehouseSettlement() {
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [details, setDetails] = useState(null);

  const toMoney = (n) => Number(Number(n).toFixed(2));

  const isValidAmountForInput = useMemo(() => {
    if (!orderId.trim()) return false;
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return false;
    return Math.round(num * 100) === num * 100;
  }, [orderId, amount]);

  const normalizeDetails = (resp) => (resp && resp.data ? resp.data : resp);

  const fetchDetails = async (id) => {
    setDetailsLoading(true);
    try {
      const resp = await getOrderDetails(id.trim());
      const normalized = normalizeDetails(resp);

      if (!normalized || !normalized.order) {
        setDetails(null);
        setMsg({ type: 'danger', text: 'Order not found.' });
      } else {
        setDetails(normalized);
        // NOTE: do NOT clear msg here; lets success messages persist after settlement
      }
    } catch (err) {
      const code = err?.response?.data?.code;
      if (err?.response?.status === 404 || code === 'ORDER_NOT_FOUND') {
        setMsg({ type: 'danger', text: 'Order not found.' });
      } else {
        setMsg({ type: 'danger', text: 'Unable to load order details.' });
      }
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const isAuthorized =
    !!details && (details.authorization?.outcome === 'SUCCESS' || details.order?.status === 'AUTHORIZED');

  const available = details?.availableToSettle ?? null;
  const hasRemaining = typeof available === 'number' ? available > 0 : false;

  const canSettle = isValidAmountForInput && !!details && isAuthorized && hasRemaining;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSettle) {
      if (!details) setMsg({ type: 'danger', text: 'Load order details before settling.' });
      else if (!isAuthorized) setMsg({ type: 'danger', text: 'Order is not authorized for settlement.' });
      else if (!hasRemaining) setMsg({ type: 'danger', text: 'There is no remaining amount to settle.' });
      return;
    }

    setLoading(true);
    // don't clear here; let success show even while details refresh
    try {
      const resp = await postSettlement({ orderId: orderId.trim(), amount: Number(amount) });
      const data = resp && resp.data ? resp.data : resp;
      const remaining = toMoney(data.availableToSettle).toFixed(2);

      const text =
        remaining === '0.00'
          ? `Order ${orderId.trim()} fully settled.`
          : `Settlement recorded. Remaining $${remaining}.`;
      setMsg({ type: 'success', text });

      // Refresh details AFTER setting success (and fetchDetails no longer clears msg)
      await fetchDetails(orderId);
      setAmount('');
    } catch (errObj) {
      const code = errObj?.response?.data?.code || 'SERVER_ERROR';
      const avail = errObj?.response?.data?.availableToSettle;
      let text = 'Something went wrong—try again.';

      if (code === 'AMOUNT_EXCEEDS_AVAILABLE') {
        text = `Amount exceeds available ($${toMoney(avail).toFixed(2)}).`;
      } else if (code === 'NO_APPROVED_AUTH') {
        text = 'No approved authorization found for this order.';
      } else if (code === 'ORDER_NOT_FOUND') {
        text = 'Order not found.';
        setDetails(null);
      } else if (code === 'INVALID_AMOUNT' || code === 'INVALID_AMOUNT_PRECISION') {
        text = 'Invalid amount. Use a positive number with ≤ 2 decimals.';
      }

      setMsg({ type: 'danger', text });
    } finally {
      setLoading(false);
    }
  };

  const handleFetchKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (orderId.trim()) fetchDetails(orderId.trim());
    }
  };

  const handleFetchClick = () => {
    if (orderId.trim()) fetchDetails(orderId.trim());
  };

  const onAmountChange = (e) => {
    let val = e.target.value;
    val = val.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) parts.splice(2);
    if (parts[1]?.length > 2) parts[1] = parts[1].slice(0, 2);
    val = parts.join('.');
    setAmount(val);
  };

  const outcomeBadgeClass = (outcome) => {
    const s = String(outcome || '').toUpperCase();
    if (s.includes('SETTLED') || s.includes('SUCCESS') || s.includes('AUTHORIZED')) return 'badge bg-success';
    if (s.includes('INSUFFICIENT')) return 'badge bg-warning';
    if (s.includes('INCORRECT') || s.includes('ERROR') || s.includes('SERVER')) return 'badge bg-danger';
    return 'badge bg-secondary';
  };

  return (
    <div>
      {msg && (
        <div className={`alert alert-${msg.type} text-center`} role="alert">
          {msg.text}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-2">
        <div className="mx-auto text-start" style={{ maxWidth: '420px' }}>
          <div className="mb-3">
            <label className="form-label" htmlFor="orderId">Order ID:</label>
            <div className="input-group">
              <input
                id="orderId"
                className="form-control"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                onKeyDown={handleFetchKey}
                placeholder="ORDER NUMBER"
              />
              <button
                type="button"
                className="btn btn-outline-light"
                onClick={handleFetchClick}
                disabled={detailsLoading || !orderId.trim()}
              >
                {detailsLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    Loading
                  </>
                ) : (
                  'Load'
                )}
              </button>
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label" htmlFor="amount">Amount:</label>
            <input
              id="amount"
              className="form-control"
              value={amount}
              onChange={onAmountChange}
              placeholder="00.00"
              inputMode="decimal"
            />
            <div className="form-text text-muted">Enter up to two decimals (e.g. 125.75)</div>
          </div>

          <div className="mb-3 small" style={{ minHeight: 18 }}>
            {!details && orderId.trim() && <span className="text-muted">Load order details to continue.</span>}
            {details && !isAuthorized && <span className="text-warning">Order is not authorized for settlement.</span>}
            {details && isAuthorized && !hasRemaining && (
              <span className="text-warning">Nothing left to settle for this order.</span>
            )}
          </div>

          <div className="d-grid">
            <button className="btn btn-dark btn-lg" type="submit" disabled={loading || !canSettle}>
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                'Settle'
              )}
            </button>
          </div>
        </div>
      </form>

      <hr className="hr-soft" />

      <h5 className="mb-2 text-center">Order Details</h5>
      <div className="card portal-card">
        <div className="card-body">
          {detailsLoading ? (
            <div className="d-flex align-items-center justify-content-center">
              <div className="spinner-border me-2" role="status" aria-hidden="true" />
              <span>Loading order details…</span>
            </div>
          ) : !details ? (
            <p className="text-muted mb-0 text-center">Enter an Order ID to view details.</p>
          ) : (
            <>
              <div className="row text-center">
                <div className="col-6">
                  <div className="text-muted small">Order ID</div>
                  <div className="fw-semibold">{details.order?.order_id}</div>
                </div>
                <div className="col-6">
                  <div className="text-muted small">Status</div>
                  <span className={`badge ${outcomeBadgeClass(details.order?.status || details.authorization?.outcome)}`}>
                    {details.order?.status || details.authorization?.outcome}
                  </span>
                </div>
              </div>

              <div className="mt-3 text-center">
                <div className="text-muted small">Card (last 4)</div>
                <div className="fw-semibold">**** **** **** {details.order?.card_last4 || '—'}</div>
              </div>

              <div className="mt-3 text-center">
                <div className="text-muted small">Authorized Amount</div>
                <div className="fw-semibold">
                  ${details.authorization?.amount?.toFixed?.(2) ?? details.order?.amount ?? '—'}
                </div>
              </div>

              <div className="mt-3 text-center">
                <div className="text-muted small">Available to Settle</div>
                <div className="display-6">
                  ${details.availableToSettle?.toFixed?.(2) ?? details.availableToSettle ?? 0}
                </div>
              </div>

              <div className="mt-3">
                <div className="text-muted small mb-2 text-center">Settlements</div>
                {!details.settlements || details.settlements.length === 0 ? (
                  <p className="text-muted mb-0 text-center">No settlements yet.</p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {details.settlements.map((s) => (
                      <li key={s.settlement_id || s.id} className="list-group-item d-flex justify-content-between">
                        <span>{new Date(s.created_at || s.createdAt).toLocaleString()}</span>
                        <span className="fw-semibold">${Number(s.amount).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
