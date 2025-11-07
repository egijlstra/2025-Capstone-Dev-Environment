// src/components/WarehouseSettlement.jsx
import { useMemo, useState } from 'react';
import { postSettlement, getOrderDetails } from '../lib/api.js'; // ensure .js for ESM

export default function WarehouseSettlement() {
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [msg, setMsg] = useState(null); // { type:'success'|'danger', text:'' }
  const [details, setDetails] = useState(null);

  const toMoney = (n) => Number(Number(n).toFixed(2));

  const isValid = useMemo(() => {
    if (!orderId.trim()) return false;
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return false;
    return Math.round(num * 100) === num * 100;
  }, [orderId, amount]);

  // Accept either axios response {data:...} or direct JSON
  const normalizeDetails = (resp) => (resp && resp.data ? resp.data : resp);

  const fetchDetails = async (id) => {
    setDetailsLoading(true);
    try {
      const resp = await getOrderDetails(id.trim());
      const normalized = normalizeDetails(resp);
      // If API returned a 404-like shape via successful promise, guard it
      if (!normalized || !normalized.order) {
        setDetails(null);
      } else {
        setDetails(normalized);
      }
    } catch (err) {
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setMsg(null);
    try {
      const resp = await postSettlement({ orderId: orderId.trim(), amount: Number(amount) });
      const data = resp && resp.data ? resp.data : resp;

      const remaining = toMoney(data.availableToSettle).toFixed(2);
      const text =
        remaining === '0.00'
          ? `Order ${orderId.trim()} fully settled.`
          : `Settlement recorded. Remaining $${remaining}.`;
      setMsg({ type: 'success', text });
      await fetchDetails(orderId);
      setAmount('');
    } catch (errObj) {
      const code = errObj?.response?.data?.code || 'SERVER_ERROR';
      const available = errObj?.response?.data?.availableToSettle;
      let text = 'Something went wrong—try again.';
      if (code === 'AMOUNT_EXCEEDS_AVAILABLE')
        text = `Amount exceeds available ($${toMoney(available).toFixed(2)}).`;
      if (code === 'NO_APPROVED_AUTH')
        text = 'No approved authorization found for this order.';
      if (code === 'ORDER_NOT_FOUND') text = 'Order not found.';
      if (code === 'INVALID_AMOUNT' || code === 'INVALID_AMOUNT_PRECISION')
        text = 'Invalid amount. Use a positive number with ≤ 2 decimals.';
      setMsg({ type: 'danger', text });
    } finally {
      setLoading(false);
    }
  };

  const onBlurOrder = async () => {
    if (orderId.trim()) await fetchDetails(orderId.trim());
  };

  return (
    <div>
      {msg && (
        <div className={`alert alert-${msg.type} text-center`} role="alert">
          {msg.text}
        </div>
      )}

      {/* CENTERED FORM BOX; contents are left-aligned */}
      <form onSubmit={onSubmit} className="mt-2">
        <div className="mx-auto text-start" style={{ maxWidth: '420px' }}>
          <div className="mb-3">
            <label className="form-label" htmlFor="orderId">Order ID:</label>
            <input
              id="orderId"
              className="form-control"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onBlur={onBlurOrder}
              placeholder="ORDER NUMBER"
            />
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="amount">Amount:</label>
            <input
              id="amount"
              className="form-control"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="00.00"
              inputMode="decimal"
            />
          </div>

          <div className="d-grid">
            <button
              className="btn btn-dark btn-lg"
              type="submit"
              disabled={loading || !isValid}
            >
              {loading ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  />
                  Submitting…
                </>
              ) : (
                'Settle'
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Divider */}
      <hr className="hr-soft" />

      {/* Order details */}
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
                  <div className="text-muted small">Authorized</div>
                  <div className="fw-semibold">
                    $
                    {details.authorization?.amount?.toFixed?.(2) ??
                      details.authorization?.amount ?? '—'}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-center">
                <div className="text-muted small">Available to Settle</div>
                <div className="display-6">
                  ${details.availableToSettle?.toFixed?.(2) ?? details.availableToSettle}
                </div>
              </div>

              <div className="mt-3">
                <div className="text-muted small mb-2 text-center">Settlements</div>
                {!details.settlements || details.settlements.length === 0 ? (
                  <p className="text-muted mb-0 text-center">No settlements yet.</p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {details.settlements.map((s) => (
                      <li
                        key={s.settlement_id || s.id}
                        className="list-group-item d-flex justify-content-between"
                      >
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
