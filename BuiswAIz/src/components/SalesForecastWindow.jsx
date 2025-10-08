// src/components/SalesForecastWindow.jsx
import React from "react";

export default function SalesForecastWindow({ forecast }) {
  const data = forecast ?? demoForecast;

  // Domain-aware title
  const domain = (data?.domain || "sales").toLowerCase();
  const title = /expense/.test(domain) ? "Expense Forecast" : "Sales Forecast";

  const periodLabel =
    data?.period?.label || buildPeriodLabel(data?.period?.start, data?.period?.end) || "Period";

  const k = data?.kpis ?? {};
  const peso = (n) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(n ?? 0);

  // Narrative sources:
  // 1) notes.narrative (string) – preferred
  // 2) narrative (array) – legacy
  const narrativeStr = typeof data?.notes?.narrative === "string" ? data.notes.narrative.trim() : "";
  const narrativeArr = Array.isArray(data?.narrative) ? data.narrative : [];

  return (
    <div className="pw-section" style={{ gridTemplateColumns: "1fr" }}>
      {/* Header */}
      <div className="pw-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div className="report-chip" style={{ marginTop: 6 }}>{periodLabel}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="pw-card" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
        <Kpi label={`Forecast (${k.horizon_days ?? "?"}d)`} value={peso(k.sum_forecast)} />
        {"last_7d_actual" in k && <Kpi label="Last 7d Actual" value={peso(k.last_7d_actual)} />}
        {"last_28d_actual" in k && <Kpi label="Last 28d Actual" value={peso(k.last_28d_actual)} />}
      </div>

      {/* Narrative */}
      {(narrativeStr || narrativeArr.length > 0) && (
        <div className="pw-card">
          <h4>Analyst Note</h4>
          {narrativeStr && <p style={{ marginTop: 8 }}>{narrativeStr}</p>}
          {!narrativeStr && narrativeArr.length > 0 && (
            <ul className="pw-list" style={{ marginTop: 8 }}>
              {narrativeArr.slice(0, 5).map((t, i) => <li key={i}><span>{t}</span></li>)}
            </ul>
          )}
        </div>
      )}

      {/* Forecast table (optional, if you have it) */}
      {Array.isArray(data?.series?.forecast) && data.series.forecast.length > 0 && (
        <div className="pw-card">
          <h4>Forecast (daily)</h4>
          <div className="sr-table" style={{ marginTop: 10 }}>
            <div className="sr-table-header">
              <div>Date</div>
              <div style={{ textAlign: "right" }}>Point</div>
              <div style={{ textAlign: "right" }}>Lower</div>
              <div style={{ textAlign: "right" }}>Upper</div>
            </div>
            <div className="sr-table-body">
              {data.series.forecast.map((d, i) => (
                <div key={i} className="sr-table-row">
                  <div>{d.date ?? "—"}</div>
                  <div style={{ textAlign: "right" }}>{peso(d.value)}</div>
                  <div style={{ textAlign: "right" }}>{("lower" in d) ? peso(d.lower) : "—"}</div>
                  <div style={{ textAlign: "right" }}>{("upper" in d) ? peso(d.upper) : "—"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="pw-kpi">
      <div className="pw-kpi-label">{label}</div>
      <div className="pw-kpi-value">{value}</div>
    </div>
  );
}

function buildPeriodLabel(start, end) {
  if (!start || !end) return null;
  try {
    const s = new Date(start), e = new Date(end);
    const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
    const left = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(s);
    const right = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(e);
    return sameYear ? `${left}–${right}` : `${left}, ${s.getUTCFullYear()}–${right}`;
  } catch { return null; }
}

const demoForecast = {
  domain: "sales",
  period: { label: "Oct 7–Nov 5, 2025" },
  kpis: {
    sum_forecast: 5394.98,
    last_7d_actual: 4733.0,
    last_28d_actual: 18855.12
  },
  notes: { narrative: "Projected totals reflect a steady mid-week lift consistent with recent patterns." }
};
