// src/components/ExpensesWindow.jsx
import React, { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_ASSISTANT_URL

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
          const r = await fetch(`${API_BASE}/api/reports/expenses/by-id/${runId}`);
          if (!r.ok) throw new Error(`by-id failed: ${r.status}`);
          const j = await r.json();
          uiSpec = j.ui_spec ?? j.uiSpec ?? j.ui ?? null;
        } else {
          const r = await fetch(`${API_BASE}/api/reports/recent?domain=expenses&limit=1`);
          if (!r.ok) throw new Error(`recent failed: ${r.status}`);
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

  // ------- helpers -------
  const peso = (n) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(n ?? 0));

  const findSection = (id) => {
    const sections = Array.isArray(ui?.sections) ? ui.sections : [];
    return sections.find((s) => s.id === id) ?? null;
  };

  const statItems = (section) => {
    const cards = Array.isArray(section?.cards) ? section.cards : [];
    const statCard = cards.find((c) => c.type === "stat");
    return Array.isArray(statCard?.items) ? statCard.items : [];
  };

  const tableItems = (section, titleMatch) => {
    const cards = Array.isArray(section?.cards) ? section.cards : [];
    const tbl = cards.find((c) => c.type === "table" && (!titleMatch || c.title === titleMatch));
    return Array.isArray(tbl?.items) ? tbl.items : [];
  };

  const tipsBullets = (section) => {
    const cards = Array.isArray(section?.cards) ? section.cards : [];
    const tips = cards.find((c) => c.type === "tips");
    return Array.isArray(tips?.bullets) ? tips.bullets : [];
  };

  // ------- section bindings -------
  const overview = findSection("expense_overview");
  const topcats = findSection("expense_top_categories");
  const spikes = findSection("expense_spikes");

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

  const title = ui.report_title ?? "Expense Report";
  const period = ui.period?.label ?? "";

  // Overview content (no budget fields)
  const overviewNarr = Array.isArray(overview?.narrative) ? overview.narrative.join(" ") : "";
  const overviewStats = statItems(overview);
  const totalItem = overviewStats.find((i) => i?.label?.toLowerCase?.() === "total expenses");
  const priorTotalItem = overviewStats.find((i) => i?.label?.toLowerCase?.() === "prior period total");

  // Top categories & tips
  const topTable = tableItems(topcats, "Top Categories");
  const tips = tipsBullets(topcats);
  const topN = topTable.slice(0, 5);

  // Spikes
  const spikesNarr = Array.isArray(spikes?.narrative) ? spikes.narrative : [];
  const spikesRows = tableItems(spikes, "Flagged Spikes");

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

      {/* 2-column grid (same vibe as SalesWindow) */}
      <div className="sr-grid">
        {/* LEFT COL */}
        <div className="sr-col">
          {/* Spending Overview */}
          <div className="sr-card">
            <div className="sr-card-title">Spending Overview</div>
            <p className="sr-text">{overviewNarr || "No overview available for this period."}</p>

            {totalItem && (
              <div className="sr-stats">
                <div className="sr-stat">
                  <div className="sr-stat-label">Total Expenses</div>
                  <div className="sr-stat-value">{peso(totalItem.value)}</div>
                </div>
                {priorTotalItem && Number(priorTotalItem.value) > 0 && (
                  <div className="sr-stat">
                    <div className="sr-stat-label">Prior Period Total</div>
                    <div className="sr-stat-value">{peso(priorTotalItem.value)}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top Categories & Saving Tips */}
          <div className="sr-card">
            <div className="sr-card-title">Top Categories</div>
            {topN.length === 0 ? (
              <div className="sr-text">No category breakdown for this period.</div>
            ) : (
              <ul className="sr-list">
                {topN.map((row, i) => (
                  <li key={i} className="sr-item">
                    <div className="sr-left">
                      <div className="sr-thumb sr-thumb-ph" />
                      <div className="sr-prod">
                        <div className="sr-name">{row.category ?? "—"}</div>
                        <div className="sr-units">{(Number(row.share_pct ?? 0)).toFixed(1)}% share</div>
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

            {tips.length > 0 && (
              <>
                <div className="sr-sub" style={{ marginTop: 12 }}>
                  Saving Tips / Ideas
                </div>
                <ul className="sr-bullets">
                  {tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* RIGHT COL */}
        <div className="sr-col">
          {/* Anomalies & Spikes */}
          <div className="sr-card">
            <div className="sr-card-title">Anomalies & Spikes</div>

            {spikesNarr.length > 0 ? (
              <ul className="sr-bullets">
                {spikesNarr.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="sr-text">No anomalies detected for this period.</p>
            )}

            <div className="sr-table" style={{ marginTop: 12 }}>
              <div className="sr-table-header">
                <div>Week</div>
                <div>Category</div>
                <div style={{ textAlign: "right" }}>Amount</div>
              </div>
              <div className="sr-table-body">
                {spikesRows.length === 0 && (
                  <div className="sr-table-row">
                    <div>—</div>
                    <div>—</div>
                    <div style={{ textAlign: "right" }}>—</div>
                  </div>
                )}
                {spikesRows.map((r, i) => (
                  <div key={i} className="sr-table-row">
                    <div>{r.week ?? "—"}</div>
                    <div>{r.category ?? "—"}</div>
                    <div style={{ textAlign: "right" }}>{peso(r.amount ?? 0)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="sr-actions">
            <button className="btn-ghost" onClick={() => alert("Regenerate coming soon")}>
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