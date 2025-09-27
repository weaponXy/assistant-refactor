// src/budget/BudgetCenter.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { listExpensesByMonth } from "../api/expenses";
import {
  listBudgets,
  getBudgetHistory,
  upsertBudget,
  updateBudgetById,
} from "../services/budgetService";
import BudgetCategoryPie from "./BudgetCategoryPie";
import "./budget-history.css";

/* ---------- small helpers ---------- */
function currency(n, min = 2, max = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "₱0.00";
  return `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max })}`;
}
function fmtMonthLabel(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}
function ymFromISO(iso) {
  const [y, m] = iso.split("-").map(Number);
  return { yyyy: y, mm: m };
}

/* ---------- lightweight toast system (no deps) ---------- */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(1);

  function push(message, type = "success", ttl = 3000) {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, ttl);
  }

  const api = {
    success: (m, ttl) => push(m, "success", ttl),
    error: (m, ttl) => push(m, "error", ttl),
    info: (m, ttl) => push(m, "info", ttl),
  };

  return [toasts, api];
}

/* ---------- component ---------- */
export default function BudgetCenter({
  triggerLabel = "Budget",
  triggerClass = "btn primary", // you can override from expenses.jsx
}) {
  const [open, setOpen] = useState(false);

  // list & selection
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState("expenses");

  // add budget controls
  const [addOpen, setAddOpen] = useState(false);
  const [addMonth, setAddMonth] = useState(""); // YYYY-MM from <input type="month">
  const [addAmount, setAddAmount] = useState("");

  // edit budget controls
  const [editOpen, setEditOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [editMonth, setEditMonth] = useState(""); // YYYY-MM
  const [editAmount, setEditAmount] = useState("");

  // detail data
  const [detailLoading, setDetailLoading] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState("");

  // toasts
  const [toasts, toast] = useToasts();

  async function refreshBudgets() {
    setLoading(true);
    try {
      const rows = await listBudgets();
      setBudgets(rows);
      if (active) {
        const found = rows.find((b) => b.id === active.id);
        setActive(found || null);
      }
    } catch (e) {
      setErr(e.message || "Failed to load budgets");
      toast.error("Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) refreshBudgets();
  }, [open]);

  async function loadDetail(budget) {
    if (!budget) return;
    setDetailLoading(true);
    setErr("");
    try {
      const { yyyy, mm } = ymFromISO(budget.month_year);
      const exps = await listExpensesByMonth(yyyy, mm);
      const hist = await getBudgetHistory(budget.id);
      setExpenses(exps);
      setHistory(hist);
    } catch (e) {
      setErr(e.message || "Failed to load details");
      toast.error("Failed to load details");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (active) loadDetail(active);
  }, [active]);

  async function upsertBudget(monthYYYYMM, amount) {
    const iso = `${monthYYYYMM}-01`;
    const { error } = await supabase
      .from("budget")
      .upsert(
        { month_year: iso, monthly_budget_amount: Number(amount || 0) },
        { onConflict: ["month_year"] }
      );
    if (error) throw error;
  }

    async function onAddSubmit(e) {
    e.preventDefault();
    try {
        if (!addMonth) throw new Error("Select a month");
        await upsertBudget(addMonth, addAmount || 0); // trigger logs
        setAddOpen(false);
        setAddMonth("");
        setAddAmount("");
        await refreshBudgets();
        toast.success("Budget added");
    } catch (e2) {
        toast.error(e2.message || "Failed to add budget");
    }
    }


  function openEdit(b) {
    setEditingBudget(b);
    setEditOpen(true);
    setEditMonth(String(b.month_year).slice(0, 7)); // YYYY-MM
    setEditAmount(String(b.monthly_budget_amount ?? ""));
  }

    async function onEditSubmit(e) {
    e.preventDefault();
    if (!editingBudget) return;
    try {
        await updateBudgetById(editingBudget.id, editMonth, editAmount || 0); // trigger logs
        setEditOpen(false);
        setEditingBudget(null);
        await refreshBudgets();
        toast.success("Budget updated");
    } catch (e2) {
        toast.error(e2.message || "Failed to update budget");
    }
    }

    async function onDelete(b) {
    if (!window.confirm(`Delete budget for ${fmtMonthLabel(b.month_year)}? This will also remove its history.`)) return;

    try {
        // 1) delete children first (workaround for missing CASCADE)
        const delHist = await supabase.from("budgethistory").delete().eq("budget_id", b.id);
        if (delHist.error) {
        console.error("Delete history failed:", delHist.error);
        toast.error(delHist.error.message || "Failed to delete budget history");
        return;
        }

        // 2) delete parent
        const delBud = await supabase.from("budget").delete().eq("id", b.id);
        if (delBud.error) {
        console.error("Delete budget failed:", delBud.error);
        toast.error(delBud.error.message || "Failed to delete budget");
        return;
        }

        // clear detail if needed
        if (active?.id === b.id) {
        setActive(null);
        setExpenses([]);
        setHistory([]);
        }

        await refreshBudgets();
        toast.success("Budget deleted");
    } catch (e) {
        console.error(e);
        toast.error(e.message || "Failed to delete");
    }
    }


  const totals = useMemo(() => {
    const used = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const budgetAmt = Number(active?.monthly_budget_amount || 0);
    return { used, budgetAmt, remaining: Math.max(0, budgetAmt - used) };
  }, [expenses, active]);

  return (
    <>
      {/* Trigger button (styled via props) */}
      <button className={triggerClass} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {!open ? null : (
        <div className="modal-overlay" style={{ zIndex: 50 }}>
          <div className="modal" style={{ width: "min(980px, 94vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div className="header-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Budgets</h2>
              <button className="btn icon" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            {/* Add Budget */}
            <div className="add-budget-bar">
              {!addOpen ? (
                <button className="btn primary" onClick={() => setAddOpen(true)}>+ Add budget</button>
              ) : (
                <form onSubmit={onAddSubmit} className="add-budget-form">
                  <label className="stack">
                    <span className="muted">Month</span>
                    <input type="month" value={addMonth} onChange={(e) => setAddMonth(e.target.value)} required />
                  </label>
                  <label className="stack">
                    <span className="muted">Amount</span>
                    <input type="number" min="0" step="0.01" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} required />
                  </label>
                  <div className="actions">
                    <button type="submit" className="btn primary">Save</button>
                    <button type="button" className="btn outline" onClick={() => { setAddOpen(false); setAddMonth(""); setAddAmount(""); }}>Cancel</button>
                  </div>
                </form>
              )}
            </div>

            {/* List of months with budgets */}
            <div className="history-wrap" style={{ marginBottom: 16 }}>
              {loading ? (
                <p>Loading budgets…</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Month</th>
                      <th style={{ textAlign: "right" }}>Budget</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgets.map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => { setActive(b); setTab("expenses"); }}
                        style={{ cursor: "pointer" }}
                        title="Open"
                      >
                        <td>{fmtMonthLabel(b.month_year)}</td>
                        <td style={{ textAlign: "right" }}>{currency(b.monthly_budget_amount)}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(b); }}
                            className="btn xs"
                            title="Edit"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(b); }}
                            className="btn xs danger"
                            style={{ marginLeft: 8 }}
                            title="Delete"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!budgets.length && (
                      <tr><td colSpan="3" className="muted">No budgets yet. Add one above.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Detail for selected month */}
            {active && (
              <div className="history-wrap">
                <div className="budget-detail-header">
                  <h3 style={{ margin: 0 }}>{fmtMonthLabel(active.month_year)}</h3>
                  <div className="muted totals-inline">
                    <span>Budget: <strong>{currency(active.monthly_budget_amount)}</strong></span>
                    <span>Used: <strong>{currency(totals.used)}</strong></span>
                    <span>Remaining: <strong>{currency(totals.remaining)}</strong></span>
                  </div>
                </div>

                {/* Tabs */}
                <div className="tabs" style={{ marginTop: 10 }}>
                  <button className={tab === "expenses" ? "active" : ""} onClick={() => setTab("expenses")}>Expenses</button>
                  <button className={tab === "log" ? "active" : ""} onClick={() => setTab("log")}>Budget change log</button>
                  <button className={tab === "pie" ? "active" : ""} onClick={() => setTab("pie")}>Category Breakdown</button>
                </div>

                <div className="tab-body" style={{ marginTop: 12 }}>
                  {detailLoading && <p>Loading…</p>}

                  {!detailLoading && tab === "expenses" && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>Date</th>
                            <th style={{ textAlign: "left" }}>Category</th>
                            <th style={{ textAlign: "left" }}>Notes</th>
                            <th style={{ textAlign: "right" }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenses.map((e) => (
                            <tr key={e.id}>
                              <td>{new Date(e.occurred_on).toLocaleDateString()}</td>
                              <td>{e.category_path || "Uncategorized"}</td>
                              <td>{e.notes || ""}</td>
                              <td style={{ textAlign: "right" }}>{currency(e.amount)}</td>
                            </tr>
                          ))}
                          {!expenses.length && (
                            <tr><td colSpan="4" className="muted">No expenses for this month.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!detailLoading && tab === "log" && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>When</th>
                            <th style={{ textAlign: "right" }}>Old</th>
                            <th style={{ textAlign: "right" }}>New</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((h) => (
                            <tr key={h.id}>
                              <td>{new Date(h.created_at).toLocaleString()}</td>
                              <td style={{ textAlign: "right" }}>{currency(h.old_amount)}</td>
                              <td style={{ textAlign: "right" }}>{currency(h.new_amount)}</td>
                            </tr>
                          ))}
                          {!history.length && (
                            <tr><td colSpan="3" className="muted">No budget changes yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!detailLoading && tab === "pie" && (
                    <BudgetCategoryPie
                      expenses={expenses}
                      budgetAmount={active?.monthly_budget_amount}
                      monthLabel={fmtMonthLabel(active?.month_year)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Budget modal */}
      {editOpen && (
        <div className="modal-overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) setEditOpen(false); }}>
          <form className="modal" onSubmit={onEditSubmit}>
            <div className="modal-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ margin:0 }}>Edit Budget</h3>
              <button type="button" className="btn icon" onClick={()=>setEditOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="modal-body edit-budget-grid">
              <label className="stack">
                <span className="muted">Month</span>
                <input type="month" value={editMonth} onChange={(e)=>setEditMonth(e.target.value)} required />
              </label>
              <label className="stack">
                <span className="muted">Amount</span>
                <input type="number" min="0" step="0.01" value={editAmount} onChange={(e)=>setEditAmount(e.target.value)} required />
              </label>
            </div>
            <div className="modal-footer" style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button type="button" className="btn outline" onClick={()=>setEditOpen(false)}>Cancel</button>
              <button type="submit" className="btn primary">Save changes</button>
            </div>
          </form>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
