import React, { useEffect, useState, useMemo } from "react";

const API_BASE = import.meta.env.VITE_API_ASSISTANT_URL

/**
 * Props:
 * - runId?: string  -> if present, loads that saved run; otherwise loads latest sales report
 */
export default function SalesWindow({ runId = null }) {
  const [loading, setLoading] = useState(true);
  const [ui, setUi] = useState(null);
  const [error, setError] = useState(null);

  // fetch once
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        let uiSpec;
        if (runId) {
          const r = await fetch(`${API_BASE}/api/reports/sales/by-id/${runId}`);
          if (!r.ok) throw new Error(`by-id failed: ${r.status}`);
          const j = await r.json();
          uiSpec = j.ui_spec ?? j.uiSpec ?? j?.ui ?? null;
        } else {
          const r = await fetch(`${API_BASE}/api/reports/recent?domain=sales&limit=1`);
          if (!r.ok) throw new Error(`recent failed: ${r.status}`);
          const j = await r.json();
          if (!Array.isArray(j) || j.length === 0) throw new Error("No recent reports");
          uiSpec = j[0]?.ui_spec ?? j[0]?.uiSpec ?? j[0]?.ui ?? null;
        }

        if (!abort) setUi(uiSpec);
      } catch (e) {
        if (!abort) setError(String(e?.message || e));
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true; };
  }, [runId]);

  // Prepare lightweight chart data with useMemo (must be declared before any early return)
  const chartData = useMemo(() => {
    if (!ui) return null;
    const chart0 = Array.isArray(ui.charts) && ui.charts.length > 0 ? ui.charts[0] : null;
    if (!chart0 || !Array.isArray(chart0.series) || chart0.series.length === 0) return null;

    const normSeries = chart0.series.map((s) => {
      const pts = Array.isArray(s.points) ? s.points : Array.isArray(s.data) ? s.data : [];
      const mapped = pts.map((pt, i) => {
        if (Array.isArray(pt)) {
          // [x, y]
          return { x: i, y: Number(pt[1] ?? 0) };
        }
        return { x: i, y: Number(pt?.y ?? 0) };
      });
      return { name: s.name || "Series", style: s.style || "", pts: mapped };
    });

    const allY = normSeries.flatMap(s => s.pts.map(p => p.y));
    const maxY = Math.max(1, ...allY);
    const minY = Math.min(0, ...allY);
    const count = Math.max(...normSeries.map(s => s.pts.length));
    const pad = 24;
    const w = 600, h = 300;

    function toXY(i, y) {
      const x = pad + (count <= 1 ? 0 : (w - pad * 2) * (i / (count - 1)));
      const yNorm = (y - minY) / (maxY - minY || 1);
      const yy = h - pad - yNorm * (h - pad * 2);
      return [x, yy];
    }

    const paths = normSeries.map((s) => {
      if (s.pts.length === 0) return { name: s.name, d: "", dashed: s.style === "dashed" };
      const d = s.pts.map((p, i) => {
        const [x, y] = toXY(i, p.y);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ");
      return { name: s.name, d, dashed: s.style === "dashed" };
    });

    return { w, h, pad, paths, legend: chart0.series.map(s => ({ name: s.name, dashed: s.style === "dashed" })) };
  }, [ui]);

  // Early returns AFTER hooks are declared
  if (loading) return <div className="pw-card pw-loader">Loading…</div>;
  if (error)   return <div className="pw-card">Error: {error}</div>;
  if (!ui)     return <div className="pw-card">No data.</div>;

  // Unpack spec for rendering
  const title = ui.report_title ?? "Sales Report";
  const period = ui.period?.label ?? "";
  const narratives = ui.narratives ?? {};
  const performanceTxt = narratives.performance || "";
  const trendsTxt      = narratives.trends || "";
  const tipTxt         = narratives.best_sellers_tips || "";

  const kpis   = Array.isArray(ui.kpis) ? ui.kpis : [];
  const cards  = Array.isArray(ui.cards) ? ui.cards : [];
  const topItems = (cards[0]?.items ?? []).slice(0, 3);

  const peso = (n) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n ?? 0);

  return (
    <div className="sr-root">
      {/* Header */}
      <div className="sr-header">
        <button className="sr-back" onClick={() => window.history.back()} aria-label="Back">←</button>
        <h2 className="sr-title">{title}</h2>
        {period && (
          <div className="sr-period">
            <i className="sr-period-icon">📊</i>
            <span>{period}</span>
          </div>
        )}
      </div>

      {/* 2-column content */}
      <div className="sr-grid">
        <div className="sr-col">
          {/* Sales Performance Overview */}
          <div className="sr-card">
            <div className="sr-card-title">Sales Performance Overview</div>
            <p className="sr-text">
              {performanceTxt || "No performance narrative available for this period."}
            </p>
          </div>

          {/* Best-Selling Products */}
          <div className="sr-card">
            <div className="sr-card-title">Best-Selling Products</div>
            {tipTxt && <div className="sr-sub">{tipTxt}</div>}
            <ul className="sr-list">
              {topItems.length === 0 && <li className="sr-item">No products.</li>}
              {topItems.map((p, i) => (
                <li key={i} className="sr-item">
                  <div className="sr-left">
                    <div className="sr-thumb sr-thumb-ph" />
                    <div className="sr-prod">
                      <div className="sr-name">{p.product}</div>
                      <div className="sr-units">{Number(p.units ?? 0)} pcs sold</div>
                    </div>
                  </div>
                  <div className="sr-right">
                    <span className="sr-rev-label">Revenue</span>
                    <span className="sr-rev">{peso(p.amount ?? 0)}</span>
                    <span className="sr-share">{(Number(p.share_pct ?? 0)).toFixed(1)}% of sales</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sr-col">
          {/* Sales Trends narrative */}
          <div className="sr-card">
            <div className="sr-card-title">Sales Trends</div>
            <p className="sr-text">
              {trendsTxt || "Trend details are unavailable for this period."}
            </p>
          </div>

          {/* Line chart */}
          <div className="sr-card sr-chart">
            <div className="sr-chart-inner">
              {!chartData || chartData.paths.every(p => !p.d) ? (
                <div className="sr-chart-placeholder">No trend data</div>
              ) : (
                <svg width={chartData.w} height={chartData.h} viewBox={`0 0 ${chartData.w} ${chartData.h}`}>
                  {/* axes */}
                  <line x1="24" y1={chartData.h - 24} x2={chartData.w - 24} y2={chartData.h - 24} stroke="#dbe4f0" />
                  <line x1="24" y1="24" x2="24" y2={chartData.h - 24} stroke="#dbe4f0" />

                  {/* series paths */}
                  {chartData.paths.map((p, i) => (
                    <path
                      key={i}
                      d={p.d}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="2"
                      style={p.dashed ? { strokeDasharray: "6 6" } : undefined}
                    />
                  ))}
                  /* NEW: draw point markers so single-point series are visible */
                  {chartData.paths.map((p, i) => (
                    <g key={`pts-${i}`}>
                      {chartData.legend[i] && ui.charts?.[0]?.series?.[i]?.points?.map((pt, idx) => {
                        const y = Array.isArray(pt) ? Number(pt[1] ?? 0) : Number(pt?.y ?? 0);
                        const xIndex = idx;
                        // Recompute XY exactly like in useMemo
                        const count = Math.max(...ui.charts[0].series.map(s => (s.points?.length || s.data?.length || 0)));
                        const pad = 24; const w = 600; const h = 300;
                        const seriesAllY = ui.charts[0].series.flatMap(s => (s.points || s.data || []).map(q => Array.isArray(q) ? Number(q[1] ?? 0) : Number(q?.y ?? 0)));
                        const maxY = Math.max(1, ...seriesAllY);
                        const minY = Math.min(0, ...seriesAllY);
                        const X = pad + (count <= 1 ? 0 : (w - pad * 2) * (xIndex / (count - 1)));
                        const yNorm = (y - minY) / (maxY - minY || 1);
                        const Y = h - pad - yNorm * (h - pad * 2);
                        return <circle key={idx} cx={X} cy={Y} r="3" fill="#2563eb" />;
                      })}
                    </g>
                  ))}
                </svg>
              )}
            </div>

            {/* Legend */}
            {chartData?.legend?.length > 0 && (
              <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                {chartData.legend.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                    <span style={{
                      width: 18, height: 2, background: s.dashed ? "transparent" : "#2563eb",
                      borderTop: s.dashed ? "2px dashed #2563eb" : "none"
                    }} />
                    {s.name || (i === 0 ? "This period" : "Prior period")}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="sr-actions">
            <button className="btn-ghost" onClick={() => alert("Regenerate coming soon")}>Regenerate Report</button>
            <button className="btn-dark"  onClick={() => alert("PDF export coming soon")}>Download PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}
