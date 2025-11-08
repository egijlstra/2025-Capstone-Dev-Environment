// src/components/OrderHistory.jsx
import { useEffect, useMemo, useState } from 'react';
import { listOrders } from '../lib/api.js';

// Map status → badge class using your existing visual cues
function badgeClass(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'AUTHORIZED' || s === 'SUCCESS') return 'badge bg-success';
  if (s === 'SETTLED') return 'badge bg-primary';
  if (s === 'PENDING') return 'badge bg-secondary';
  if (s === 'ERROR') return 'badge bg-danger';
  return 'badge bg-secondary';
}

// helpers
const cmpStr = (a = '', b = '') => a.localeCompare(b, undefined, { sensitivity: 'base' });
const cmpNum = (a = 0, b = 0) => a - b;
const cmpDate = (a, b) => {
  const da = a ? new Date(a).getTime() : 0;
  const db = b ? new Date(b).getTime() : 0;
  return da - db;
};

export default function OrderHistory() {
  const [tab, setTab] = useState('current'); // "current" | "past"
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('date');   // default sort by date
  const [sortDir, setSortDir] = useState('desc');   // 'asc' | 'desc'

  // Load orders once from backend
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const resp = await listOrders({});
        const body = resp && resp.data ? resp.data : resp;

        const raw = Array.isArray(body) ? body : body?.data || [];
        if (!mounted) return;

        const mapped = raw.map((o) => ({
          id: o.order_id || o.id,
          orderNumber: o.order_id || o.order_number || o.id,
          date: o.created_at || o.date,
          total: o.amount ?? o.total ?? 0,
          status: o.status,
          customer: o.customer_name || '',
          cardLast4: o.card_last4 || o.cardLast4 || '',
        }));

        setOrders(mapped);
      } catch (e) {
        console.error('Failed to load orders', e);
        if (!mounted) return;
        setError('Unable to load orders from the server.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const formatMoney = (n) => `$${Number(n ?? 0).toFixed(2)}`;
  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  };

  // Filter + search + sort derived list
  const filteredAndSorted = useMemo(() => {
    const currentStatuses = new Set(['PENDING', 'AUTHORIZED']);
    const pastStatuses = new Set(['SETTLED', 'ERROR']);

    let rows = [...orders];

    // Tab filter (current vs past)
    rows = rows.filter((o) => {
      const s = String(o.status || '').toUpperCase();
      if (tab === 'current') return currentStatuses.has(s);
      return pastStatuses.has(s);
    });

    // Text search (order #, customer, status)
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((o) => {
        return (
          String(o.orderNumber || '').toLowerCase().includes(needle) ||
          String(o.customer || '').toLowerCase().includes(needle) ||
          String(o.status || '').toLowerCase().includes(needle)
        );
      });
    }

    // Sort
    const dirSign = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let delta = 0;
      switch (sortKey) {
        case 'orderNumber':
          delta = cmpStr(String(a.orderNumber), String(b.orderNumber));
          break;
        case 'customer':
          delta = cmpStr(String(a.customer), String(b.customer));
          break;
        case 'date':
          delta = cmpDate(a.date, b.date);
          break;
        case 'total':
          delta = cmpNum(Number(a.total || 0), Number(b.total || 0));
          break;
        case 'status':
          delta = cmpStr(String(a.status), String(b.status));
          break;
        default:
          delta = cmpDate(a.date, b.date);
      }
      return dirSign * delta;
    });

    return rows;
  }, [orders, tab, search, sortKey, sortDir]);

  // Sort header click handler — simple + reliable toggle
  const handleSort = (key) => {
    if (sortKey === key) {
      // Same column: just flip direction
      setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
    } else {
      // New column: set key and reset to ascending
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // CSV export of current filtered + sorted list
  const handleExportCsv = () => {
    if (!filteredAndSorted.length) return;

    const header = [
      'Order ID',
      'Customer',
      'Date',
      'Total',
      'Status',
      'Card Last4',
    ];

    const rows = filteredAndSorted.map((o) => [
      o.orderNumber || '',
      o.customer || '',
      formatDate(o.date),
      Number(o.total ?? 0).toFixed(2),
      o.status || '',
      o.cardLast4 ? `****${o.cardLast4}` : '',
    ]);

    const escapeCell = (val) => {
      const s = String(val ?? '');
      const escaped = s.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvLines = [
      header.map(escapeCell).join(','),
      ...rows.map((r) => r.map(escapeCell).join(',')),
    ];

    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `orders-export-${tab}-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderSortIcon = (key) => {
    if (sortKey !== key) return null;
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="container py-4">
      <div className="panel mb-3">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Orders</h2>
            <p className="panel-description">
              View current and past orders with their payment status.
            </p>
          </div>
        </div>

        {/* Tabs: Current vs Past */}
        <ul className="nav nav-pills mb-3">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${tab === 'current' ? 'active' : ''}`}
              onClick={() => setTab('current')}
            >
              Current
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${tab === 'past' ? 'active' : ''}`}
              onClick={() => setTab('past')}
            >
              Past
            </button>
          </li>
        </ul>

        {/* Search + Export row */}
        <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-2">
          <div style={{ maxWidth: 320, width: '100%' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search by order, customer, or status"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-outline-light btn-sm"
            onClick={handleExportCsv}
            disabled={!filteredAndSorted.length}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="card portal-card">
        <div className="card-body">
          {loading ? (
            <div className="d-flex align-items-center justify-content-center py-4">
              <div className="spinner-border me-2" role="status" aria-hidden="true" />
              <span>Loading orders…</span>
            </div>
          ) : error ? (
            <div className="alert alert-danger mb-0">{error}</div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="text-center text-muted py-4">
              No {tab === 'current' ? 'current' : 'past'} orders to display.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover order-history-table">
                <thead>
                  <tr>
                    <th
                      className="sortable-header"
                      onClick={() => handleSort('orderNumber')}
                      style={{ cursor: 'pointer' }}
                    >
                      Order #{renderSortIcon('orderNumber')}
                    </th>
                    <th
                      className="sortable-header"
                      onClick={() => handleSort('customer')}
                      style={{ cursor: 'pointer' }}
                    >
                      Customer{renderSortIcon('customer')}
                    </th>
                    <th
                      className="sortable-header"
                      onClick={() => handleSort('date')}
                      style={{ cursor: 'pointer' }}
                    >
                      Date{renderSortIcon('date')}
                    </th>
                    <th
                      className="sortable-header"
                      onClick={() => handleSort('total')}
                      style={{ cursor: 'pointer' }}
                    >
                      Total{renderSortIcon('total')}
                    </th>
                    <th
                      className="sortable-header"
                      onClick={() => handleSort('status')}
                      style={{ cursor: 'pointer' }}
                    >
                      Status{renderSortIcon('status')}
                    </th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((o) => (
                    <tr key={o.id || o.orderNumber}>
                      <td className="fw-semibold">{o.orderNumber}</td>
                      <td>{o.customer || '—'}</td>
                      <td>{formatDate(o.date)}</td>
                      <td>{formatMoney(o.total)}</td>
                      <td>
                        <span className={badgeClass(o.status)}>{o.status}</span>
                      </td>
                      <td className="text-muted">
                        {o.cardLast4 ? <>•••• {o.cardLast4}</> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
