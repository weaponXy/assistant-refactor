// src/components/ExpensesWindow.jsx
import React, { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_ASSISTANT_URL;

// Helper for PHP currency
const peso = (n) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(n ?? 0));

// Simple SVG line chart (no external lib)
function LineChart({ data = [], width = 320, height = 80 }) {
  if (!Array.isArray(data) || data.length === 0) return <div style={{ height }}>No chart data</div>;
  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));
  const range = max - min || 1;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - 32) + 16;
    const y = height - 16 - ((d.value - min) / range) * (height - 32);
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} style={{ background: "#f8fafc", borderRadius: 8 }}>
      <polyline
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        points={points.join(" ")}
      />
      {data.map((d, i) => {
        const x = (i / (data.length - 1)) * (width - 32) + 16;
        const y = height - 16 - ((d.value - min) / range) * (height - 32);
        return <circle key={i} cx={x} cy={y} r={2.5} fill="#3b82f6" />;
      })}
    </svg>
  );
}

/**
 * Props:
 * - runId?: string   -> if present, loads that saved expense run; otherwise loads the latest expense report
 * - onClose?: () => void -> optional, for PopupWindow close button
 */
export default function ExpensesWindow({ runId = null, onClose }) {
  const [loading, setLoading] = useState(true);
  const [ui, setUi] = useState(null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // for Retry without full reload

  // ------- data fetch -------
  useEffect(() => {
    let abort = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        let uiSpec = null;

        if (runId) {
          // NOTE: singular "expense" (matches Program.cs)
          const r = await fetch(`${API_BASE}/api/reports/expense/by-id/${runId}`);
          if (!r.ok) {
            // try to surface server JSON error if available
            let msg = `by-id failed: ${r.status}`;
            try {
              const j = await r.json();
              msg = j?.message || j?.error || msg;
            } catch (err) {
              // swallow JSON parse issues, but keep something so ESLint won't flag the block
              if (import.meta.env?.DEV) console.debug("by-id error payload parse failed", err);
            }
            throw new Error(msg);
          }
          const j = await r.json();
          uiSpec = j.ui_spec ?? j.uiSpec ?? j.ui ?? null;
        } else {
          const r = await fetch(`${API_BASE}/api/reports/recent?domain=expenses&limit=1`);
          if (!r.ok) {
            let msg = `recent failed: ${r.status}`;
            try {
              const j = await r.json();
              msg = j?.message || j?.error || msg;
            } catch (err) {
              if (import.meta.env?.DEV) console.debug("recent error payload parse failed", err);
            }
            throw new Error(msg);
          }
          const j = await r.json();
          if (!Array.isArray(j) || j.length === 0) throw new Error("No recent expense reports");
          uiSpec = j[0]?.ui_spec ?? j[0]?.uiSpec ?? j[0]?.ui ?? null;
        }

        if (!abort) setUi(uiSpec);
      } catch (e) {
        if (!abort) setError(String(e?.message || e));
      } finally {
        if (!abort) setLoading(false);
      }
    }

    fetchData();
    return () => {
      abort = true;
    };
  }, [runId, refreshKey]);

  // ------- UI states -------
  if (loading) {
    return (
      <div className="pw-card pw-loader">
        <div className="sr-header sr-header--loading">
          <div className="sr-title">Loading Expense Report…</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="pw-card">
        <div className="sr-header">
          <h2 className="sr-title">Expense Report</h2>
        </div>
        <div className="sr-text">
          Error: {error}{" "}
          <button className="btn-ghost" onClick={() => setRefreshKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!ui) {
    return <div className="pw-card">No data.</div>;
  }

  // ------- Parse new JSON spec -------
  const title = ui.report_title ?? "Expense Report";
  const period = ui.period?.label ?? "";
  const charts = Array.isArray(ui.charts) ? ui.charts : [];
  const tables = ui.tables || {};
  const narratives = ui.narratives || {};

  // --- Dynamic Data Extraction ---
  // Line chart: daily expenses (support both .data and .series shapes)
  let lineChartData = [];
  const lineChart = charts.find((c) => c.type === "line");
  if (lineChart) {
    if (Array.isArray(lineChart.data)) {
      // [{label, value}]
      lineChartData = lineChart.data.map((d) => ({
        value: d.value ?? d.y ?? 0,
        label: d.label ?? d.x ?? ""
      }));
    } else if (Array.isArray(lineChart.series) && lineChart.series[0]?.points) {
      // [{series: [{points: [{x, y}]}]}]
      lineChartData = lineChart.series[0].points.map((pt) => ({
        value: pt.y ?? pt.value ?? 0,
        label: pt.x ?? pt.label ?? ""
      }));
    }
  }

  // Top Categories: support both {category} and {name}
  const topCategories = Array.isArray(tables.top_categories)
    ? tables.top_categories.map((row) => ({
        category: row.category ?? row.name ?? "",
        share_pct: row.share_pct ?? 0,
        amount: row.amount ?? 0
      }))
    : [];

  // Recent Transactions: support both {date} and {occurred_on} - NO NOTES
  // Recent Transactions: use recent_transactions from backend
  const recentTx = Array.isArray(tables.recent_transactions)
    ? tables.recent_transactions.map((row) => ({
        date: row.date ?? row.occurred_on ?? "",
        amount: row.amount ?? 0
      }))
    : [];

  // Summary narrative only
  const summaryNarr = Array.isArray(narratives.summary)
    ? narratives.summary.filter(Boolean).join(" ")
    : (narratives.summary || "");

  return (
    <div className="sr-root">
      {/* Header */}
      <div className="sr-header">
        <div className="sr-header-left">
          <button
            className="sr-back"
            onClick={() => (onClose ? onClose() : window.history.back())}
            aria-label="Close"
            title="Close"
          >
            ←
          </button>
          <h2 className="sr-title">{title}</h2>
        </div>
        {period && (
          <div className="sr-period">
            <i className="sr-period-icon">💸</i>
            <span>{period}</span>
          </div>
        )}
      </div>

      {/* 2-column grid - focused expense report */}
      <div className="sr-grid">
        {/* LEFT COL */}
        <div className="sr-col">
          {/* Line Chart */}
          <div className="sr-card">
            <div className="sr-card-title">Daily Expenses</div>
            {lineChartData.length > 0 ? (
              <LineChart data={lineChartData} />
            ) : (
              <div className="sr-text">No chart data available for this period</div>
            )}
          </div>

          {/* Top Categories */}
          <div className="sr-card">
            <div className="sr-card-title">Top Expense Categories</div>
            {topCategories.length === 0 ? (
              <div className="sr-text">No expense categories found for this period.</div>
            ) : (
              <ul className="sr-list">
                {topCategories.slice(0, 5).map((row, i) => (
                  <li key={i} className="sr-item">
                    <div className="sr-left">
                      <div className="sr-thumb sr-thumb-ph" />
                      <div className="sr-prod">
                        <div className="sr-name">{row.category ?? "—"}</div>
                        <div className="sr-units">{(Number(row.share_pct ?? 0)).toFixed(1)}% of total</div>
                      </div>
                    </div>
                    <div className="sr-right">
                      <span className="sr-rev-label">Amount</span>
                      <span className="sr-rev">{peso(row.amount ?? 0)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT COL */}
        <div className="sr-col">
          {/* Summary */}
          <div className="sr-card">
            <div className="sr-card-title">Expense Analysis</div>
            <div className="sr-text" style={{ lineHeight: '1.6' }}>
              {summaryNarr || "Generating expense analysis..."}
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="sr-card">
            <div className="sr-card-title">Recent Transactions</div>
            <div style={{ marginTop: 8 }}>
              <table className="sr-table recent-transactions-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Date</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTx.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ textAlign: "center", padding: "10px 0", color: "#888" }}>No recent transactions found.</td>
                    </tr>
                  ) : (
                    recentTx.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "6px 8px" }}>{r.date ?? "—"}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px" }}>{peso(r.amount ?? 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="sr-actions">
            <button className="btn-ghost" onClick={() => setRefreshKey(k => k + 1)}>
              Regenerate Report
            </button>
            <button className="btn-dark" onClick={() => alert("PDF export coming soon")}>
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
