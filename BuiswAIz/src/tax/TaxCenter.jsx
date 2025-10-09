// src/tax/TaxCenter.jsx
import React, { useEffect, useMemo, useState } from "react";
import { listTaxedExpensesBetween, monthBounds, yearBounds } from "../api/tax";
import "../stylecss/Dashboard/Dashboard.css";

function currency(n, min = 2, max = 2) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });
}

export default function TaxCenter({
  triggerLabel = "Tax",
  triggerClass = "btn primary",
}) {
  const [open, setOpen] = useState(false);

  // Filters
  const today = new Date();
  const defaultMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const [mode, setMode] = useState("month"); // 'month' | 'year' | 'custom'
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(String(today.getUTCFullYear()));
  const [customStart, setCustomStart] = useState(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 10));
  const [taxFilter, setTaxFilter] = useState("ALL"); // 'ALL' | 'VAT' | 'PERCENTAGE_TAX' | 'NONE'

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  async function load() {
    setLoading(true);
    try {
      let start, end;
      if (mode === "month") ({ start, end } = monthBounds(month));
      else if (mode === "year") ({ start, end } = yearBounds(year));
      else { start = customStart; end = customEnd; }
      const data = await listTaxedExpensesBetween(start, end);
      const filtered = (taxFilter === "ALL") ? data : data.filter(r => (r.tax_json?.type === taxFilter));
      setRows(filtered);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, mode, month, year, customStart, customEnd, taxFilter]);

  // Summaries
  const summary = useMemo(() => {
    const s = {
      count: rows.length,
      totalGross: 0,
      totalNet: 0,
      totalTax: 0,
      byType: {
        VAT: { count: 0, tax: 0, gross: 0 },
        PERCENTAGE_TAX: { count: 0, tax: 0, gross: 0 },
        NONE: { count: 0, tax: 0, gross: 0 },
      },
    };
    for (const r of rows) {
      const t = r.tax_json || {};
      s.totalGross += Number(t.gross || 0);
      s.totalNet   += Number(t.net || 0);
      s.totalTax   += Number(t.tax || 0);
      if (t.type && s.byType[t.type]) {
        s.byType[t.type].count++;
        s.byType[t.type].tax += Number(t.tax || 0);
        s.byType[t.type].gross += Number(t.gross || 0);
      }
    }
    return s;
  }, [rows]);

  function exportCSV() {
    const cols = ["Date", "Type", "Rate", "Inclusive", "Net", "Tax", "Gross", "Withholding", "Category", "Contact", "Notes", "AmountPaid", "ExpenseId"];
    const lines = [cols.join(",")];
    for (const r of rows) {
      const t = r.tax_json || {};
      const vals = [
        r.occurred_on,
        t.type ?? "",
        (typeof t.rate === "number" ? t.rate : ""),
        t.is_inclusive ? "Yes" : "No",
        Number(t.net || 0).toFixed(2),
        Number(t.tax || 0).toFixed(2),
        Number(t.gross || 0).toFixed(2),
        Number(t.withholding || 0).toFixed(2),
        r.category_path ?? "",
        (r.contact_name ?? ""),
        String(r.notes ?? "").replace(/"/g, '""'),
        Number(r.amount || 0).toFixed(2),
        r.id,
      ];
      const escaped = vals.map(v => typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : String(v));
      lines.push(escaped.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button className={triggerClass} onClick={() => setOpen(true)}>{triggerLabel}</button>
      {!open ? null : (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 1100, width: "95vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Tax Summary</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={exportCSV}>Export CSV</button>
                <button className="icon-btn" onClick={() => setOpen(false)}>✕</button>
              </div>
            </div>

            {/* Filters */}
            <div className="fields-grid" style={{ marginTop: 8 }}>
              <div className="field">
                <label>Mode</label>
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {mode === "month" && (
                <div className="field">
                  <label>Month</label>
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
              )}

              {mode === "year" && (
                <div className="field">
                  <label>Year</label>
                  <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
              )}

              {mode === "custom" && (
                <>
                  <div className="field">
                    <label>From</label>
                    <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>To</label>
                    <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                  </div>
                </>
              )}

              <div className="field">
                <label>Tax Type</label>
                <select value={taxFilter} onChange={(e) => setTaxFilter(e.target.value)}>
                  <option value="ALL">All</option>
                  <option value="PERCENTAGE_TAX">Percentage Tax</option>
                  <option value="VAT">VAT</option>
                  <option value="NONE">No Tax</option>
                </select>
              </div>

              <div className="field" style={{ alignSelf: "end" }}>
                <button className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 12 }}>
              <div className="card small">
                <div className="muted">Total Gross</div>
                <div className="h3">₱ {currency(summary.totalGross)}</div>
              </div>
              <div className="card small">
                <div className="muted">Total Net</div>
                <div className="h3">₱ {currency(summary.totalNet)}</div>
              </div>
              <div className="card small">
                <div className="muted">Total Tax</div>
                <div className="h3">₱ {currency(summary.totalTax)}</div>
              </div>
              <div className="card small">
                <div className="muted">Records</div>
                <div className="h3">{summary.count}</div>
              </div>
            </div>

            {/* Breakdown by type */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 12 }}>
              {["PERCENTAGE_TAX", "VAT", "NONE"].map(t => (
                <div className="card small" key={t}>
                  <div className="muted">{t.replace("_", " ")}</div>
                  <div>Count: {summary.byType[t].count}</div>
                  <div>Tax: ₱ {currency(summary.byType[t].tax)}</div>
                  <div>Gross: ₱ {currency(summary.byType[t].gross)}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ marginTop: 16, maxHeight: "50vh", overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Rate</th><th>Incl</th><th>Net</th><th>Tax</th><th>Gross</th><th>Withhold</th><th>Category</th><th>Contact</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const t = r.tax_json || {};
                    return (
                      <tr key={r.id}>
                        <td>{r.occurred_on}</td>
                        <td>{t.type || ""}</td>
                        <td>{typeof t.rate === "number" ? t.rate : ""}</td>
                        <td>{t.is_inclusive ? "✓" : ""}</td>
                        <td style={{ textAlign: "right" }}>{Number(t.net || 0).toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>{Number(t.tax || 0).toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>{Number(t.gross || 0).toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>{Number(t.withholding || 0).toFixed(2)}</td>
                        <td>{r.category_path || ""}</td>
                        <td>{r.contact_name || ""}</td>
                        <td>{r.notes || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
